"""Discovery module: dynamically loads the user's agent project."""

from __future__ import annotations

import glob as glob_mod
import importlib.util
import logging
import sys
from pathlib import Path

from klisk.core.config import ProjectConfig
from klisk.core.registry import AgentRegistry, ProjectSnapshot

logger = logging.getLogger(__name__)

# Directories inside a project that should never be treated as user source code.
_SKIP_DIRS = {"venv", "env", "node_modules", "__pycache__"}


def _activate_venv_packages(project_dir: Path) -> None:
    """Add the project's venv site-packages to sys.path if present."""
    for venv_name in (".venv", "venv"):
        venv_dir = project_dir / venv_name
        if not venv_dir.is_dir():
            continue
        # Unix: lib/python*/site-packages  Windows: Lib/site-packages
        candidates = glob_mod.glob(str(venv_dir / "lib" / "python*" / "site-packages"))
        if not candidates:
            candidates = glob_mod.glob(str(venv_dir / "Lib" / "site-packages"))
        for sp in candidates:
            if sp not in sys.path:
                sys.path.insert(0, sp)
                logger.debug("Activated venv site-packages: %s", sp)
        break  # Only use the first venv found


def discover_project(project_dir: str | Path) -> ProjectSnapshot:
    """Load a project from disk and return a snapshot of its agents and tools.

    Steps:
    1. Parse klisk.config.yaml
    2. Clear the registry (for hot reload)
    3. Import all .py files (tools first, then entry point)
    4. Return the populated ProjectSnapshot
    """
    project_dir = Path(project_dir).resolve()
    config = ProjectConfig.load(project_dir)

    registry = AgentRegistry.get_instance()
    registry.clear()

    _activate_venv_packages(project_dir)

    entry_path = project_dir / config.entry
    if not entry_path.exists():
        raise FileNotFoundError(f"Entry point not found: {entry_path}")

    _clean_project_modules(project_dir)

    # Import all .py files EXCEPT the entry point first (registers tools)
    _import_project_modules(project_dir, exclude=entry_path)

    # Then import the entry point (can use get_tools() to reference registered tools)
    _import_module_from_path(entry_path, project_dir)

    snapshot = registry.get_project_snapshot()
    snapshot.config = {
        "name": config.name,
        "entry": config.entry,
        "studio": config.studio.model_dump(),
        "api": config.api.model_dump(),
        "deploy": config.deploy.model_dump(),
    }
    return snapshot


def _clean_project_modules(project_dir: Path) -> None:
    """Remove previously loaded project modules from sys.modules for hot reload.

    Only removes user source modules whose files live directly in the project
    tree.  Modules inside virtual-env directories (``.venv``, ``venv``, etc.)
    are preserved so that ``klisk`` and its dependencies keep working even when
    installed in the project's own virtual environment.
    """
    project_str = str(project_dir)
    for key in list(sys.modules.keys()):
        if key == "__main__":
            continue
        mod = sys.modules[key]
        mod_file = getattr(mod, "__file__", None)
        if not mod_file:
            continue
        resolved = str(Path(mod_file).resolve())
        if not resolved.startswith(project_str):
            continue
        # Check if the file is inside a venv / hidden directory within the project
        rel = resolved[len(project_str):].lstrip("/").lstrip("\\")
        first_part = rel.split("/")[0].split("\\")[0]
        if first_part in _SKIP_DIRS or first_part.startswith("."):
            continue
        del sys.modules[key]


def _import_project_modules(project_dir: Path, exclude: Path) -> None:
    """Import all .py files in the project tree except the excluded file."""
    exclude_resolved = exclude.resolve()
    project_resolved = project_dir.resolve()
    for py_file in sorted(project_dir.rglob("*.py")):
        if py_file.resolve() == exclude_resolved:
            continue
        if py_file.name == "__init__.py":
            continue
        # Skip hidden dirs, venvs, and other non-source directories
        rel_parts = py_file.resolve().relative_to(project_resolved).parts
        if any(
            part.startswith(".") or part in _SKIP_DIRS for part in rel_parts
        ):
            continue
        _import_module_from_path(py_file, project_dir)


def _import_module_from_path(file_path: Path, project_dir: Path) -> None:
    """Dynamically import a Python file, adding the project dir to sys.path."""
    project_str = str(project_dir)
    if project_str not in sys.path:
        sys.path.insert(0, project_str)

    # Create a unique module name based on relative path to avoid conflicts
    rel = file_path.resolve().relative_to(project_dir.resolve())
    module_name = "_klisk_." + str(rel.with_suffix("")).replace("/", ".").replace("\\", ".")

    if module_name in sys.modules:
        del sys.modules[module_name]

    spec = importlib.util.spec_from_file_location(module_name, str(file_path))
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)


def discover_all_projects() -> ProjectSnapshot:
    """Load all projects from ~/klisk/projects/ and return a merged snapshot.

    Each agent/tool entry is tagged with its project name.
    If two projects define an agent/tool with the same name, the entries are
    prefixed with ``project_name/`` to avoid collisions.

    Environment variables are loaded per-project (not globally) so that each
    project's API keys stay isolated.
    """
    from klisk.core.env import clear_project_envs, load_project_env, project_env_context
    from klisk.core.paths import PROJECTS_DIR

    merged = ProjectSnapshot()
    merged.config = {"name": "Klisk Workspace", "workspace": True}

    if not PROJECTS_DIR.exists():
        return merged

    clear_project_envs()

    # Collect snapshots per project, tracking name collisions
    project_snapshots: list[tuple[str, ProjectSnapshot]] = []
    agent_origins: dict[str, list[str]] = {}  # agent_name -> [project_names]
    tool_origins: dict[str, list[str]] = {}   # tool_name  -> [project_names]

    for entry in sorted(PROJECTS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        config_file = entry / "klisk.config.yaml"
        if not config_file.exists():
            continue
        project_name = entry.name
        try:
            load_project_env(entry)
            with project_env_context(project_name):
                snap = discover_project(entry)
        except Exception as exc:
            logger.warning("Failed to load project '%s': %s", project_name, exc)
            continue

        # Tag entries with project name
        for ae in snap.agents.values():
            ae.project = project_name
            agent_origins.setdefault(ae.name, []).append(project_name)
        for te in snap.tools.values():
            te.project = project_name
            tool_origins.setdefault(te.name, []).append(project_name)

        project_snapshots.append((project_name, snap))

    # Detect collisions (name used in more than one project)
    colliding_agents = {n for n, projs in agent_origins.items() if len(projs) > 1}
    colliding_tools = {n for n, projs in tool_origins.items() if len(projs) > 1}

    # Merge into a single snapshot, prefixing colliding names
    for project_name, snap in project_snapshots:
        for name, ae in snap.agents.items():
            key = f"{project_name}/{name}" if name in colliding_agents else name
            ae.name = key
            merged.agents[key] = ae
        for name, te in snap.tools.items():
            key = f"{project_name}/{name}" if name in colliding_tools else name
            te.name = key
            merged.tools[key] = te

    return merged
