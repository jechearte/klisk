"""agentkit dev — start the Studio and dev server."""

from __future__ import annotations

from pathlib import Path

import typer

from agentkit.core.paths import resolve_project


def dev(
    name_or_path: str = typer.Argument(".", help="Project name or path"),
) -> None:
    """Start the AgentKit Studio and dev server with hot reload."""
    from dotenv import load_dotenv

    project_path = resolve_project(name_or_path)
    load_dotenv(project_path / ".env")

    from agentkit.core.config import ProjectConfig

    config = ProjectConfig.load(project_path)

    typer.echo(f"  Studio + API: http://localhost:{config.api.port}")
    typer.echo(f"  Project:      {project_path}")
    typer.echo("  Watching for changes...")
    typer.echo()

    from agentkit.server.app import create_app, run_server

    app = create_app(project_path)
    run_server(app, host="0.0.0.0", port=config.api.port)
