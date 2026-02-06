"""Central paths for AgentKit projects."""

from __future__ import annotations

from pathlib import Path
from typing import Any


AGENTKIT_HOME = Path.home() / "agentkit"
PROJECTS_DIR = AGENTKIT_HOME / "projects"


def get_projects_dir() -> Path:
    """Return the projects directory, creating it if needed."""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    return PROJECTS_DIR


def get_project_path(name: str) -> Path:
    """Return the path for a project by name."""
    return get_projects_dir() / name


def list_projects() -> list[dict[str, Any]]:
    """Scan PROJECTS_DIR and return info for each valid project."""
    projects_dir = get_projects_dir()
    results = []
    for entry in sorted(projects_dir.iterdir()):
        if not entry.is_dir():
            continue
        config_file = entry / "agentkit.config.yaml"
        if not config_file.exists():
            continue
        from agentkit.core.config import ProjectConfig
        try:
            config = ProjectConfig.load(entry)
            results.append({
                "name": config.name,
                "path": str(entry),
                "entry": config.entry,
                "model": config.defaults.model,
            })
        except Exception:
            results.append({
                "name": entry.name,
                "path": str(entry),
                "entry": "?",
                "model": "?",
            })
    return results


def resolve_project(name_or_path: str) -> Path:
    """Resolve a project name or path to an absolute directory.

    If it's a name (no slashes), look it up in PROJECTS_DIR.
    If it's a path, use it directly.
    """
    if "/" in name_or_path or name_or_path == ".":
        return Path(name_or_path).resolve()
    candidate = get_project_path(name_or_path)
    if candidate.exists():
        return candidate
    # Fallback: treat as a relative path
    return Path(name_or_path).resolve()
