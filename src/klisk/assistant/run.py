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


def _prepare_env() -> None:
    import os
    import shutil

    # Limpiar CLAUDECODE para que el subprocess de Claude Code no detecte
    # una sesión anidada y pueda usar sus credenciales OAuth normalmente.
    os.environ.pop("CLAUDECODE", None)

    if not shutil.which("claude"):
        print(
            "Error: Claude Code CLI not found.\n"
            "Install it with: npm install -g @anthropic-ai/claude-code",
            file=sys.stderr,
        )
        raise SystemExit(1)


async def _run_loop(cwd: Path) -> None:
    from claude_agent_sdk import (
        AssistantMessage,
        ClaudeAgentOptions,
        ResultMessage,
        query,
    )

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
            allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
            permission_mode="acceptEdits",
            cwd=str(cwd),
            max_turns=50,
        )

        if session_id:
            options.resume = session_id

        print()
        try:
            async for message in query(prompt=stripped, options=options):
                # Capture session ID from init message
                if (
                    hasattr(message, "subtype")
                    and message.subtype == "init"
                    and hasattr(message, "data")
                ):
                    session_id = message.data.get("session_id", session_id)

                # Print assistant text
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if hasattr(block, "text"):
                            print(block.text, end="", flush=True)
                        elif hasattr(block, "name"):
                            tool_name = block.name
                            # Show a brief indicator for tool calls
                            detail = ""
                            if hasattr(block, "input"):
                                inp = block.input
                                if isinstance(inp, dict):
                                    path = inp.get("file_path") or inp.get("pattern") or inp.get("command", "")
                                    if path:
                                        detail = f": {path}"
                            print(f"\n  > {tool_name}{detail}", flush=True)

                # Print final result
                elif isinstance(message, ResultMessage):
                    if hasattr(message, "result") and message.result:
                        print(message.result, flush=True)

        except KeyboardInterrupt:
            print("\n  (interrupted)")
        except Exception as e:
            msg = str(e).lower()
            if "not logged in" in msg or "login" in msg or "unauthorized" in msg:
                print(
                    "\n  Not logged into Claude."
                    "\n  Run 'claude' in another terminal to log in,"
                    "\n  then try again.",
                    file=sys.stderr,
                )
                break
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

    _prepare_env()

    asyncio.run(_run_loop(cwd))
