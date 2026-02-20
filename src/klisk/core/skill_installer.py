"""Download and install the klisk-guide skill from GitHub.

Installs to ~/.agents/skills/klisk-guide/ (open standard) and creates
a symlink at ~/.claude/skills/klisk-guide/ for Claude Code compatibility.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

SKILL_REPO = "jechearte/skills"
SKILL_PATH = "skills/klisk-guide"
GITHUB_API_URL = f"https://api.github.com/repos/{SKILL_REPO}/contents/{SKILL_PATH}"

SKILL_NAME = "klisk-guide"
AGENTS_SKILL_DIR = Path.home() / ".agents" / "skills" / SKILL_NAME
CLAUDE_SKILL_DIR = Path.home() / ".claude" / "skills" / SKILL_NAME


def install_skill(klisk_home: Path) -> None:
    """Download the klisk-guide skill to ~/.agents/skills/klisk-guide/.

    Also creates a symlink at ~/.claude/skills/klisk-guide/ so Claude Code
    can discover it until it natively supports the .agents standard.

    Skips if the skill is already installed. Silently fails on network errors.
    """
    if AGENTS_SKILL_DIR.exists():
        _ensure_claude_symlink()
        return

    try:
        _download_directory(GITHUB_API_URL, AGENTS_SKILL_DIR)
        _ensure_claude_symlink()
        _migrate_old_install()
    except (URLError, OSError, json.JSONDecodeError, KeyError):
        if AGENTS_SKILL_DIR.exists():
            shutil.rmtree(AGENTS_SKILL_DIR, ignore_errors=True)


def _ensure_claude_symlink() -> None:
    """Create symlink ~/.claude/skills/klisk-guide -> ~/.agents/skills/klisk-guide."""
    if CLAUDE_SKILL_DIR.is_symlink() or CLAUDE_SKILL_DIR.exists():
        return

    CLAUDE_SKILL_DIR.parent.mkdir(parents=True, exist_ok=True)
    os.symlink(AGENTS_SKILL_DIR, CLAUDE_SKILL_DIR)


def _migrate_old_install() -> None:
    """Remove old non-symlink install in ~/.claude/skills/klisk-guide/ if present."""
    if CLAUDE_SKILL_DIR.is_dir() and not CLAUDE_SKILL_DIR.is_symlink():
        shutil.rmtree(CLAUDE_SKILL_DIR, ignore_errors=True)
        os.symlink(AGENTS_SKILL_DIR, CLAUDE_SKILL_DIR)


def _download_directory(api_url: str, target_dir: Path) -> None:
    """Recursively download a GitHub directory via the Contents API."""
    req = Request(api_url, headers={"Accept": "application/vnd.github.v3+json"})
    with urlopen(req, timeout=10) as resp:
        items = json.loads(resp.read())

    target_dir.mkdir(parents=True, exist_ok=True)

    for item in items:
        if item["type"] == "file":
            with urlopen(item["download_url"], timeout=10) as resp:
                (target_dir / item["name"]).write_bytes(resp.read())
        elif item["type"] == "dir":
            _download_directory(item["url"], target_dir / item["name"])
