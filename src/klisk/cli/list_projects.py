"""klisk list — show all projects."""

from __future__ import annotations

import typer

from klisk.core.paths import list_projects, PROJECTS_DIR


def list_cmd() -> None:
    """List all Klisk projects."""
    projects = list_projects()

    if not projects:
        typer.echo(f"No projects found in {PROJECTS_DIR}")
        typer.echo()
        typer.echo("Create one with:")
        typer.echo("  klisk create my-agent")
        return

    typer.echo(f"Projects ({len(projects)}):")
    typer.echo()
    for p in projects:
        typer.echo(f"  {p['name']}")
        typer.echo(f"    Entry: {p['entry']}")
        typer.echo(f"    Path:  {p['path']}")
        typer.echo()
