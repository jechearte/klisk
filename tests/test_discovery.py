"""Tests for the Discovery module."""

import tempfile
from pathlib import Path

from agentkit.core.registry import AgentRegistry
from agentkit.core.discovery import discover_project


def setup_function():
    AgentRegistry.reset()


def test_discover_project():
    with tempfile.TemporaryDirectory() as tmpdir:
        # Write config
        config_path = Path(tmpdir) / "agentkit.config.yaml"
        config_path.write_text(
            "entry: agents/main.py\n"
            "name: TestBot\n"
        )

        # Write agent module
        agents_dir = Path(tmpdir) / "agents"
        agents_dir.mkdir()
        main_py = agents_dir / "main.py"
        main_py.write_text(
            "from agentkit import define_agent, tool\n"
            "\n"
            "@tool\n"
            "async def hello(name: str) -> str:\n"
            "    \"\"\"Say hello.\"\"\"\n"
            "    return f'Hello {name}'\n"
            "\n"
            "agent = define_agent(\n"
            "    name='Greeter',\n"
            "    instructions='You greet people.',\n"
            "    model='gpt-4o',\n"
            "    tools=[hello],\n"
            ")\n"
        )

        snapshot = discover_project(tmpdir)
        assert "Greeter" in snapshot.agents
        assert "hello" in snapshot.tools
        assert snapshot.config["name"] == "TestBot"


def test_discover_missing_entry():
    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = Path(tmpdir) / "agentkit.config.yaml"
        config_path.write_text("entry: agents/main.py\nname: Test\n")

        try:
            discover_project(tmpdir)
            assert False, "Should have raised FileNotFoundError"
        except FileNotFoundError:
            pass
