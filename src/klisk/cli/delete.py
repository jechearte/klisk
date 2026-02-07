"""klisk delete — remove an existing project."""

from __future__ import annotations

import shutil
from pathlib import Path

import typer

from klisk.core.paths import resolve_project


def delete(
    name_or_path: str = typer.Argument(..., help="Project name or path to delete"),
    force: bool = typer.Option(False, "--force", "-f", help="Skip confirmation prompt"),
) -> None:
    """Delete an Klisk project directory."""
    project_path = resolve_project(name_or_path)

    if not project_path.exists():
        typer.echo(f"Error: '{project_path}' does not exist.", err=True)
        raise typer.Exit(1)

    config_file = project_path / "klisk.config.yaml"
    if not config_file.exists():
        typer.echo(f"Error: '{project_path}' does not look like a Klisk project (no klisk.config.yaml).", err=True)
        raise typer.Exit(1)

    if not force:
        confirm = typer.confirm(f"Delete project '{project_path.name}' at {project_path}?")
        if not confirm:
            typer.echo("Aborted.")
            raise typer.Exit(0)

    shutil.rmtree(project_path)
    typer.echo(f"Deleted project '{project_path.name}'.")
