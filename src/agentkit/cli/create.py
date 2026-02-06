"""agentkit create — scaffold a new project."""

from __future__ import annotations

import importlib.resources
import shutil
from pathlib import Path

import typer

from agentkit.core.paths import get_project_path


def _get_templates_dir() -> Path:
    """Locate the default template directory inside the installed package."""
    pkg_templates = Path(str(importlib.resources.files("agentkit"))) / "templates" / "default"
    if pkg_templates.exists():
        return pkg_templates
    # Fallback for development (editable install)
    return Path(__file__).resolve().parent.parent.parent.parent / "templates" / "default"


def create(
    name: str = typer.Argument(..., help="Name of the new project"),
) -> None:
    """Create a new AgentKit project with the standard structure."""
    target = get_project_path(name)

    if target.exists():
        typer.echo(f"Error: project '{name}' already exists at {target}", err=True)
        raise typer.Exit(1)

    # Copy the template
    shutil.copytree(_get_templates_dir(), target)

    # Replace placeholder in config
    config_path = target / "agentkit.config.yaml"
    config_text = config_path.read_text()
    config_path.write_text(config_text.replace("{{project_name}}", name))

    # Create .env from .env.example so the user has a file ready to edit
    env_example = target / ".env.example"
    env_file = target / ".env"
    if env_example.exists() and not env_file.exists():
        shutil.copy(env_example, env_file)

    typer.echo(f"Created project '{name}' at {target}")
    typer.echo()
    typer.echo("Next steps:")
    typer.echo(f"  1. Add your API key in {env_file}")
    typer.echo(f"  2. agentkit dev {name}          # start the Studio")
