"""Tests for define_agent() and @tool primitives."""

from agents import Agent, FunctionTool

from klisk.core.registry import AgentRegistry
from klisk.core.primitives import define_agent, tool


def setup_function():
    AgentRegistry.reset()


def test_tool_decorator():
    @tool
    async def greet(name: str) -> str:
        """Say hello."""
        return f"Hello, {name}!"

    assert isinstance(greet, FunctionTool)
    assert greet.name == "greet"
    assert greet.description == "Say hello."

    registry = AgentRegistry.get_instance()
    entry = registry.get_tool("greet")
    assert entry is not None
    assert entry.name == "greet"
    assert entry.description == "Say hello."


def test_tool_decorator_with_params():
    @tool(name_override="custom_name")
    async def my_func(x: int) -> str:
        """Does something."""
        return str(x)

    assert isinstance(my_func, FunctionTool)
    assert my_func.name == "custom_name"

    registry = AgentRegistry.get_instance()
    entry = registry.get_tool("custom_name")
    assert entry is not None


def test_define_agent_basic():
    @tool
    async def search(query: str) -> str:
        """Search for things."""
        return "results"

    agent = define_agent(
        name="SearchBot",
        instructions="You search things.",
        model="gpt-4o",
        tools=[search],
    )

    assert isinstance(agent, Agent)
    assert agent.name == "SearchBot"
    assert agent.instructions == "You search things."

    registry = AgentRegistry.get_instance()
    entry = registry.get_agent("SearchBot")
    assert entry is not None
    assert entry.name == "SearchBot"
    assert entry.model == "gpt-4o"
    assert "search" in entry.tools


def test_define_agent_no_tools():
    agent = define_agent(
        name="SimpleBot",
        instructions="Hello",
    )
    assert isinstance(agent, Agent)
    registry = AgentRegistry.get_instance()
    entry = registry.get_agent("SimpleBot")
    assert entry is not None
    assert entry.tools == []
