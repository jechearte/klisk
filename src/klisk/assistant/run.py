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


def _save_token(token: str) -> None:
    _TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    _TOKEN_FILE.write_text(token)
    _TOKEN_FILE.chmod(0o600)


def _prepare_env() -> None:
    import os

    # Limpiar CLAUDECODE para que el subprocess de Claude Code
    # no detecte una sesión anidada y falle.
    os.environ.pop("CLAUDECODE", None)


def _ensure_auth() -> None:
    import os

    # Si ya hay API key, no hace falta nada más
    if os.environ.get("ANTHROPIC_API_KEY"):
        return

    # Si hay token en el entorno, guardarlo para futuras sesiones
    env_token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
    if env_token:
        if not _TOKEN_FILE.exists():
            _save_token(env_token)
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

    _save_token(token)
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
    from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query
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

        sdk_env: dict[str, str] = {}
        for key in ("ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"):
            val = os.environ.get(key)
            if val:
                sdk_env[key] = val

        options = ClaudeAgentOptions(
            model=model,
            system_prompt=SYSTEM_PROMPT,
            include_partial_messages=True,
            allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
            permission_mode="acceptEdits",
            cwd=str(cwd),
            max_turns=50,
            env=sdk_env,
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

    _prepare_env()
    _ensure_auth()

    asyncio.run(_run_loop(cwd, model))
