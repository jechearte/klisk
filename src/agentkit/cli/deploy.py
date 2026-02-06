"""agentkit deploy — deploy to Google Cloud Run."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Optional

import typer

from agentkit.core.paths import resolve_project

deploy_app = typer.Typer(name="deploy", help="Deploy to Google Cloud Run.")


def _slugify(name: str) -> str:
    """Convert a project name to a valid Cloud Run service name."""
    slug = re.sub(r"[^a-z0-9-]", "-", name.lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "agentkit-agent"


def _needs_litellm(project_path: Path) -> bool:
    """Check if the project uses LiteLLM models (non-OpenAI providers)."""
    from agentkit.core.config import ProjectConfig

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


DOCKERFILE_TEMPLATE = """\
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["agentkit", "serve", ".", "--port", "8080"]
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
    """Generate deployment files (Dockerfile, .dockerignore, requirements.txt)."""
    project_path = resolve_project(project)

    config_file = project_path / "agentkit.config.yaml"
    if not config_file.exists():
        typer.echo(f"Error: No agentkit.config.yaml found in {project_path}", err=True)
        raise typer.Exit(1)

    from agentkit.core.config import ProjectConfig

    config = ProjectConfig.load(project_path)
    typer.echo(f"  Project: {config.name}")
    typer.echo(f"  Path:    {project_path}")
    typer.echo()

    use_litellm = _needs_litellm(project_path)
    if use_litellm:
        typer.echo("  Detected LiteLLM models — will include agentkit[litellm]")

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

    # --- requirements.txt ---
    req_path = project_path / "requirements.txt"
    if not req_path.exists():
        pkg = "agentkit[litellm]" if use_litellm else "agentkit"
        req_path.write_text(pkg + "\n")
        typer.echo(f"  Created requirements.txt ({pkg})")
    else:
        typer.echo("  Skipped requirements.txt (already exists)")

    typer.echo()
    typer.echo("  Done! Next step: agentkit deploy")


@deploy_app.callback(invoke_without_command=True)
def deploy(
    ctx: typer.Context,
    project: str = typer.Argument(".", help="Project name or path"),
    service: Optional[str] = typer.Option(None, "--service", "-s", help="Cloud Run service name"),
    region: Optional[str] = typer.Option(None, "--region", "-r", help="GCP region"),
    gcp_project: Optional[str] = typer.Option(None, "--project", help="GCP project ID"),
) -> None:
    """Deploy to Google Cloud Run."""
    if ctx.invoked_subcommand is not None:
        return

    project_path = resolve_project(project)

    # --- Check prerequisites ---
    if not shutil.which("gcloud"):
        typer.echo("Error: gcloud CLI not found. Install it from https://cloud.google.com/sdk/docs/install", err=True)
        raise typer.Exit(1)

    # Check authentication
    try:
        result = subprocess.run(
            ["gcloud", "auth", "print-access-token"],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            typer.echo("Error: Not authenticated with gcloud. Run: gcloud auth login", err=True)
            raise typer.Exit(1)
    except subprocess.TimeoutExpired:
        typer.echo("Error: gcloud auth check timed out", err=True)
        raise typer.Exit(1)

    # Check GCP project
    if not gcp_project:
        result = subprocess.run(
            ["gcloud", "config", "get-value", "project"],
            capture_output=True, text=True, timeout=10,
        )
        gcp_project = result.stdout.strip()
        if not gcp_project or gcp_project == "(unset)":
            typer.echo("Error: No GCP project configured. Run: gcloud config set project <PROJECT_ID>", err=True)
            raise typer.Exit(1)

    # Check Dockerfile exists
    dockerfile_path = project_path / "Dockerfile"
    if not dockerfile_path.exists():
        typer.echo("Error: No Dockerfile found. Run: agentkit deploy init", err=True)
        raise typer.Exit(1)

    # Load config for service name
    from agentkit.core.config import ProjectConfig

    config = ProjectConfig.load(project_path)
    service_name = service or _slugify(config.name)

    typer.echo(f"  Deploying to Cloud Run...")
    typer.echo(f"  Service:  {service_name}")
    typer.echo(f"  Project:  {gcp_project}")
    if region:
        typer.echo(f"  Region:   {region}")
    typer.echo()

    # --- Read .env for environment variables ---
    env_vars = {}
    env_file = project_path / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("'\"")
            # Skip obvious placeholders
            placeholders = ["sk-your-key-here", "your-key-here", "xxx", "changeme", "TODO"]
            if any(p in value.lower() for p in [p.lower() for p in placeholders]):
                typer.echo(f"  Skipping placeholder env var: {key}")
                continue
            if value:
                env_vars[key] = value

    # --- Build gcloud command ---
    cmd = [
        "gcloud", "run", "deploy", service_name,
        "--source", str(project_path),
        "--allow-unauthenticated",
        "--project", gcp_project,
    ]

    if region:
        cmd.extend(["--region", region])

    if env_vars:
        env_str = ",".join(f"{k}={v}" for k, v in env_vars.items())
        cmd.extend(["--set-env-vars", env_str])

    typer.echo(f"  Running: gcloud run deploy {service_name} --source ...")
    typer.echo()

    try:
        proc = subprocess.run(cmd, timeout=600)
        if proc.returncode != 0:
            typer.echo("\nError: Deployment failed", err=True)
            raise typer.Exit(1)
    except subprocess.TimeoutExpired:
        typer.echo("\nError: Deployment timed out after 10 minutes", err=True)
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
