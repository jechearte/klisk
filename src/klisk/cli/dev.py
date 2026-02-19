"""klisk dev — start the Studio and dev server (daemonized)."""

from __future__ import annotations

from typing import Optional

import typer

from klisk.core.paths import resolve_project


def dev(
    name_or_path: Optional[str] = typer.Argument(None, help="Project name or path (omit for workspace mode)"),
    stop: bool = typer.Option(False, "--stop", help="Stop the running dev server"),
) -> None:
    """Start the Klisk Studio and dev server in the background."""
    from klisk.core.daemon import read_pid_info, start_daemon, stop_daemon

    # Resolve project identity
    project_name: str | None = None
    project_path = None
    port = 8321

    if name_or_path is not None:
        from klisk.core.config import ProjectConfig

        project_path = resolve_project(name_or_path)
        config = ProjectConfig.load(project_path)
        project_name = project_path.name
        port = config.api.port

    # --stop: shut down the server
    if stop:
        if stop_daemon(project_name):
            label = project_name or "workspace"
            typer.echo(f"  Stopped dev server ({label}).")
        else:
            typer.echo("  No dev server is running.")
        return

    # Check if already running
    existing = read_pid_info(project_name)
    if existing:
        typer.echo(f"  Dev server already running (pid {existing.pid}).")
        typer.echo(f"  Studio + API: http://localhost:{existing.port}")
        typer.echo(f"  Logs:         {existing.log_file}")
        typer.echo(f"  Stop with:    klisk dev{' ' + name_or_path if name_or_path else ''} --stop")
        return

    # Launch daemon
    try:
        info = start_daemon(
            port=port,
            project=project_name,
            project_path=project_path,
        )
    except RuntimeError as exc:
        typer.echo(f"  Error: {exc}", err=True)
        raise typer.Exit(1)

    if name_or_path is None:
        from klisk.core.paths import PROJECTS_DIR
        typer.echo(f"  Studio + API: http://localhost:{info.port}")
        typer.echo(f"  Workspace:    {PROJECTS_DIR}")
    else:
        typer.echo(f"  Studio + API: http://localhost:{info.port}")
        typer.echo(f"  Project:      {project_path}")

    typer.echo(f"  PID:          {info.pid}")
    typer.echo(f"  Logs:         {info.log_file}")
    typer.echo(f"  Stop with:    klisk dev{' ' + name_or_path if name_or_path else ''} --stop")
