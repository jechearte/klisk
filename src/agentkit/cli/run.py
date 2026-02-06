"""agentkit run — execute the agent from the terminal."""

from __future__ import annotations

import asyncio
import base64
import mimetypes
from pathlib import Path

import typer

from agentkit.core.paths import resolve_project

ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
ALLOWED_FILE_MIMES = {"application/pdf"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB


def _parse_input(raw: str) -> tuple[str, list[dict]]:
    """Parse user input for @path tokens and return (text, content_parts).

    Tokens like @photo.jpg or @doc.pdf are extracted, the files are read and
    base64-encoded, and the result is returned as Responses API content parts.
    If no @tokens are found, content_parts will be empty.
    """
    tokens = raw.split()
    file_parts: list[dict] = []
    text_tokens: list[str] = []

    for token in tokens:
        if token.startswith("@") and len(token) > 1:
            filepath = Path(token[1:]).expanduser()
            if filepath.exists() and filepath.is_file():
                if filepath.stat().st_size > MAX_FILE_SIZE:
                    typer.echo(f"Warning: {filepath.name} exceeds 20MB, skipping.", err=True)
                    text_tokens.append(token)
                    continue
                mime, _ = mimetypes.guess_type(str(filepath))
                if mime in ALLOWED_IMAGE_MIMES:
                    data = base64.b64encode(filepath.read_bytes()).decode()
                    file_parts.append({
                        "type": "input_image",
                        "image_url": f"data:{mime};base64,{data}",
                        "detail": "auto",
                    })
                elif mime in ALLOWED_FILE_MIMES:
                    data = base64.b64encode(filepath.read_bytes()).decode()
                    file_parts.append({
                        "type": "input_file",
                        "file_data": f"data:{mime};base64,{data}",
                        "filename": filepath.name,
                    })
                else:
                    typer.echo(f"Warning: unsupported file type for {filepath.name}, skipping.", err=True)
                    text_tokens.append(token)
            else:
                # Not a valid file path, keep as text
                text_tokens.append(token)
        else:
            text_tokens.append(token)

    return " ".join(text_tokens), file_parts


def _build_run_input(text: str, file_parts: list[dict]) -> str | list[dict]:
    """Build the input for Runner.run() from parsed text and file parts."""
    if not file_parts:
        return text

    parts: list[dict] = []
    if text:
        parts.append({"type": "input_text", "text": text})
    parts.extend(file_parts)
    return [{"role": "user", "content": parts}]


def run(
    message: str = typer.Argument(None, help="Message to send to the agent (omit for interactive mode)"),
    project_dir: str = typer.Option(".", "--project", "-p", help="Project name or path"),
    interactive: bool = typer.Option(False, "--interactive", "-i", help="Start an interactive conversation"),
) -> None:
    """Run the agent with a message and print the response."""
    from dotenv import load_dotenv

    project_path = resolve_project(project_dir)
    load_dotenv(project_path / ".env")

    from agentkit.core.discovery import discover_project

    snapshot = discover_project(project_path)

    if not snapshot.agents:
        typer.echo("Error: no agents found in the project.", err=True)
        raise typer.Exit(1)

    first_agent_name = next(iter(snapshot.agents))
    agent_entry = snapshot.agents[first_agent_name]
    sdk_agent = agent_entry.sdk_agent

    if interactive or message is None:
        typer.echo(f"Chat with '{first_agent_name}' (type 'exit' to quit)")
        typer.echo("Tip: use @path to attach images or PDFs (e.g. @photo.jpg)")
        typer.echo()
        asyncio.run(_interactive_loop(sdk_agent))
    else:
        typer.echo(f"Running agent '{first_agent_name}'...")
        typer.echo()
        text, file_parts = _parse_input(message)
        run_input = _build_run_input(text, file_parts)
        result = asyncio.run(_run_agent(sdk_agent, run_input, previous_response_id=None))
        typer.echo(result.final_output)


async def _interactive_loop(agent) -> None:
    from agents import Runner

    previous_response_id: str | None = None

    while True:
        try:
            user_input = input("You: ")
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if user_input.strip().lower() in ("exit", "quit"):
            break

        if not user_input.strip():
            continue

        text, file_parts = _parse_input(user_input)
        run_input = _build_run_input(text, file_parts)

        result = await Runner.run(
            agent,
            run_input,
            previous_response_id=previous_response_id,
        )
        previous_response_id = result.last_response_id
        print(f"Agent: {result.final_output}")
        print()


async def _run_agent(agent, message: str | list, previous_response_id: str | None = None):
    from agents import Runner
    return await Runner.run(agent, message, previous_response_id=previous_response_id)
