"""agentkit run — execute the agent from the terminal."""

from __future__ import annotations

import asyncio
from pathlib import Path

import typer

from agentkit.core.paths import resolve_project


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
        typer.echo()
        asyncio.run(_interactive_loop(sdk_agent))
    else:
        typer.echo(f"Running agent '{first_agent_name}'...")
        typer.echo()
        result = asyncio.run(_run_agent(sdk_agent, message, previous_response_id=None))
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

        result = await Runner.run(
            agent,
            user_input,
            previous_response_id=previous_response_id,
        )
        previous_response_id = result.last_response_id
        print(f"Agent: {result.final_output}")
        print()


async def _run_agent(agent, message: str, previous_response_id: str | None = None):
    from agents import Runner
    return await Runner.run(agent, message, previous_response_id=previous_response_id)
