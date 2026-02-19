"""Background worker process for klisk studio server.

Run as: python -m klisk.cli._dev_worker --port PORT [--project-path PATH]

This module is spawned by daemon.start_daemon() and should NOT be called
directly by end-users.
"""

from __future__ import annotations

import argparse
import signal
from pathlib import Path


def _ignore_sighup() -> None:
    """Ignore SIGHUP so the process survives terminal close."""
    if hasattr(signal, "SIGHUP"):
        signal.signal(signal.SIGHUP, signal.SIG_IGN)


def _handle_sigterm() -> None:
    """Convert SIGTERM into a clean SystemExit."""
    def _on_sigterm(signum, frame):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, _on_sigterm)


def main() -> None:
    _ignore_sighup()
    _handle_sigterm()

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--project-path", type=str, default=None)
    args = parser.parse_args()

    project_path: Path | None = Path(args.project_path) if args.project_path else None

    # Load environment variables (single-project mode only;
    # workspace mode loads env per-project during discovery)
    if project_path is not None:
        from dotenv import load_dotenv
        load_dotenv(project_path / ".env")

    # Create and run the app
    from klisk.server.app import create_app, run_server

    app = create_app(project_path)
    run_server(app, host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
