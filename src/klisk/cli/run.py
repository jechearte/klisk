"""klisk run — execute the agent from the terminal."""

from __future__ import annotations

import asyncio
import base64
import mimetypes
from pathlib import Path

import typer

from klisk.core.paths import resolve_project

ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
ALLOWED_FILE_MIMES = {"application/pdf"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB


def _parse_input(raw: str, *, litellm: bool = False) -> tuple[str, list[dict]]:
    """Parse user input for @path tokens and return (text, content_parts).

    Tokens like @photo.jpg or @doc.pdf are extracted, the files are read and
    base64-encoded, and the result is returned as content parts.
    Format depends on litellm flag:
    - False: Responses API format (input_image, input_file) for native OpenAI
    - True:  Chat Completions format (image_url, file) for LiteLLM providers
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
                data = base64.b64encode(filepath.read_bytes()).decode()
                data_uri = f"data:{mime};base64,{data}"

                if mime in ALLOWED_IMAGE_MIMES:
                    if litellm:
                        file_parts.append({
                            "type": "image_url",
                            "image_url": {"url": data_uri, "detail": "auto"},
                        })
                    else:
                        file_parts.append({
                            "type": "input_image",
                            "image_url": data_uri,
                            "detail": "auto",
                        })
                elif mime in ALLOWED_FILE_MIMES:
                    if litellm:
                        file_parts.append({
                            "type": "file",
                            "file": {"file_data": data_uri, "filename": filepath.name},
                        })
                    else:
                        file_parts.append({
                            "type": "input_file",
                            "file_data": data_uri,
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


def _build_run_input(text: str, file_parts: list[dict], *, litellm: bool = False) -> str | list[dict]:
    """Build the input for Runner.run() from parsed text and file parts."""
    if not file_parts:
        return text

    parts: list[dict] = []
    text_part_type = "text" if litellm else "input_text"
    if text:
        parts.append({"type": text_part_type, "text": text})
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

    from klisk.core.discovery import discover_project

    snapshot = discover_project(project_path)

    if not snapshot.agents:
        typer.echo("Error: no agents found in the project.", err=True)
        raise typer.Exit(1)

    first_agent_name = next(iter(snapshot.agents))
    agent_entry = snapshot.agents[first_agent_name]
    sdk_agent = agent_entry.sdk_agent

    from klisk.server.chat import is_litellm_model

    use_litellm = is_litellm_model(agent_entry.model)

    if interactive or message is None:
        typer.echo(f"Chat with '{first_agent_name}' (type 'exit' to quit)")
        typer.echo("Tip: use @path to attach images or PDFs (e.g. @photo.jpg)")
        typer.echo()
        asyncio.run(_interactive_loop(sdk_agent, use_litellm=use_litellm))
    else:
        typer.echo(f"Running agent '{first_agent_name}'...")
        typer.echo()
        text, file_parts = _parse_input(message, litellm=use_litellm)
        run_input = _build_run_input(text, file_parts, litellm=use_litellm)
        result = asyncio.run(_run_agent(sdk_agent, run_input, previous_response_id=None, has_files=bool(file_parts)))
        typer.echo(result.final_output)


async def _interactive_loop(agent, *, use_litellm: bool = False) -> None:
    from agents import RunConfig, Runner

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

        text, file_parts = _parse_input(user_input, litellm=use_litellm)
        run_input = _build_run_input(text, file_parts, litellm=use_litellm)

        # Disable tracing when files are attached to avoid payload-too-large errors
        run_config = RunConfig(tracing_disabled=True) if file_parts else None

        result = await Runner.run(
            agent,
            run_input,
            previous_response_id=previous_response_id,
            run_config=run_config,
        )
        previous_response_id = result.last_response_id
        print(f"Agent: {result.final_output}")
        print()


async def _run_agent(agent, message: str | list, previous_response_id: str | None = None, has_files: bool = False):
    from agents import RunConfig, Runner

    run_config = RunConfig(tracing_disabled=True) if has_files else None
    return await Runner.run(agent, message, previous_response_id=previous_response_id, run_config=run_config)
