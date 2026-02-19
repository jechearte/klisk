"""Daemon lifecycle management for klisk studio server."""

from __future__ import annotations

import json
import logging
import os
import signal
import socket
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from klisk.core.paths import KLISK_HOME

logger = logging.getLogger(__name__)

RUN_DIR = KLISK_HOME / "run"
LOG_DIR = KLISK_HOME / "logs"


@dataclass
class PidInfo:
    pid: int
    port: int
    project: str
    started_at: str
    cwd: str
    log_file: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> PidInfo:
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


def _pid_file_name(project: str | None) -> str:
    """Return the PID file name for the given project (or workspace)."""
    return f"{project}.pid" if project else "workspace.pid"


def _pid_file_path(project: str | None) -> Path:
    return RUN_DIR / _pid_file_name(project)


def _log_file_path(project: str | None) -> Path:
    name = project or "workspace"
    return LOG_DIR / f"{name}.log"


def is_process_alive(pid: int) -> bool:
    """Check if a process with the given PID is still running."""
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


def _is_port_in_use(port: int) -> bool:
    """Check if a TCP port is already bound."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def _wait_for_port(port: int, pid: int, timeout: float = 5.0) -> bool:
    """Wait until the port is accepting connections or the process dies."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not is_process_alive(pid):
            return False
        if _is_port_in_use(port):
            return True
        time.sleep(0.2)
    return False


def read_pid_info(project: str | None) -> PidInfo | None:
    """Read PID file and return info if the process is still alive.

    Cleans up stale PID files automatically.
    """
    pid_path = _pid_file_path(project)
    if not pid_path.exists():
        return None

    try:
        data = json.loads(pid_path.read_text(encoding="utf-8"))
        info = PidInfo.from_dict(data)
    except (json.JSONDecodeError, KeyError, TypeError):
        logger.warning("Corrupt PID file %s, removing", pid_path)
        pid_path.unlink(missing_ok=True)
        return None

    if not is_process_alive(info.pid):
        logger.debug("Stale PID file %s (pid %d dead), removing", pid_path, info.pid)
        pid_path.unlink(missing_ok=True)
        return None

    return info


def _write_pid_info(project: str | None, info: PidInfo) -> None:
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    pid_path = _pid_file_path(project)
    pid_path.write_text(json.dumps(info.to_dict(), indent=2), encoding="utf-8")


def start_daemon(
    *,
    port: int,
    project: str | None = None,
    project_path: Path | None = None,
) -> PidInfo:
    """Launch the dev server as a background daemon.

    Returns the PidInfo of the launched process.
    Raises RuntimeError if the process fails to start.
    """
    # Fail early if the port is already taken
    if _is_port_in_use(port):
        raise RuntimeError(
            f"Port {port} is already in use. "
            f"Stop whatever is using it or choose a different port."
        )

    RUN_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    log_path = _log_file_path(project)

    # Build the worker command
    cmd = [
        sys.executable, "-m", "klisk.cli._dev_worker",
        "--port", str(port),
    ]
    if project_path is not None:
        cmd.extend(["--project-path", str(project_path)])

    log_fh = open(log_path, "a", encoding="utf-8")

    proc = subprocess.Popen(
        cmd,
        stdout=log_fh,
        stderr=log_fh,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
    )

    # Wait for the server to start accepting connections
    if not _wait_for_port(port, proc.pid, timeout=10.0):
        log_fh.close()
        # Process died or timed out — read last lines from log
        tail = ""
        try:
            lines = log_path.read_text(encoding="utf-8").strip().splitlines()
            tail = "\n  ".join(lines[-5:])
        except Exception:
            pass
        raise RuntimeError(
            f"Dev server failed to start.\n"
            f"Check logs: {log_path}\n  {tail}"
        )

    log_fh.close()

    info = PidInfo(
        pid=proc.pid,
        port=port,
        project=project or "workspace",
        started_at=datetime.now(timezone.utc).isoformat(),
        cwd=str(project_path or ""),
        log_file=str(log_path),
    )
    _write_pid_info(project, info)

    return info


def stop_daemon(project: str | None = None) -> bool:
    """Stop a running daemon. Returns True if a process was stopped."""
    info = read_pid_info(project)
    if info is None:
        return False

    try:
        os.kill(info.pid, signal.SIGTERM)
    except (OSError, ProcessLookupError):
        pass

    # Wait briefly for the process to exit
    for _ in range(20):
        if not is_process_alive(info.pid):
            break
        time.sleep(0.1)

    # Clean up PID file
    pid_path = _pid_file_path(project)
    pid_path.unlink(missing_ok=True)

    return True
