"""klisk serve — start the production server."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import typer

from klisk.core.paths import resolve_project


def serve(
    name_or_path: str = typer.Argument(".", help="Project name or path"),
    port: Optional[int] = typer.Option(None, "--port", "-p", help="Port (default: $PORT or 8080)"),
    host: str = typer.Option("0.0.0.0", "--host", "-h", help="Host to bind to"),
) -> None:
    """Start the Klisk production server (chat UI + API)."""
    from dotenv import load_dotenv

    project_path = resolve_project(name_or_path)
    load_dotenv(project_path / ".env")

    if port is None:
        port = int(os.environ.get("PORT", "8080"))

    typer.echo(f"  Chat UI: http://{host}:{port}")
    typer.echo(f"  API:     http://{host}:{port}/api/chat")
    typer.echo(f"  Health:  http://{host}:{port}/health")
    typer.echo(f"  Project: {project_path}")
    typer.echo()

    from klisk.server.production import create_production_app, run_production_server

    app = create_production_app(project_path)
    run_production_server(app, host=host, port=port)
