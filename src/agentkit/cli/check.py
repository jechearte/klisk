"""agentkit check — validate the project structure."""

from __future__ import annotations

from pathlib import Path

import typer

from agentkit.core.config import ProjectConfig
from agentkit.core.paths import resolve_project


def check(
    name_or_path: str = typer.Argument(".", help="Project name or path"),
) -> None:
    """Validate that the project is well-formed."""
    project_path = resolve_project(name_or_path)
    errors: list[str] = []
    ok: list[str] = []

    # 1. Config
    config_path = project_path / "agentkit.config.yaml"
    if config_path.exists():
        try:
            config = ProjectConfig.load(project_path)
            ok.append("Config valid")
        except Exception as e:
            errors.append(f"Config error: {e}")
            config = ProjectConfig()
    else:
        ok.append("Config valid (using defaults)")
        config = ProjectConfig()

    # 2. Entry point
    entry_path = project_path / config.entry
    if entry_path.exists():
        ok.append(f"Entry point: {config.entry}")
    else:
        errors.append(f"Entry point not found: {config.entry}")

    # 3. Try to discover agents and tools
    if entry_path.exists():
        try:
            from agentkit.core.discovery import discover_project

            snapshot = discover_project(project_path)

            agent_count = len(snapshot.agents)
            tool_count = len(snapshot.tools)
            ok.append(f"{agent_count} agent(s) registered")
            ok.append(f"{tool_count} tool(s) registered")

            # 4. Validate tools have docstrings and type hints
            for name, tool_entry in snapshot.tools.items():
                if not tool_entry.description:
                    errors.append(f"Tool '{name}' missing docstring")

        except Exception as e:
            errors.append(f"Discovery error: {e}")

    # Print results
    for msg in ok:
        typer.echo(f"  \u2713 {msg}")
    for msg in errors:
        typer.echo(f"  \u2717 {msg}")

    if errors:
        raise typer.Exit(1)
    else:
        typer.echo()
        typer.echo("All checks passed.")
