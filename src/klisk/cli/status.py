"""klisk status — show workspace overview."""

from __future__ import annotations

from datetime import datetime, timezone

import typer

from klisk.cli import ui


def _format_uptime(started_at: str) -> str:
    """Format an ISO timestamp as a human-readable uptime string."""
    try:
        start = datetime.fromisoformat(started_at)
        delta = datetime.now(timezone.utc) - start
        total_seconds = int(delta.total_seconds())
        if total_seconds < 60:
            return f"{total_seconds}s"
        minutes = total_seconds // 60
        if minutes < 60:
            return f"{minutes}m"
        hours = minutes // 60
        remaining = minutes % 60
        if hours < 24:
            return f"{hours}h {remaining}m"
        days = hours // 24
        remaining_hours = hours % 24
        return f"{days}d {remaining_hours}h"
    except Exception:
        return "unknown"


def status() -> None:
    """Show the current workspace status."""
    from klisk.core.daemon import read_pid_info
    from klisk.core.paths import KLISK_HOME, PROJECTS_DIR, list_projects

    home_display = str(KLISK_HOME).replace(str(KLISK_HOME.home()), "~")

    ui.header("Klisk Status")
    ui.plain()
    ui.kv("Workspace", home_display)

    projects = list_projects()
    ui.kv("Projects", str(len(projects)))

    # Studio status
    ui.header("Studio")

    studio_info = read_pid_info(None)  # workspace mode
    if studio_info:
        ui.kv("Status", "[green]Running[/green] (pid {})".format(studio_info.pid))
        ui.url("URL", f"http://localhost:{studio_info.port}")
        ui.kv("Uptime", _format_uptime(studio_info.started_at))
        if studio_info.log_file:
            log_display = studio_info.log_file.replace(str(KLISK_HOME.home()), "~")
            ui.kv("Logs", log_display)
    else:
        ui.kv("Status", "[dim]Stopped[/dim]")
        ui.dim("Start with: klisk studio")

    # Projects table
    if projects:
        ui.header("Projects")
        ui.plain()
        rows = []
        for p in projects:
            path_display = p["path"].replace(str(KLISK_HOME.home()), "~")
            rows.append((p["name"], p["entry"], path_display))
        ui.table(["Name", "Entry", "Path"], rows)
    elif PROJECTS_DIR.exists():
        ui.plain()
        ui.info("No projects yet.")
        ui.next_steps(["klisk create my-agent"])

    ui.plain()
