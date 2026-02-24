"""File watcher for hot reload."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Callable, Awaitable

from watchfiles import awatch


async def start_watcher(
    project_dir: Path,
    on_change: Callable[[bool], Awaitable[None]],
) -> None:
    """Watch for .py and .yaml file changes in the project directory and trigger reloads.

    The callback receives a boolean: ``True`` if any ``.py`` file changed
    (requires full discovery), ``False`` if only ``.yaml``/``.yml`` files
    changed (light config reload is sufficient).
    """
    async for changes in awatch(project_dir):
        py_changed = False
        has_relevant = False
        for _change_type, path in changes:
            if not _is_relevant(path):
                continue
            has_relevant = True
            if Path(path).suffix == ".py":
                py_changed = True
                break  # no need to check further
        if has_relevant:
            await on_change(py_changed)


def _is_relevant(path: str) -> bool:
    p = Path(path)
    # Ignore hidden dirs, __pycache__, node_modules, .venv
    parts = p.parts
    if any(part.startswith(".") or part == "__pycache__" or part == "node_modules" or part == ".venv" for part in parts):
        return False
    return p.suffix in {".py", ".yaml", ".yml"}
