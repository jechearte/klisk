"""Per-project environment variable isolation.

Instead of loading all project .env files into os.environ (which leaks keys
between projects), this module caches each project's variables in memory and
provides a context manager to temporarily apply them during discovery.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path

from dotenv import dotenv_values

# project_name -> {VAR: value}
_project_envs: dict[str, dict[str, str]] = {}


def load_project_env(project_dir: Path) -> None:
    """Read a project's .env file and cache its variables (does NOT touch os.environ)."""
    env_file = project_dir / ".env"
    if env_file.exists():
        raw = dotenv_values(env_file)
        _project_envs[project_dir.name] = {k: v for k, v in raw.items() if v is not None}
    else:
        _project_envs[project_dir.name] = {}


def get_project_env(project_name: str | None) -> dict[str, str]:
    """Return the cached env dict for a project (empty dict if unknown)."""
    if not project_name:
        return {}
    return _project_envs.get(project_name, {})


def clear_project_envs() -> None:
    """Clear the entire cache (used on hot reload)."""
    _project_envs.clear()


@contextmanager
def project_env_context(project_name: str):
    """Temporarily apply a project's env vars to os.environ, then restore.

    This is used during discovery so that _resolve_model() can read the
    correct API keys for each project.
    """
    env_vars = get_project_env(project_name)
    old_values: dict[str, str | None] = {}

    for key, value in env_vars.items():
        old_values[key] = os.environ.get(key)
        os.environ[key] = value

    try:
        yield
    finally:
        for key in env_vars:
            prev = old_values.get(key)
            if prev is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = prev
