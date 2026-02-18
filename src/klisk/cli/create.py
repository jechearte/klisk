"""klisk create — scaffold a new project."""

from __future__ import annotations

import importlib.resources
import platform
import shutil
import subprocess
import sys
from pathlib import Path

import typer

from klisk.core.paths import get_project_path


def _get_templates_dir() -> Path:
    """Locate the default template directory inside the installed package."""
    pkg_templates = Path(str(importlib.resources.files("klisk"))) / "templates" / "default"
    if pkg_templates.exists():
        return pkg_templates
    # Fallback for development (editable install)
    return Path(__file__).resolve().parent.parent.parent.parent / "templates" / "default"


def _venv_python(venv_dir: Path) -> Path:
    """Return the path to the Python executable inside a venv (cross-platform)."""
    if platform.system() == "Windows":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def _setup_venv(project_dir: Path) -> None:
    """Create a virtual environment and install requirements.txt."""
    venv_dir = project_dir / ".venv"
    req_file = project_dir / "requirements.txt"

    typer.echo("  Setting up virtual environment...")
    try:
        subprocess.run(
            [sys.executable, "-m", "venv", str(venv_dir)],
            check=True, capture_output=True, text=True, timeout=60,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        typer.echo(f"  Warning: Could not create venv: {exc}", err=True)
        typer.echo("  You can create it manually: python -m venv .venv", err=True)
        return

    if not req_file.exists():
        return

    venv_py = _venv_python(venv_dir)
    typer.echo("  Installing dependencies...")
    try:
        subprocess.run(
            [str(venv_py), "-m", "pip", "install", "-q", "-r", str(req_file)],
            check=True, capture_output=True, text=True, timeout=120,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        typer.echo(f"  Warning: Could not install dependencies: {exc}", err=True)
        typer.echo("  You can install them manually:", err=True)
        typer.echo(f"    {venv_py} -m pip install -r requirements.txt", err=True)

    typer.echo()


def create(
    name: str = typer.Argument(..., help="Name of the new project"),
) -> None:
    """Create a new Klisk project with the standard structure."""
    target = get_project_path(name)

    if target.exists():
        typer.echo(f"Error: project '{name}' already exists at {target}", err=True)
        raise typer.Exit(1)

    # Copy the template
    shutil.copytree(_get_templates_dir(), target)

    # Replace placeholder in config
    config_path = target / "klisk.config.yaml"
    config_text = config_path.read_text()
    config_path.write_text(config_text.replace("{{project_name}}", name))

    # Create .env from .env.example so the user has a file ready to edit
    env_example = target / ".env.example"
    env_file = target / ".env"
    if env_example.exists() and not env_file.exists():
        shutil.copy(env_example, env_file)

    # Create venv and install dependencies
    _setup_venv(target)

    typer.echo(f"Created project '{name}' at {target}")
    typer.echo()
    typer.echo("Next steps:")
    typer.echo(f"  1. Add your API key in {env_file}")
    typer.echo(f"  2. klisk dev {name}          # start the Studio")
