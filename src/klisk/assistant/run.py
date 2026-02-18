"""Interactive assistant loop using Claude Agent SDK."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from klisk.assistant.prompt import SYSTEM_PROMPT


def _check_sdk_installed() -> bool:
    try:
        import claude_agent_sdk  # noqa: F401

        return True
    except ImportError:
        return False


_TOKEN_FILE = Path.home() / ".klisk" / "token"


def _ensure_auth() -> None:
    import os

    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return

    # Intentar leer token guardado
    if _TOKEN_FILE.exists():
        saved = _TOKEN_FILE.read_text().strip()
        if saved:
            os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = saved
            return

    print()
    print("  No authentication found.")
    print()
    print("  To log in with your Claude account, run:")
    print()
    print("    claude setup-token")
    print()
    print("  Then paste the token below.")
    print()

    try:
        token = input("  Token: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        raise SystemExit(1)

    if not token:
        print("\nError: No token provided.", file=sys.stderr)
        raise SystemExit(1)

    # Guardar token para próximas sesiones
    _TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    _TOKEN_FILE.write_text(token)
    _TOKEN_FILE.chmod(0o600)

    os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = token


async def _run_loop(cwd: Path) -> None:
    from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query
    from claude_agent_sdk.types import StreamEvent

    print()
    print("  Klisk Assistant")
    print(f"  Working in: {cwd}")
    print("  Type 'exit' or Ctrl+C to quit.")
    print()

    session_id: str | None = None

    while True:
        try:
            user_input = input("You: ")
        except (EOFError, KeyboardInterrupt):
            print()
            break

        stripped = user_input.strip()
        if stripped.lower() in ("exit", "quit"):
            break
        if not stripped:
            continue

        options = ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            include_partial_messages=True,
            allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
            permission_mode="acceptEdits",
            cwd=str(cwd),
            max_turns=50,
        )

        if session_id:
            options.resume = session_id

        print()
        in_tool = False
        try:
            async for message in query(prompt=stripped, options=options):
                # Capture session ID from init message
                if (
                    hasattr(message, "subtype")
                    and message.subtype == "init"
                    and hasattr(message, "data")
                ):
                    session_id = message.data.get("session_id", session_id)

                # Stream text token-by-token
                elif isinstance(message, StreamEvent):
                    event = message.event
                    event_type = event.get("type")

                    if event_type == "content_block_start":
                        block = event.get("content_block", {})
                        if block.get("type") == "tool_use":
                            name = block.get("name", "")
                            print(f"\n  > {name}", end="", flush=True)
                            in_tool = True

                    elif event_type == "content_block_delta":
                        delta = event.get("delta", {})
                        if delta.get("type") == "text_delta" and not in_tool:
                            print(delta.get("text", ""), end="", flush=True)

                    elif event_type == "content_block_stop":
                        if in_tool:
                            in_tool = False

                elif isinstance(message, ResultMessage):
                    if hasattr(message, "result") and message.result:
                        print(message.result, flush=True)

        except KeyboardInterrupt:
            print("\n  (interrupted)")
        except Exception as e:
            print(f"\n  Error: {e}", file=sys.stderr)

        print()


def run_assistant(cwd: Path) -> None:
    """Start the interactive assistant loop."""
    if not _check_sdk_installed():
        print(
            "Error: claude-agent-sdk is not installed.\n"
            "Install it with: pip install 'klisk[assistant]'",
            file=sys.stderr,
        )
        raise SystemExit(1)

    _ensure_auth()

    asyncio.run(_run_loop(cwd))
