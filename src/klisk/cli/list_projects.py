"""klisk list — show all projects."""

from __future__ import annotations

from klisk.cli import ui
from klisk.core.paths import list_projects, PROJECTS_DIR


def list_cmd() -> None:
    """List all Klisk projects."""
    projects = list_projects()

    if not projects:
        ui.info(f"No projects found in {PROJECTS_DIR}")
        ui.next_steps(["klisk create my-agent"])
        return

    ui.header(f"Projects ({len(projects)})")
    ui.plain()
    rows = [(p["name"], p["entry"], p["path"]) for p in projects]
    ui.table(["Name", "Entry", "Path"], rows)
