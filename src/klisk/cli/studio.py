"""klisk studio — start the Studio and dev server (daemonized)."""

from __future__ import annotations

import typer

from klisk.cli import ui


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
            ui.success("Stopped dev server (workspace).")
        else:
            ui.info("No dev server is running.")
        return

    # Check if already running
    existing = read_pid_info(project_name)
    if existing:
        ui.info(f"Dev server already running (pid {existing.pid}).")
        ui.url("Studio + API", f"http://localhost:{existing.port}")
        ui.kv("Logs", existing.log_file)
        ui.dim("Stop with: klisk studio --stop")
        return

    # Launch daemon
    try:
        info = start_daemon(
            port=port,
            project=project_name,
            project_path=project_path,
        )
    except RuntimeError as exc:
        ui.error(str(exc))
        raise typer.Exit(1)

    from klisk.core.paths import PROJECTS_DIR
    ui.url("Studio + API", f"http://localhost:{info.port}")
    ui.kv("Workspace", str(PROJECTS_DIR))
    ui.kv("PID", str(info.pid))
    ui.kv("Logs", info.log_file)
    ui.dim("Stop with: klisk studio --stop")
