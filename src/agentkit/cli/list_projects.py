"""agentkit list — show all projects."""

from __future__ import annotations

import typer

from agentkit.core.paths import list_projects, PROJECTS_DIR


def list_cmd() -> None:
    """List all AgentKit projects."""
    projects = list_projects()

    if not projects:
        typer.echo(f"No projects found in {PROJECTS_DIR}")
        typer.echo()
        typer.echo("Create one with:")
        typer.echo("  agentkit create my-agent")
        return

    typer.echo(f"Projects ({len(projects)}):")
    typer.echo()
    for p in projects:
        typer.echo(f"  {p['name']}")
        typer.echo(f"    Model: {p['model']}  |  Entry: {p['entry']}")
        typer.echo(f"    Path:  {p['path']}")
        typer.echo()
