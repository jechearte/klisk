"""klisk docker — generate Docker deployment files."""

from __future__ import annotations

import re
from pathlib import Path

import typer

from klisk.core.paths import resolve_project


def _needs_litellm(project_path: Path) -> bool:
    """Check if the project uses LiteLLM models (non-OpenAI providers)."""
    for py_file in project_path.rglob("*.py"):
        try:
            content = py_file.read_text()
        except Exception:
            continue
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


def docker(
    project: str = typer.Argument(".", help="Project name or path"),
) -> None:
    """Generate Docker deployment files (Dockerfile, .dockerignore)."""
    project_path = resolve_project(project)

    config_file = project_path / "klisk.config.yaml"
    if not config_file.exists():
        typer.echo(f"Error: No klisk.config.yaml found in {project_path}", err=True)
        typer.echo("  Make sure you're in a Klisk project directory, or specify the project name:", err=True)
        typer.echo("    klisk docker <project-name>", err=True)
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
    typer.echo("    2. Deploy with your preferred platform (e.g. klisk deploy for GCloud)")
