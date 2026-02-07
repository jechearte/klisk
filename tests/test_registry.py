"""Tests for AgentRegistry."""

from klisk.core.registry import AgentRegistry, AgentEntry, ToolEntry


def setup_function():
    AgentRegistry.reset()


def test_singleton():
    r1 = AgentRegistry.get_instance()
    r2 = AgentRegistry.get_instance()
    assert r1 is r2


def test_register_and_get_agent():
    registry = AgentRegistry.get_instance()
    entry = AgentEntry(name="TestAgent", instructions="Do stuff", model="gpt-4o", tools=["t1"])
    registry.register_agent(entry)
    assert registry.get_agent("TestAgent") is entry
    assert registry.get_agent("NonExistent") is None


def test_register_and_get_tool():
    registry = AgentRegistry.get_instance()
    entry = ToolEntry(name="my_tool", description="A tool", parameters={"type": "object"})
    registry.register_tool(entry)
    assert registry.get_tool("my_tool") is entry
    assert registry.get_tool("other") is None


def test_clear():
    registry = AgentRegistry.get_instance()
    registry.register_agent(AgentEntry(name="A", instructions=None, model=None))
    registry.register_tool(ToolEntry(name="T", description="", parameters={}))
    registry.clear()
    assert len(registry.agents) == 0
    assert len(registry.tools) == 0


def test_project_snapshot():
    registry = AgentRegistry.get_instance()
    registry.register_agent(AgentEntry(name="A", instructions="hi", model="gpt-4o", tools=["t"]))
    registry.register_tool(ToolEntry(name="t", description="tool", parameters={"type": "object"}))
    snapshot = registry.get_project_snapshot()
    assert "A" in snapshot.agents
    assert "t" in snapshot.tools
    d = snapshot.to_dict()
    assert d["agents"]["A"]["name"] == "A"
    assert d["tools"]["t"]["description"] == "tool"


def test_reset():
    registry = AgentRegistry.get_instance()
    registry.register_agent(AgentEntry(name="A", instructions=None, model=None))
    AgentRegistry.reset()
    new_registry = AgentRegistry.get_instance()
    assert len(new_registry.agents) == 0
    assert new_registry is not registry
