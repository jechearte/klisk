"""WebSocket handler for the Klisk Assistant in Studio.

Wraps the Claude Agent SDK to provide an interactive assistant
accessible from the Studio web UI, with bidirectional communication
for permission handling and user questions.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from pathlib import Path

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


def _check_sdk_installed() -> bool:
    try:
        import claude_agent_sdk  # noqa: F401
        return True
    except ImportError:
        return False


def _has_claude_auth() -> bool:
    """Check if any Claude auth method is available."""
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return True
    # Check claude CLI auth session
    import subprocess
    try:
        result = subprocess.run(
            ["claude", "auth", "status"],
            capture_output=True, text=True, timeout=5, check=False,
        )
        payload = json.loads(result.stdout.strip() or "{}")
        return bool(payload.get("loggedIn"))
    except Exception:
        return False


def _check_claude_cli_installed() -> bool:
    """Check if the Claude CLI is available in PATH."""
    return shutil.which("claude") is not None


def check_assistant_available() -> dict:
    """Return granular availability status for the assistant.

    Returns a dict with:
    - ``status``: one of "not_installed", "sdk_missing", "not_authenticated", "ready"
    - ``available``: bool (kept for backwards compatibility)
    """
    if not _check_claude_cli_installed():
        return {"status": "not_installed", "available": False}
    if not _check_sdk_installed():
        return {"status": "sdk_missing", "available": False}
    if not _has_claude_auth():
        return {"status": "not_authenticated", "available": False}
    return {"status": "ready", "available": True}


def _format_tool_detail(name: str, raw_json: str) -> str:
    """Extract a short detail string from tool input JSON."""
    try:
        inp = json.loads(raw_json)
    except (json.JSONDecodeError, ValueError):
        return ""
    detail = ""
    if name in ("Read", "Write", "Edit"):
        detail = inp.get("file_path", "")
    elif name == "Bash":
        detail = inp.get("command", "")
        if len(detail) > 80:
            detail = detail[:77] + "..."
    elif name == "Grep":
        detail = inp.get("pattern", "")
    elif name == "Glob":
        detail = inp.get("pattern", "")
    return detail


def _targets_env_file(tool_name: str, input_data: dict) -> bool:
    """Return True if the tool use targets a .env file."""
    if tool_name in ("Read", "Write", "Edit"):
        fp = input_data.get("file_path", "")
        basename = os.path.basename(fp)
        if basename == ".env" or basename.startswith(".env."):
            return True
    elif tool_name == "Grep":
        for field in ("path", "glob"):
            if ".env" in input_data.get(field, ""):
                return True
    elif tool_name == "Glob":
        if ".env" in input_data.get("pattern", ""):
            return True
    elif tool_name == "Bash":
        if ".env" in input_data.get("command", ""):
            return True
    return False


# Read-only system commands that are safe to auto-approve.
_SAFE_COMMANDS = {
    "ls", "find", "tree", "du", "df",
    "cat", "head", "tail", "wc", "file", "stat",
    "echo", "printf", "pwd", "which", "whoami", "hostname",
    "env", "printenv", "date", "uname",
}


async def handle_assistant_websocket(websocket: WebSocket, project_dir: Path) -> None:
    """Handle a WebSocket session for the Klisk Assistant.

    Communicates with the Claude Agent SDK, streaming events to the frontend
    and receiving permission responses and user answers.
    """
    await websocket.accept()

    if not _check_sdk_installed():
        await websocket.send_json({
            "type": "error",
            "data": "claude-agent-sdk is not installed. Run: pip install 'klisk[assistant]'",
        })
        await websocket.close()
        return

    # Patch SDK parser for new event types
    from klisk.assistant.run import _patch_sdk_message_parser
    _patch_sdk_message_parser()

    from claude_agent_sdk import ClaudeAgentOptions, HookMatcher, ResultMessage, query
    from claude_agent_sdk.types import (
        PermissionResultAllow,
        PermissionResultDeny,
        StreamEvent,
    )
    from klisk.assistant.prompt import SYSTEM_PROMPT

    cli_path = shutil.which("claude")
    session_id: str | None = None

    # Queue for interaction responses (permission + question answers)
    interaction_queue: asyncio.Queue[dict] = asyncio.Queue()
    # Queue for new user messages
    message_queue: asyncio.Queue[dict] = asyncio.Queue()
    # Flag to signal shutdown
    shutdown = asyncio.Event()
    # Flag to signal cancellation of the current query
    cancel_query = asyncio.Event()

    async def _reader_loop() -> None:
        """Read from WebSocket and dispatch to appropriate queues."""
        try:
            while not shutdown.is_set():
                raw = await websocket.receive_text()
                data = json.loads(raw)

                msg_type = data.get("type", "")

                if msg_type == "permission_response":
                    await interaction_queue.put(data)
                elif msg_type == "question_response":
                    await interaction_queue.put(data)
                elif msg_type == "cancel":
                    cancel_query.set()
                elif msg_type == "clear":
                    # Reset session
                    nonlocal session_id
                    session_id = None
                    # Drain queues
                    while not interaction_queue.empty():
                        interaction_queue.get_nowait()
                    while not message_queue.empty():
                        message_queue.get_nowait()
                elif "message" in data:
                    await message_queue.put(data)
        except WebSocketDisconnect:
            shutdown.set()
        except Exception:
            shutdown.set()

    async def _can_use_tool(tool_name: str, input_data: dict, context: object) -> object:
        """Handle tool permission requests.

        Auto-approves safe tools, sends permission/question requests
        to the frontend for others.
        """
        # Block .env file access
        if _targets_env_file(tool_name, input_data):
            return PermissionResultDeny(
                message="Access to .env files is blocked. "
                "Environment variables can be managed from the Studio Environment tab."
            )

        # AskUserQuestion: send to frontend, await response
        if tool_name == "AskUserQuestion":
            questions = input_data.get("questions", [])
            try:
                await websocket.send_json({
                    "type": "question",
                    "data": {"questions": questions},
                })
            except Exception:
                return PermissionResultDeny(message="WebSocket disconnected")

            # Wait for answer from frontend
            try:
                response = await asyncio.wait_for(
                    interaction_queue.get(), timeout=300,
                )
            except asyncio.TimeoutError:
                return PermissionResultDeny(message="User did not respond in time")

            answers = response.get("answers", {})
            return PermissionResultAllow(
                updated_input={**input_data, "answers": answers},
            )

        # Non-Bash tools: auto-approve
        if tool_name != "Bash":
            return PermissionResultAllow(updated_input=input_data)

        # Bash: check if safe command
        command = input_data.get("command", "").strip()
        first_word = command.split()[0] if command.split() else ""
        base_cmd = os.path.basename(first_word)

        # Auto-approve klisk commands
        if base_cmd == "klisk" or command.startswith("klisk"):
            return PermissionResultAllow(updated_input=input_data)

        # Auto-approve safe read-only commands
        if base_cmd in _SAFE_COMMANDS:
            return PermissionResultAllow(updated_input=input_data)

        # Ask user for permission
        try:
            await websocket.send_json({
                "type": "permission_request",
                "data": {"tool": "Bash", "command": command},
            })
        except Exception:
            return PermissionResultDeny(message="WebSocket disconnected")

        try:
            response = await asyncio.wait_for(
                interaction_queue.get(), timeout=300,
            )
        except asyncio.TimeoutError:
            return PermissionResultDeny(message="User did not respond in time")

        if response.get("allowed"):
            return PermissionResultAllow(updated_input=input_data)
        return PermissionResultDeny(message="User denied this command")

    async def _auto_approve_klisk(input_data: dict, tool_use_id: str, context: object) -> dict:
        """Hook: auto-approve klisk CLI commands."""
        command = input_data.get("tool_input", {}).get("command", "").strip()
        if command.startswith("klisk"):
            return {
                "hookSpecificOutput": {
                    "hookEventName": input_data["hook_event_name"],
                    "permissionDecision": "allow",
                }
            }
        return {}

    async def _process_messages() -> None:
        """Process user messages by running Claude Agent SDK queries."""
        nonlocal session_id

        while not shutdown.is_set():
            try:
                msg = await asyncio.wait_for(message_queue.get(), timeout=1)
            except asyncio.TimeoutError:
                continue

            user_text = msg.get("message", "").strip()
            if not user_text:
                continue

            # Clear CLAUDECODE to avoid nested session detection
            os.environ.pop("CLAUDECODE", None)

            sdk_env: dict[str, str] = {}
            path = os.environ.get("PATH")
            if path:
                sdk_env["PATH"] = path
            for key in ("ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"):
                val = os.environ.get(key)
                if val:
                    sdk_env[key] = val

            options = ClaudeAgentOptions(
                model="opus",
                system_prompt=SYSTEM_PROMPT,
                include_partial_messages=True,
                allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Skill"],
                setting_sources=["user"],
                permission_mode="acceptEdits",
                hooks={
                    "PreToolUse": [
                        HookMatcher(matcher="Bash", hooks=[_auto_approve_klisk]),
                    ],
                },
                can_use_tool=_can_use_tool,
                cwd=str(project_dir),
                max_turns=None,
                env=sdk_env,
                cli_path=cli_path,
            )

            if session_id:
                options.resume = session_id

            tool_input_buffer = ""
            current_tool = ""
            in_tool = False

            async def _run_single_query() -> None:
                nonlocal session_id, tool_input_buffer, current_tool, in_tool

                async def _prompt():
                    yield {"type": "user", "message": {"role": "user", "content": user_text}}

                async for message in query(prompt=_prompt(), options=options):
                    if shutdown.is_set():
                        break

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
                                current_tool = block.get("name", "")
                                tool_input_buffer = ""
                                in_tool = True
                            elif block.get("type") == "text":
                                in_tool = False

                        elif event_type == "content_block_delta":
                            delta = event.get("delta", {})
                            if delta.get("type") == "text_delta" and not in_tool:
                                text = delta.get("text", "")
                                if text:
                                    try:
                                        await websocket.send_json({
                                            "type": "token",
                                            "data": text,
                                        })
                                    except Exception:
                                        shutdown.set()
                                        break
                            elif delta.get("type") == "input_json_delta" and in_tool:
                                tool_input_buffer += delta.get("partial_json", "")

                        elif event_type == "content_block_stop":
                            if in_tool:
                                detail = _format_tool_detail(current_tool, tool_input_buffer)
                                try:
                                    await websocket.send_json({
                                        "type": "tool_use",
                                        "data": {
                                            "tool": current_tool,
                                            "detail": detail,
                                            "args": tool_input_buffer,
                                        },
                                    })
                                except Exception:
                                    shutdown.set()
                                    break
                                in_tool = False

                    elif isinstance(message, ResultMessage):
                        pass

            try:
                cancel_query.clear()
                query_task = asyncio.create_task(_run_single_query())
                cancel_waiter = asyncio.create_task(cancel_query.wait())

                done, pending = await asyncio.wait(
                    [query_task, cancel_waiter],
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for p in pending:
                    p.cancel()

                # Re-raise exceptions from the query task if it completed
                if query_task in done:
                    query_task.result()

                try:
                    await websocket.send_json({"type": "done"})
                except Exception:
                    shutdown.set()

                if cancel_query.is_set():
                    cancel_query.clear()

            except Exception as e:
                logger.exception("Assistant query error")
                try:
                    await websocket.send_json({
                        "type": "error",
                        "data": str(e),
                    })
                except Exception:
                    shutdown.set()

    # Run reader and processor concurrently
    reader_task = asyncio.create_task(_reader_loop())
    processor_task = asyncio.create_task(_process_messages())

    try:
        done, pending = await asyncio.wait(
            [reader_task, processor_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
    except Exception:
        reader_task.cancel()
        processor_task.cancel()
