"""Integration tests for CLI commands."""

import subprocess
import sys
from pathlib import Path

from agentkit.core.paths import get_project_path


def test_create_and_check():
    name = "_test_cli_create_check"
    project_dir = get_project_path(name)

    # Clean up in case of previous failed run
    if project_dir.exists():
        import shutil
        shutil.rmtree(project_dir)

    try:
        # Create project
        result = subprocess.run(
            ["agentkit", "create", name],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        assert "Created project" in result.stdout
        assert project_dir.exists()
        assert (project_dir / "agentkit.config.yaml").exists()
        assert (project_dir / "agents" / "main.py").exists()
        assert (project_dir / ".env.example").exists()

        # Check project
        result = subprocess.run(
            ["agentkit", "check", name],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        assert "All checks passed" in result.stdout
    finally:
        if project_dir.exists():
            import shutil
            shutil.rmtree(project_dir)


def test_create_existing_project():
    name = "_test_cli_existing"
    project_dir = get_project_path(name)

    if project_dir.exists():
        import shutil
        shutil.rmtree(project_dir)

    try:
        # Create the project first
        subprocess.run(["agentkit", "create", name], capture_output=True)

        # Try to create again — should fail
        result = subprocess.run(
            ["agentkit", "create", name],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 1
    finally:
        if project_dir.exists():
            import shutil
            shutil.rmtree(project_dir)


def test_list_projects():
    name = "_test_cli_list"
    project_dir = get_project_path(name)

    if project_dir.exists():
        import shutil
        shutil.rmtree(project_dir)

    try:
        subprocess.run(["agentkit", "create", name], capture_output=True)

        result = subprocess.run(
            ["agentkit", "list"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        assert name in result.stdout
    finally:
        if project_dir.exists():
            import shutil
            shutil.rmtree(project_dir)


def test_delete_project():
    name = "_test_cli_delete"
    project_dir = get_project_path(name)

    if project_dir.exists():
        import shutil
        shutil.rmtree(project_dir)

    subprocess.run(["agentkit", "create", name], capture_output=True)
    assert project_dir.exists()

    result = subprocess.run(
        ["agentkit", "delete", name, "--force"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert not project_dir.exists()
