"""klisk deploy — deploy to Google Cloud Run."""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path
from typing import Optional

import typer

from klisk.cli import ui
from klisk.core.paths import resolve_project


def _slugify(name: str) -> str:
    """Convert a project name to a valid Cloud Run service name."""
    slug = re.sub(r"[^a-z0-9-]", "-", name.lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "klisk-agent"


def _run_gcloud(args: list[str], timeout: int = 15) -> subprocess.CompletedProcess:
    """Run a gcloud command and return the result."""
    return subprocess.run(
        ["gcloud"] + args,
        capture_output=True, text=True, timeout=timeout,
    )


def _check_gcloud_installed() -> None:
    """Check that gcloud CLI is installed."""
    if not shutil.which("gcloud"):
        ui.error("Google Cloud CLI (gcloud) not found.")
        ui.plain()
        ui.dim("Install it:")
        ui.dim("  macOS:   brew install google-cloud-sdk")
        ui.dim("  Other:   https://cloud.google.com/sdk/docs/install")
        raise typer.Exit(1)


def _check_gcloud_auth() -> None:
    """Check that the user is authenticated with gcloud."""
    try:
        result = _run_gcloud(["auth", "print-access-token"])
        if result.returncode != 0:
            stderr = result.stderr.strip()
            if "login" in stderr.lower() or "no access token" in stderr.lower() or "ERROR" in stderr:
                ui.error("Not authenticated with Google Cloud.")
                ui.plain()
                ui.dim("Run this command and follow the browser prompt:")
                ui.dim("  gcloud auth login")
                raise typer.Exit(1)
    except subprocess.TimeoutExpired:
        ui.error("gcloud auth check timed out.")
        raise typer.Exit(1)


def _check_gcloud_project(gcp_project: str | None, config_project: str = "") -> str:
    """Resolve and validate the GCP project ID.

    Resolution order: CLI flag → global config → gcloud default.
    """
    if gcp_project:
        return gcp_project

    if config_project:
        return config_project

    try:
        result = _run_gcloud(["config", "get-value", "project"])
        project_id = result.stdout.strip()
    except subprocess.TimeoutExpired:
        project_id = ""

    if not project_id or project_id == "(unset)":
        ui.error("No Google Cloud project configured.")
        ui.plain()
        ui.dim("If you already have a GCP project:")
        ui.dim("  gcloud config set project YOUR_PROJECT_ID")
        ui.plain()
        ui.dim("If you don't have one yet:")
        ui.dim("  1. Go to https://console.cloud.google.com")
        ui.dim("  2. Create a new project")
        ui.dim("  3. Run: gcloud config set project YOUR_PROJECT_ID")
        raise typer.Exit(1)

    return project_id


def _check_billing(gcp_project: str) -> None:
    """Check if billing is enabled for the GCP project."""
    try:
        result = _run_gcloud([
            "billing", "projects", "describe", gcp_project,
            "--format", "value(billingEnabled)",
        ], timeout=15)
        enabled = result.stdout.strip().lower()
        if enabled == "false":
            ui.error(f"Billing is not enabled for project '{gcp_project}'.")
            ui.plain()
            ui.dim("Cloud Run requires billing. Enable it at:")
            ui.dim(f"  https://console.cloud.google.com/billing?project={gcp_project}")
            ui.plain()
            ui.dim("Note: Google Cloud offers $300 in free credits for new accounts.")
            raise typer.Exit(1)
    except subprocess.TimeoutExpired:
        pass  # Non-critical, let the deploy fail with a clearer error if needed
    except typer.Exit:
        raise
    except Exception:
        pass  # billing API might not be available, skip gracefully


REQUIRED_APIS = [
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
]


def _ensure_apis(gcp_project: str) -> None:
    """Enable all required APIs, prompting if any are missing."""
    try:
        result = _run_gcloud([
            "services", "list",
            "--project", gcp_project,
            "--format", "value(config.name)",
        ], timeout=20)
        enabled = set(result.stdout.strip().splitlines())
        missing = [api for api in REQUIRED_APIS if api not in enabled]

        if not missing:
            return

        names = ", ".join(missing)
        ui.warning(f"Required APIs not enabled: {names}")
        ui.plain()
        enable = typer.confirm("  Enable them now?", default=True)
        if not enable:
            ui.error("These APIs are required for deployment.")
            ui.dim("Enable them manually:")
            ui.dim(f"  gcloud services enable {' '.join(missing)}")
            raise typer.Exit(1)

        with ui.spinner("Enabling APIs"):
            enable_result = subprocess.run(
                ["gcloud", "services", "enable", *missing, "--project", gcp_project],
                capture_output=True, text=True, timeout=120,
            )
        if enable_result.returncode != 0:
            ui.error("Could not enable APIs.")
            ui.dim("Enable them manually:")
            ui.dim(f"  gcloud services enable {' '.join(missing)}")
            raise typer.Exit(1)
        ui.success("APIs enabled.")
    except subprocess.TimeoutExpired:
        pass  # Non-critical
    except typer.Exit:
        raise
    except Exception:
        pass  # Skip gracefully


def _get_project_number(gcp_project: str) -> str | None:
    """Get the numeric project number for a GCP project."""
    try:
        result = _run_gcloud([
            "projects", "describe", gcp_project,
            "--format", "value(projectNumber)",
        ], timeout=15)
        return result.stdout.strip() or None
    except Exception:
        return None


BUILD_SA_ROLES = [
    "roles/storage.objectAdmin",
    "roles/logging.logWriter",
    "roles/artifactregistry.writer",
]


def _ensure_build_permissions(gcp_project: str) -> None:
    """Ensure the default compute SA has all permissions needed for Cloud Build."""
    project_number = _get_project_number(gcp_project)
    if not project_number:
        return  # Can't check, let the deploy fail with a clear error

    sa = f"{project_number}-compute@developer.gserviceaccount.com"

    # Check which roles the SA already has
    try:
        result = _run_gcloud([
            "projects", "get-iam-policy", gcp_project,
            "--flatten", "bindings[].members",
            "--filter", f"bindings.members:serviceAccount:{sa}",
            "--format", "value(bindings.role)",
        ], timeout=15)
        existing = set(result.stdout.strip().splitlines())
    except Exception:
        existing = set()

    missing = [r for r in BUILD_SA_ROLES if r not in existing]
    if not missing:
        return

    with ui.spinner("Granting Cloud Build permissions"):
        for role in missing:
            try:
                subprocess.run(
                    ["gcloud", "projects", "add-iam-policy-binding", gcp_project,
                     f"--member=serviceAccount:{sa}",
                     f"--role={role}",
                     "--condition=None",
                     "--quiet"],
                    capture_output=True, text=True, timeout=30,
                )
            except Exception:
                pass  # Don't block — the deploy will give a clearer error
    ui.success("Cloud Build permissions granted.")


def _check_env_file(project_path: Path) -> None:
    """Warn if there's no .env file or it has no real keys."""
    env_file = project_path / ".env"
    if not env_file.exists():
        ui.warning("No .env file found. Your agent may need API keys to work.")
        ui.dim("The deployed service won't have any environment variables set.")
        return

    has_real_keys = False
    placeholders = ["sk-your-key-here", "your-key-here", "xxx", "changeme", "todo"]
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        _, _, value = line.partition("=")
        value = value.strip().strip("'\"")
        if value and not any(p in value.lower() for p in placeholders):
            has_real_keys = True
            break

    if not has_real_keys:
        ui.warning(".env file found but contains no real API keys.")
        ui.dim("Make sure to set real keys before deploying.")


def _read_env_vars(project_path: Path) -> dict[str, str]:
    """Read environment variables from .env, filtering placeholders."""
    env_vars = {}
    env_file = project_path / ".env"
    if not env_file.exists():
        return env_vars

    placeholders = ["sk-your-key-here", "your-key-here", "xxx", "changeme", "todo"]
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'\"")
        if any(p in value.lower() for p in placeholders):
            ui.dim(f"Skipping placeholder: {key}")
            continue
        if value:
            env_vars[key] = value
    return env_vars


def deploy(
    project: str = typer.Argument(".", help="Project name or path"),
    service: Optional[str] = typer.Option(None, "--service", "-s", help="Cloud Run service name"),
    region: Optional[str] = typer.Option(None, "--region", "-r", help="GCP region"),
    gcp_project: Optional[str] = typer.Option(None, "--project", help="GCP project ID"),
) -> None:
    """Deploy to Google Cloud Run."""
    project_path = resolve_project(project)

    # --- Check Dockerfile exists first (fast, no network) ---
    dockerfile_path = project_path / "Dockerfile"
    if not dockerfile_path.exists():
        ui.error("No Dockerfile found.")
        ui.dim("Generate deployment files first:")
        ui.dim("  klisk docker")
        raise typer.Exit(1)

    # --- Load global config for defaults ---
    from klisk.core.config import GlobalConfig

    global_cfg = GlobalConfig.load()
    if not region and global_cfg.gcloud.region:
        region = global_cfg.gcloud.region

    # --- Check prerequisites with helpful messages ---
    ui.step("Checking prerequisites...")
    ui.plain()

    _check_gcloud_installed()
    _check_gcloud_auth()
    gcp_project = _check_gcloud_project(gcp_project, global_cfg.gcloud.project)
    _check_billing(gcp_project)
    _ensure_apis(gcp_project)
    _ensure_build_permissions(gcp_project)
    _check_env_file(project_path)

    # --- Load config for service name ---
    from klisk.core.config import ProjectConfig

    config = ProjectConfig.load(project_path)
    service_name = service or _slugify(config.name)

    ui.step("Deploying to Cloud Run...")
    ui.kv("Service", service_name)
    ui.kv("Project", gcp_project)
    if region:
        ui.kv("Region", region)
    ui.plain()

    # --- Read .env for environment variables ---
    env_vars = _read_env_vars(project_path)

    # --- Build gcloud command ---
    cmd = [
        "gcloud", "run", "deploy", service_name,
        "--source", str(project_path),
        "--allow-unauthenticated",
        "--project", gcp_project,
        "--quiet",  # Auto-confirm prompts (APIs/repos already set up)
    ]

    if region:
        cmd.extend(["--region", region])

    if env_vars:
        env_str = ",".join(f"{k}={v}" for k, v in env_vars.items())
        cmd.extend(["--set-env-vars", env_str])

    ui.dim(f"Running: gcloud run deploy {service_name} --source ...")
    ui.plain()

    try:
        # Let all output flow to terminal so user sees build progress
        proc = subprocess.run(cmd, timeout=600)
        if proc.returncode != 0:
            ui.error("Deployment failed.")
            ui.dim("Common fixes:")
            ui.dim("  - Re-run the same command (permission propagation can take a few seconds)")
            ui.dim("  - Check that billing is enabled for the project")
            ui.dim("  - Enable APIs: gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com")
            raise typer.Exit(1)
    except subprocess.TimeoutExpired:
        ui.error("Deployment timed out after 10 minutes.")
        ui.dim("The build may still be running. Check at:")
        ui.dim(f"  https://console.cloud.google.com/cloud-build/builds?project={gcp_project}")
        raise typer.Exit(1)

    # --- Get deployed URL ---
    ui.plain()
    describe_cmd = [
        "gcloud", "run", "services", "describe", service_name,
        "--format", "value(status.url)",
        "--project", gcp_project,
    ]
    if region:
        describe_cmd.extend(["--region", region])

    result = subprocess.run(describe_cmd, capture_output=True, text=True, timeout=15)
    deployed_url = result.stdout.strip()

    if deployed_url:
        ui.success("Deployed successfully!")
        ui.plain()
        ui.url("Chat", deployed_url)
        ui.url("API", f"{deployed_url}/api/chat")
        ui.url("Health", f"{deployed_url}/health")
        ui.plain()
        ui.dim("Embed widget:")
        ui.dim(f'  <script src="{deployed_url}/widget.js"></script>')
    else:
        ui.success("Deployed! Run `gcloud run services list` to see the URL.")
