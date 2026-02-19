"""Download and install the klisk-guide skill from GitHub."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

SKILL_REPO = "jechearte/skills"
SKILL_PATH = "skills/klisk-guide"
GITHUB_API_URL = f"https://api.github.com/repos/{SKILL_REPO}/contents/{SKILL_PATH}"


def install_skill(klisk_home: Path) -> None:
    """Download the klisk-guide skill to klisk_home/.claude/skills/klisk-guide/.

    Skips if the skill directory already exists. Silently fails on network errors.
    """
    skill_dir = klisk_home / ".claude" / "skills" / "klisk-guide"

    if skill_dir.exists():
        return

    try:
        _download_directory(GITHUB_API_URL, skill_dir)
    except (URLError, OSError, json.JSONDecodeError, KeyError):
        # Best-effort: clean up partial download
        if skill_dir.exists():
            shutil.rmtree(skill_dir, ignore_errors=True)


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
