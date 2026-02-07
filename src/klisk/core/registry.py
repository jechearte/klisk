"""Global registry for agents and tools."""

from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolEntry:
    name: str
    description: str
    parameters: dict[str, Any]
    source_file: str | None = None
    function_tool: Any = None  # The underlying FunctionTool from the SDK
    project: str | None = None


@dataclass
class AgentEntry:
    name: str
    instructions: str | None
    model: str | None
    tools: list[str] = field(default_factory=list)
    temperature: float | None = None
    reasoning_effort: str | None = None
    source_file: str | None = None
    sdk_agent: Any = None  # The underlying Agent from the SDK
    project: str | None = None


@dataclass
class ProjectSnapshot:
    agents: dict[str, AgentEntry] = field(default_factory=dict)
    tools: dict[str, ToolEntry] = field(default_factory=dict)
    config: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "agents": {
                name: {
                    "name": entry.name,
                    "instructions": entry.instructions,
                    "model": entry.model,
                    "tools": entry.tools,
                    "temperature": entry.temperature,
                    "reasoning_effort": entry.reasoning_effort,
                    "source_file": entry.source_file,
                    "project": entry.project,
                }
                for name, entry in self.agents.items()
            },
            "tools": {
                name: {
                    "name": entry.name,
                    "description": entry.description,
                    "parameters": entry.parameters,
                    "source_file": entry.source_file,
                    "project": entry.project,
                }
                for name, entry in self.tools.items()
            },
            "config": self.config,
        }


class AgentRegistry:
    """Singleton registry that tracks all agents and tools in the project."""

    _instance: AgentRegistry | None = None

    def __init__(self) -> None:
        self.agents: dict[str, AgentEntry] = {}
        self.tools: dict[str, ToolEntry] = {}

    @classmethod
    def get_instance(cls) -> AgentRegistry:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def register_agent(self, entry: AgentEntry) -> None:
        self.agents[entry.name] = entry

    def register_tool(self, entry: ToolEntry) -> None:
        self.tools[entry.name] = entry

    def get_agent(self, name: str) -> AgentEntry | None:
        return self.agents.get(name)

    def get_tool(self, name: str) -> ToolEntry | None:
        return self.tools.get(name)

    def get_project_snapshot(self) -> ProjectSnapshot:
        return ProjectSnapshot(
            agents=dict(self.agents),
            tools=dict(self.tools),
        )

    def clear(self) -> None:
        self.agents.clear()
        self.tools.clear()

    @classmethod
    def reset(cls) -> None:
        """Reset the singleton instance (useful for testing)."""
        if cls._instance is not None:
            cls._instance.clear()
            cls._instance = None
