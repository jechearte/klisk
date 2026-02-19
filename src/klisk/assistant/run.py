"""Interactive assistant loop using Claude Agent SDK."""

from __future__ import annotations

import asyncio
import shutil
import sys
from pathlib import Path

from klisk.assistant.prompt import SYSTEM_PROMPT


def _check_sdk_installed() -> bool:
    try:
        import claude_agent_sdk  # noqa: F401

        return True
    except ImportError:
        return False


def _patch_sdk_message_parser() -> None:
    """Patch SDK parser to tolerate new CLI event message types."""
    try:
        from claude_agent_sdk._errors import MessageParseError
        from claude_agent_sdk._internal import client as internal_client
        from claude_agent_sdk._internal import message_parser as parser_module
        from claude_agent_sdk.types import SystemMessage
    except Exception:
        return

    if getattr(internal_client, "_klisk_parser_patched", False):
        return

    original_parse_message = internal_client.parse_message

    def _parse_message_with_fallback(data):  # type: ignore[no-untyped-def]
        try:
            return original_parse_message(data)
        except MessageParseError:
            if isinstance(data, dict):
                message_type = data.get("type")
                if isinstance(message_type, str) and message_type.endswith("_event"):
                    return SystemMessage(subtype=message_type, data=data)
            raise

    internal_client.parse_message = _parse_message_with_fallback
    parser_module.parse_message = _parse_message_with_fallback
    internal_client._klisk_parser_patched = True


def _has_claude_auth_session() -> bool:
    import json
    import subprocess

    try:
        result = subprocess.run(
            ["claude", "auth", "status"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except Exception:
        return False

    try:
        payload = json.loads(result.stdout.strip() or "{}")
    except json.JSONDecodeError:
        return False

    return bool(payload.get("loggedIn"))


def _ensure_auth() -> None:
    import os
    import subprocess

    # Limpiar CLAUDECODE para evitar detección de sesión anidada
    os.environ.pop("CLAUDECODE", None)

    # Ya autenticado via env var
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return

    # Ya autenticado en Claude Code via `claude auth login`
    if _has_claude_auth_session():
        return

    # Pedir login o token al usuario
    print()
    print("  No authentication found.")
    print()
    print("  Sign in with Claude Code:")
    print()
    print("    claude auth login")
    print()
    print("  Press Enter to run that command now, or paste a token instead.")
    print()

    try:
        token = input("  Token (or Enter to login): ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        raise SystemExit(1)

    if not token:
        print()
        try:
            subprocess.run(["claude", "auth", "login"], check=False)
        except Exception as e:
            print(f"\nError: Could not run 'claude auth login': {e}", file=sys.stderr)
            raise SystemExit(1)

        if _has_claude_auth_session():
            return

        print(
            "\nError: Login did not complete. Run 'claude auth login' and retry.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = token


def _format_tool_detail(name: str, raw_json: str) -> str:
    import json

    try:
        inp = json.loads(raw_json)
    except (json.JSONDecodeError, ValueError):
        return ""

    detail = ""
    if name in ("Read", "Write", "Edit"):
        detail = inp.get("file_path", "")
    elif name == "Bash":
        detail = inp.get("command", "")
        if len(detail) > 60:
            detail = detail[:57] + "..."
    elif name == "Grep":
        detail = inp.get("pattern", "")
    elif name == "Glob":
        detail = inp.get("pattern", "")

    return f": {detail}" if detail else ""


async def _run_loop(cwd: Path, model: str) -> None:
    from claude_agent_sdk import ClaudeAgentOptions, HookMatcher, ResultMessage, query
    from claude_agent_sdk.types import StreamEvent
    from rich.console import Console
    from rich.live import Live
    from rich.markdown import Markdown

    console = Console()

    console.print()
    console.print(f"  [bold green]Klisk Assistant[/bold green] [dim]({model})[/dim]")
    console.print(f"  [dim]Working in:[/dim] {cwd}")
    console.print("  [dim]Type 'exit' or Ctrl+C to quit.[/dim]")
    console.print()

    # Use the same Claude binary available in the user's PATH so auth state matches.
    cli_path = shutil.which("claude")

    async def _bash_guard(input_data, tool_use_id, context):  # type: ignore[no-untyped-def]
        """Allow klisk CLI commands automatically; ask the user for anything else."""
        command = input_data.get("tool_input", {}).get("command", "").strip()
        if command.startswith("klisk"):
            return {}
        return {
            "hookSpecificOutput": {
                "hookEventName": input_data["hook_event_name"],
                "permissionDecision": "ask",
            }
        }

    def _on_stderr(line: str) -> None:
        console.print(f"  [dim red]{line.rstrip()}[/dim red]")

    session_id: str | None = None

    while True:
        try:
            user_input = console.input("[bold green]You:[/bold green] ")
        except (EOFError, KeyboardInterrupt):
            console.print()
            break

        stripped = user_input.strip()
        if stripped.lower() in ("exit", "quit"):
            break
        if not stripped:
            continue

        import os

        # Ensure CLAUDECODE is cleared to avoid nested session detection
        os.environ.pop("CLAUDECODE", None)

        sdk_env: dict[str, str] = {}
        for key in ("ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"):
            val = os.environ.get(key)
            if val:
                sdk_env[key] = val

        # Debug: show which auth source is being used
        if sdk_env:
            auth_keys = ", ".join(sdk_env.keys())
            console.print(f"  [dim]Auth: {auth_keys}[/dim]")
        elif _has_claude_auth_session():
            console.print("  [dim]Auth: claude auth session[/dim]")
        else:
            console.print("  [bold red]Warning: No auth tokens found in env![/bold red]")

        options = ClaudeAgentOptions(
            model=model,
            system_prompt=SYSTEM_PROMPT,
            include_partial_messages=True,
            allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Skill"],
            setting_sources=["user", "project"],
            permission_mode="bypassPermissions",
            hooks={
                "PreToolUse": [
                    HookMatcher(matcher="Bash", hooks=[_bash_guard]),
                ],
            },
            cwd=str(cwd),
            max_turns=50,
            env=sdk_env,
            cli_path=cli_path,
            stderr=_on_stderr,
        )

        if session_id:
            options.resume = session_id

        console.print()
        text_buffer = ""
        tool_input_buffer = ""
        current_tool = ""
        in_tool = False
        live: Live | None = None
        try:
            async for message in query(prompt=stripped, options=options):
                # Capture session ID from init message
                if (
                    hasattr(message, "subtype")
                    and message.subtype == "init"
                    and hasattr(message, "data")
                ):
                    session_id = message.data.get("session_id", session_id)

                elif isinstance(message, StreamEvent):
                    event = message.event
                    event_type = event.get("type")

                    if event_type == "content_block_start":
                        block = event.get("content_block", {})
                        if block.get("type") == "tool_use":
                            if live:
                                live.stop()
                                live = None
                                text_buffer = ""
                            current_tool = block.get("name", "")
                            tool_input_buffer = ""
                            in_tool = True
                        elif block.get("type") == "text":
                            text_buffer = ""
                            live = Live(
                                Markdown(text_buffer),
                                console=console,
                                refresh_per_second=8,
                            )
                            live.start()

                    elif event_type == "content_block_delta":
                        delta = event.get("delta", {})
                        if delta.get("type") == "text_delta" and not in_tool:
                            text_buffer += delta.get("text", "")
                            if live:
                                live.update(Markdown(text_buffer))
                        elif delta.get("type") == "input_json_delta" and in_tool:
                            tool_input_buffer += delta.get("partial_json", "")

                    elif event_type == "content_block_stop":
                        if in_tool:
                            detail = _format_tool_detail(
                                current_tool, tool_input_buffer
                            )
                            console.print(
                                f"  [dim]> {current_tool}{detail}[/dim]"
                            )
                            in_tool = False
                        elif live:
                            live.stop()
                            live = None
                            text_buffer = ""

                elif isinstance(message, ResultMessage):
                    if live:
                        live.stop()
                        live = None

        except KeyboardInterrupt:
            if live:
                live.stop()
            console.print("\n  [dim](interrupted)[/dim]")
        except Exception as e:
            if live:
                live.stop()
            console.print(f"\n  [bold red]Error:[/bold red] {e}")
            # Show subprocess details if available
            if hasattr(e, "stderr") and e.stderr:
                console.print(f"  [dim red]{e.stderr}[/dim red]")
            if hasattr(e, "stdout") and e.stdout:
                console.print(f"  [dim]{e.stdout}[/dim]")

        console.print()


def run_assistant(cwd: Path, *, model: str = "opus") -> None:
    """Start the interactive assistant loop."""
    if not _check_sdk_installed():
        print(
            "Error: claude-agent-sdk is not installed.\n"
            "Install it with: pip install 'klisk[assistant]'",
            file=sys.stderr,
        )
        raise SystemExit(1)

    _patch_sdk_message_parser()
    _ensure_auth()

    asyncio.run(_run_loop(cwd, model))
