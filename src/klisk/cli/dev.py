"""klisk dev — start the Studio and dev server."""

from __future__ import annotations

from typing import Optional

import typer

from klisk.core.paths import resolve_project


def dev(
    name_or_path: Optional[str] = typer.Argument(None, help="Project name or path (omit for workspace mode)"),
) -> None:
    """Start the Klisk Studio and dev server with hot reload."""
    from klisk.server.app import create_app, run_server

    if name_or_path is None:
        # Workspace mode: load all projects
        from klisk.core.discovery import load_all_project_envs
        from klisk.core.paths import PROJECTS_DIR

        load_all_project_envs()

        port = 8000
        typer.echo(f"  Studio + API: http://localhost:{port}")
        typer.echo(f"  Workspace:    {PROJECTS_DIR}")
        typer.echo("  Watching all projects for changes...")
        typer.echo()

        app = create_app(None)
        run_server(app, host="0.0.0.0", port=port)
    else:
        # Single-project mode (existing behaviour)
        from dotenv import load_dotenv
        from klisk.core.config import ProjectConfig

        project_path = resolve_project(name_or_path)
        load_dotenv(project_path / ".env")

        config = ProjectConfig.load(project_path)

        typer.echo(f"  Studio + API: http://localhost:{config.api.port}")
        typer.echo(f"  Project:      {project_path}")
        typer.echo("  Watching for changes...")
        typer.echo()

        app = create_app(project_path)
        run_server(app, host="0.0.0.0", port=config.api.port)
