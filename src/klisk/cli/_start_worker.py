"""Background worker process for klisk production server.

Run as: python -m klisk.cli._start_worker --project-path PATH --port PORT

This module is spawned by local_server.start_server() and should NOT be called
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
    parser.add_argument("--project-path", type=str, required=True)
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    project_path = Path(args.project_path)

    from dotenv import load_dotenv

    load_dotenv(project_path / ".env")

    from klisk.server.production import create_production_app, run_production_server

    app = create_production_app(project_path)
    run_production_server(app, host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
