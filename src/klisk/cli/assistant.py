"""klisk assistant — AI-powered helper for building agents."""

from __future__ import annotations

from typing import Optional

import typer


def assistant(
    project: Optional[str] = typer.Argument(
        None,
        help="Project name or path (defaults to ~/klisk/projects/)",
    ),
    model: str = typer.Option(
        "opus",
        "--model", "-m",
        help="Claude model to use (opus, sonnet, haiku).",
    ),
) -> None:
    """Start an AI assistant to help build and manage Klisk agents."""
    from klisk.core.paths import get_projects_dir, resolve_project

    if project:
        cwd = resolve_project(project)
    else:
        cwd = get_projects_dir()

    from klisk.assistant import run_assistant

    run_assistant(cwd, model=model)
