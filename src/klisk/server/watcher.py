"""File watcher for hot reload."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Callable, Awaitable

from watchfiles import awatch, Change


async def start_watcher(
    project_dir: Path,
    on_change: Callable[[], Awaitable[None]],
) -> None:
    """Watch for .py and .yaml file changes in the project directory and trigger reloads."""
    async for changes in awatch(project_dir):
        relevant = any(
            _is_relevant(path)
            for change_type, path in changes
        )
        if relevant:
            await on_change()


def _is_relevant(path: str) -> bool:
    p = Path(path)
    # Ignore hidden dirs, __pycache__, node_modules, .venv
    parts = p.parts
    if any(part.startswith(".") or part == "__pycache__" or part == "node_modules" or part == ".venv" for part in parts):
        return False
    return p.suffix in {".py", ".yaml", ".yml"}
