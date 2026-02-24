"""Local production server lifecycle management for Klisk Studio."""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import httpx

from klisk.core.paths import KLISK_HOME

logger = logging.getLogger(__name__)

RUN_DIR = KLISK_HOME / "run"
LOG_DIR = KLISK_HOME / "logs"


@dataclass
class LocalServerInfo:
    pid: int
    port: int
    project: str
    started_at: str
    cwd: str
    log_file: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> LocalServerInfo:
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


def _pid_file_path(project: str) -> Path:
    return RUN_DIR / f"prod-{project}.pid"


def _log_file_path(project: str) -> Path:
    return LOG_DIR / f"prod-{project}.log"


def _is_process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


def _is_port_in_use(port: int) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def _find_pid_on_port(port: int) -> int | None:
    """Find the PID of the process listening on *port* using lsof."""
    try:
        out = subprocess.check_output(
            ["lsof", "-ti", f"tcp:{port}", "-sTCP:LISTEN"],
            text=True, timeout=5,
        ).strip()
        if out:
            return int(out.splitlines()[0])
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError):
        pass
    return None


def _find_free_port(start: int = 8080) -> int:
    """Find a free port starting from *start*."""
    import socket

    for port in range(start, start + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    # Last resort: let the OS pick
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for_port(port: int, pid: int, timeout: float = 10.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not _is_process_alive(pid):
            return False
        if _is_port_in_use(port):
            return True
        time.sleep(0.2)
    return False


def _read_pid_info(project: str) -> LocalServerInfo | None:
    pid_path = _pid_file_path(project)
    if not pid_path.exists():
        return None

    try:
        data = json.loads(pid_path.read_text(encoding="utf-8"))
        info = LocalServerInfo.from_dict(data)
    except (json.JSONDecodeError, KeyError, TypeError):
        logger.warning("Corrupt PID file %s, removing", pid_path)
        pid_path.unlink(missing_ok=True)
        return None

    if not _is_process_alive(info.pid):
        logger.debug("Stale PID file %s (pid %d dead), removing", pid_path, info.pid)
        pid_path.unlink(missing_ok=True)
        return None

    return info


def _write_pid_info(project: str, info: LocalServerInfo) -> None:
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    pid_path = _pid_file_path(project)
    pid_path.write_text(json.dumps(info.to_dict(), indent=2), encoding="utf-8")


def _probe_server_name(port: int) -> str | None:
    """Return the project name running on the given port, or None."""
    try:
        r = httpx.get(f"http://127.0.0.1:{port}/api/info", timeout=2)
        if r.status_code == 200:
            return r.json().get("name")
    except Exception:
        pass
    return None


def get_status(project: str, port: int = 8080, config_name: str = "") -> dict:
    """Get the status of the local production server.

    Args:
        project: Project directory name (used for PID file lookup).
        port: Port to check as fallback.
        config_name: Project config name to match against /api/info.
    """
    info = _read_pid_info(project)
    if info is not None:
        return {
            "running": True,
            "port": info.port,
            "pid": info.pid,
            "url": f"http://localhost:{info.port}",
        }

    # Fallback: check if port is in use and the running project matches
    if _is_port_in_use(port):
        running_name = _probe_server_name(port)
        if running_name and config_name and running_name == config_name:
            return {
                "running": True,
                "port": port,
                "pid": None,
                "url": f"http://localhost:{port}",
            }

    return {"running": False, "port": None, "pid": None, "url": None}


def start_server(project_path: Path, project: str) -> dict:
    """Start the production server as a background process on a free port."""
    # Already running via PID file?
    info = _read_pid_info(project)
    if info is not None:
        return {"ok": True, "port": info.port, "pid": info.pid, "url": f"http://localhost:{info.port}"}

    port = _find_free_port()

    RUN_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    log_path = _log_file_path(project)

    cmd = [
        sys.executable, "-m", "klisk.cli._start_worker",
        "--project-path", str(project_path),
        "--port", str(port),
    ]

    log_fh = open(log_path, "a", encoding="utf-8")

    proc = subprocess.Popen(
        cmd,
        stdout=log_fh,
        stderr=log_fh,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
    )

    if not _wait_for_port(port, proc.pid, timeout=30.0):
        log_fh.close()
        # Kill the orphan process so it doesn't linger in the background
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except (OSError, ProcessLookupError):
            try:
                os.kill(proc.pid, signal.SIGTERM)
            except (OSError, ProcessLookupError):
                pass
        tail = ""
        try:
            lines = log_path.read_text(encoding="utf-8").strip().splitlines()
            tail = "\n".join(lines[-5:])
        except Exception:
            pass
        return {"ok": False, "error": f"Server failed to start.\n{tail}"}

    log_fh.close()

    info = LocalServerInfo(
        pid=proc.pid,
        port=port,
        project=project,
        started_at=datetime.now(timezone.utc).isoformat(),
        cwd=str(project_path),
        log_file=str(log_path),
    )
    _write_pid_info(project, info)

    return {"ok": True, "port": port, "pid": proc.pid, "url": f"http://localhost:{port}"}


def _kill_and_wait(pid: int, port: int) -> bool:
    """Send SIGTERM (then SIGKILL) to *pid*'s process group and wait for *port* to free."""
    # SIGTERM the entire process group
    try:
        os.killpg(os.getpgid(pid), signal.SIGTERM)
    except (OSError, ProcessLookupError):
        try:
            os.kill(pid, signal.SIGTERM)
        except (OSError, ProcessLookupError):
            pass

    for _ in range(30):
        if not _is_process_alive(pid) and not _is_port_in_use(port):
            return True
        time.sleep(0.1)

    # SIGKILL as fallback
    try:
        os.killpg(os.getpgid(pid), signal.SIGKILL)
    except (OSError, ProcessLookupError):
        try:
            os.kill(pid, signal.SIGKILL)
        except (OSError, ProcessLookupError):
            pass

    for _ in range(10):
        if not _is_process_alive(pid) and not _is_port_in_use(port):
            return True
        time.sleep(0.1)

    return not _is_port_in_use(port)


def stop_server(project: str, port: int = 8080, config_name: str = "") -> dict:
    """Stop a running production server.

    Handles two cases:
    1. Server started by Studio (has PID file) — kill by PID.
    2. Server started by ``klisk start`` (no PID file) — find PID via port.
    """
    info = _read_pid_info(project)

    if info is not None:
        # Case 1: PID file exists
        ok = _kill_and_wait(info.pid, info.port)
        _pid_file_path(project).unlink(missing_ok=True)
        if ok:
            return {"ok": True, "message": "Server stopped"}
        return {"ok": False, "error": f"Failed to free port {info.port}"}

    # Case 2: No PID file — look for the process on the fallback port
    if _is_port_in_use(port):
        running_name = _probe_server_name(port)
        if running_name and config_name and running_name == config_name:
            pid = _find_pid_on_port(port)
            if pid is not None:
                ok = _kill_and_wait(pid, port)
                if ok:
                    return {"ok": True, "message": "Server stopped"}
                return {"ok": False, "error": f"Failed to free port {port}"}

    return {"ok": True, "message": "Server is not running"}
