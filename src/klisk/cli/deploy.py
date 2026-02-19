"""klisk deploy — deploy to Google Cloud Run."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Optional

import typer

from klisk.core.paths import resolve_project

deploy_app = typer.Typer(name="deploy", help="Deploy to Google Cloud Run.")


def _slugify(name: str) -> str:
    """Convert a project name to a valid Cloud Run service name."""
    slug = re.sub(r"[^a-z0-9-]", "-", name.lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "klisk-agent"


def _needs_litellm(project_path: Path) -> bool:
    """Check if the project uses LiteLLM models (non-OpenAI providers)."""
    from klisk.core.config import ProjectConfig

    config = ProjectConfig.load(project_path)

    # Scan Python files for model strings with provider/ prefix
    for py_file in project_path.rglob("*.py"):
        try:
            content = py_file.read_text()
        except Exception:
            continue
        # Look for model= arguments with provider/model patterns
        for match in re.finditer(r'model\s*=\s*["\']([^"\']+/[^"\']+)["\']', content):
            model_str = match.group(1)
            if not model_str.startswith("openai/"):
                return True
    return False


def _run_gcloud(args: list[str], timeout: int = 15) -> subprocess.CompletedProcess:
    """Run a gcloud command and return the result."""
    return subprocess.run(
        ["gcloud"] + args,
        capture_output=True, text=True, timeout=timeout,
    )


def _check_gcloud_installed() -> None:
    """Check that gcloud CLI is installed."""
    if not shutil.which("gcloud"):
        typer.echo("Error: Google Cloud CLI (gcloud) not found.\n", err=True)
        typer.echo("  Install it:", err=True)
        typer.echo("    macOS:   brew install google-cloud-sdk", err=True)
        typer.echo("    Other:   https://cloud.google.com/sdk/docs/install", err=True)
        raise typer.Exit(1)


def _check_gcloud_auth() -> None:
    """Check that the user is authenticated with gcloud."""
    try:
        result = _run_gcloud(["auth", "print-access-token"])
        if result.returncode != 0:
            stderr = result.stderr.strip()
            if "login" in stderr.lower() or "no access token" in stderr.lower() or "ERROR" in stderr:
                typer.echo("Error: Not authenticated with Google Cloud.\n", err=True)
                typer.echo("  Run this command and follow the browser prompt:", err=True)
                typer.echo("    gcloud auth login", err=True)
                raise typer.Exit(1)
    except subprocess.TimeoutExpired:
        typer.echo("Error: gcloud auth check timed out.", err=True)
        raise typer.Exit(1)


def _check_gcloud_project(gcp_project: str | None) -> str:
    """Resolve and validate the GCP project ID."""
    if gcp_project:
        return gcp_project

    try:
        result = _run_gcloud(["config", "get-value", "project"])
        project_id = result.stdout.strip()
    except subprocess.TimeoutExpired:
        project_id = ""

    if not project_id or project_id == "(unset)":
        typer.echo("Error: No Google Cloud project configured.\n", err=True)
        typer.echo("  If you already have a GCP project:", err=True)
        typer.echo("    gcloud config set project YOUR_PROJECT_ID", err=True)
        typer.echo("", err=True)
        typer.echo("  If you don't have one yet:", err=True)
        typer.echo("    1. Go to https://console.cloud.google.com", err=True)
        typer.echo("    2. Create a new project", err=True)
        typer.echo("    3. Run: gcloud config set project YOUR_PROJECT_ID", err=True)
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
            typer.echo(f"Error: Billing is not enabled for project '{gcp_project}'.\n", err=True)
            typer.echo("  Cloud Run requires billing. Enable it at:", err=True)
            typer.echo(f"    https://console.cloud.google.com/billing?project={gcp_project}", err=True)
            typer.echo("", err=True)
            typer.echo("  Note: Google Cloud offers $300 in free credits for new accounts.", err=True)
            raise typer.Exit(1)
    except subprocess.TimeoutExpired:
        pass  # Non-critical, let the deploy fail with a clearer error if needed
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
        typer.echo(f"  Required APIs not enabled: {names}\n")
        enable = typer.confirm("  Enable them now?", default=True)
        if not enable:
            typer.echo("\nError: These APIs are required for deployment.\n", err=True)
            typer.echo("  Enable them manually:", err=True)
            typer.echo(f"    gcloud services enable {' '.join(missing)}", err=True)
            raise typer.Exit(1)

        typer.echo("  Enabling APIs (this may take a moment)...")
        enable_result = subprocess.run(
            ["gcloud", "services", "enable", *missing, "--project", gcp_project],
            capture_output=True, text=True, timeout=120,
        )
        if enable_result.returncode != 0:
            typer.echo(f"\nError: Could not enable APIs.\n", err=True)
            typer.echo("  Enable them manually:", err=True)
            typer.echo(f"    gcloud services enable {' '.join(missing)}", err=True)
            raise typer.Exit(1)
        typer.echo("  APIs enabled.\n")
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

    typer.echo("  Granting Cloud Build permissions...")
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
    typer.echo("  Cloud Build permissions granted.\n")


def _check_env_file(project_path: Path) -> None:
    """Warn if there's no .env file or it has no real keys."""
    env_file = project_path / ".env"
    if not env_file.exists():
        typer.echo("  Warning: No .env file found. Your agent may need API keys to work.")
        typer.echo("  The deployed service won't have any environment variables set.\n")
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
        typer.echo("  Warning: .env file found but contains no real API keys.")
        typer.echo("  Make sure to set real keys before deploying.\n")


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
            typer.echo(f"  Skipping placeholder: {key}")
            continue
        if value:
            env_vars[key] = value
    return env_vars


DOCKERFILE_TEMPLATE = """\
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["klisk", "serve", ".", "--port", "8080"]
"""

DOCKERIGNORE_TEMPLATE = """\
.venv/
__pycache__/
*.pyc
.git/
.env
.env.*
node_modules/
.mypy_cache/
.pytest_cache/
"""


@deploy_app.command("init")
def deploy_init(
    project: str = typer.Argument(".", help="Project name or path"),
) -> None:
    """Generate deployment files (Dockerfile, .dockerignore)."""
    project_path = resolve_project(project)

    config_file = project_path / "klisk.config.yaml"
    if not config_file.exists():
        typer.echo(f"Error: No klisk.config.yaml found in {project_path}", err=True)
        typer.echo("  Make sure you're in a Klisk project directory, or specify the project name:", err=True)
        typer.echo("    klisk deploy init <project-name>", err=True)
        raise typer.Exit(1)

    from klisk.core.config import ProjectConfig

    config = ProjectConfig.load(project_path)
    typer.echo(f"  Project: {config.name}")
    typer.echo(f"  Path:    {project_path}")
    typer.echo()

    use_litellm = _needs_litellm(project_path)
    if use_litellm:
        typer.echo("  Detected LiteLLM models — will include klisk[litellm]")

    # --- Ensure requirements.txt has klisk with correct extras ---
    req_path = project_path / "requirements.txt"
    klisk_dep = "klisk[litellm]" if use_litellm else "klisk"

    user_deps: list[str] = []
    if req_path.exists():
        for line in req_path.read_text().splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            # Skip existing klisk entries (will be re-added with correct extras)
            if stripped.lower().startswith("klisk"):
                continue
            # Skip any old wheel references
            if stripped.startswith("./klisk-") and stripped.endswith(".whl"):
                continue
            user_deps.append(stripped)

    req_lines = [klisk_dep] + user_deps
    req_path.write_text("\n".join(req_lines) + "\n")

    dep_info = klisk_dep
    if user_deps:
        dep_info += f" + {len(user_deps)} user dep(s)"
    typer.echo(f"  Updated requirements.txt ({dep_info})")

    # --- Dockerfile ---
    dockerfile_path = project_path / "Dockerfile"
    if dockerfile_path.exists():
        overwrite = typer.confirm("  Dockerfile already exists. Overwrite?", default=False)
        if not overwrite:
            typer.echo("  Skipped Dockerfile")
        else:
            dockerfile_path.write_text(DOCKERFILE_TEMPLATE)
            typer.echo("  Created Dockerfile")
    else:
        dockerfile_path.write_text(DOCKERFILE_TEMPLATE)
        typer.echo("  Created Dockerfile")

    # --- .dockerignore ---
    dockerignore_path = project_path / ".dockerignore"
    if not dockerignore_path.exists():
        dockerignore_path.write_text(DOCKERIGNORE_TEMPLATE)
        typer.echo("  Created .dockerignore")
    else:
        typer.echo("  Skipped .dockerignore (already exists)")

    typer.echo()
    typer.echo("  Done! Next steps:")
    typer.echo("    1. Make sure your .env has real API keys")
    typer.echo("    2. Run: klisk deploy")


@deploy_app.callback(invoke_without_command=True)
def deploy(
    ctx: typer.Context,
    project: Optional[str] = typer.Option(None, "--path", "-p", help="Project name or path (default: current dir)"),
    service: Optional[str] = typer.Option(None, "--service", "-s", help="Cloud Run service name"),
    region: Optional[str] = typer.Option(None, "--region", "-r", help="GCP region"),
    gcp_project: Optional[str] = typer.Option(None, "--project", help="GCP project ID"),
) -> None:
    """Deploy to Google Cloud Run."""
    if ctx.invoked_subcommand is not None:
        return

    project_path = resolve_project(project or ".")

    # --- Check Dockerfile exists first (fast, no network) ---
    dockerfile_path = project_path / "Dockerfile"
    if not dockerfile_path.exists():
        typer.echo("Error: No Dockerfile found.\n", err=True)
        typer.echo("  Generate deployment files first:", err=True)
        typer.echo("    klisk deploy init", err=True)
        raise typer.Exit(1)

    # --- Check prerequisites with helpful messages ---
    typer.echo("  Checking prerequisites...\n")

    _check_gcloud_installed()
    _check_gcloud_auth()
    gcp_project = _check_gcloud_project(gcp_project)
    _check_billing(gcp_project)
    _ensure_apis(gcp_project)
    _ensure_build_permissions(gcp_project)
    _check_env_file(project_path)

    # --- Load config for service name ---
    from klisk.core.config import ProjectConfig

    config = ProjectConfig.load(project_path)
    service_name = service or _slugify(config.name)

    typer.echo(f"  Deploying to Cloud Run...")
    typer.echo(f"  Service:  {service_name}")
    typer.echo(f"  Project:  {gcp_project}")
    if region:
        typer.echo(f"  Region:   {region}")
    typer.echo()

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

    typer.echo(f"  Running: gcloud run deploy {service_name} --source ...")
    typer.echo()

    try:
        # Let all output flow to terminal so user sees build progress
        proc = subprocess.run(cmd, timeout=600)
        if proc.returncode != 0:
            typer.echo("\nError: Deployment failed.\n", err=True)
            typer.echo("  Common fixes:", err=True)
            typer.echo("    - Re-run the same command (permission propagation can take a few seconds)", err=True)
            typer.echo("    - Check that billing is enabled for the project", err=True)
            typer.echo("    - Enable APIs: gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com", err=True)
            raise typer.Exit(1)
    except subprocess.TimeoutExpired:
        typer.echo("\nError: Deployment timed out after 10 minutes.", err=True)
        typer.echo("  The build may still be running. Check at:", err=True)
        typer.echo(f"    https://console.cloud.google.com/cloud-build/builds?project={gcp_project}", err=True)
        raise typer.Exit(1)

    # --- Get deployed URL ---
    typer.echo()
    describe_cmd = [
        "gcloud", "run", "services", "describe", service_name,
        "--format", "value(status.url)",
        "--project", gcp_project,
    ]
    if region:
        describe_cmd.extend(["--region", region])

    result = subprocess.run(describe_cmd, capture_output=True, text=True, timeout=15)
    url = result.stdout.strip()

    if url:
        typer.echo(f"  Deployed successfully!")
        typer.echo()
        typer.echo(f"  Chat:   {url}")
        typer.echo(f"  API:    {url}/api/chat")
        typer.echo(f"  Health: {url}/health")
        typer.echo()
        typer.echo(f"  Embed widget:")
        typer.echo(f'  <script src="{url}/widget.js"></script>')
    else:
        typer.echo("  Deployed! Run `gcloud run services list` to see the URL.")
