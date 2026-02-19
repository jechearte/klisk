"""klisk studio — start the Studio and dev server (daemonized)."""

from __future__ import annotations

import typer


def studio(
    stop: bool = typer.Option(False, "--stop", help="Stop the running dev server"),
) -> None:
    """Start the Klisk Studio and dev server in the background."""
    from klisk.core.daemon import read_pid_info, start_daemon, stop_daemon

    project_name: str | None = None
    project_path = None
    port = 8321

    # --stop: shut down the server
    if stop:
        if stop_daemon(project_name):
            typer.echo("  Stopped dev server (workspace).")
        else:
            typer.echo("  No dev server is running.")
        return

    # Check if already running
    existing = read_pid_info(project_name)
    if existing:
        typer.echo(f"  Dev server already running (pid {existing.pid}).")
        typer.echo(f"  Studio + API: http://localhost:{existing.port}")
        typer.echo(f"  Logs:         {existing.log_file}")
        typer.echo(f"  Stop with:    klisk studio --stop")
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

    from klisk.core.paths import PROJECTS_DIR
    typer.echo(f"  Studio + API: http://localhost:{info.port}")
    typer.echo(f"  Workspace:    {PROJECTS_DIR}")
    typer.echo(f"  PID:          {info.pid}")
    typer.echo(f"  Logs:         {info.log_file}")
    typer.echo(f"  Stop with:    klisk studio --stop")
