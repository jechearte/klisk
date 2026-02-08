# Klisk API Reference

## Exports

```python
from klisk import define_agent, tool, get_tools, AgentRegistry, ProjectConfig
```

---

## define_agent()

```python
def define_agent(
    *,
    name: str,
    instructions: str | None = None,
    model: str | None = None,
    temperature: float | None = None,
    reasoning_effort: str | None = None,
    tools: list[Any] | None = None,
    **kwargs: Any,
) -> Agent:
```

**Parameters:**
- `name` (str, required): Unique agent identifier
- `instructions` (str | None): System prompt / personality
- `model` (str | None): LLM model — `"gpt-5.2"` or `provider/model` format (see [litellm.md](litellm.md))
- `temperature` (float | None): Sampling temperature
- `reasoning_effort` (str | None): `"none"`, `"low"`, `"medium"`, `"high"` — defaults to `None` (not sent). Only set for reasoning models (o3, o4-mini)
- `tools` (list | None): `FunctionTool` objects from `@tool` or `get_tools()`
- `**kwargs`: Forwarded to SDK `Agent()` — supports `handoffs`, `guardrails`, `output_type`, etc.

**Returns:** The SDK `Agent` object.

**Behavior:**
1. Resolves model string (native OpenAI or LiteLLM)
2. Creates `ModelSettings` with `temperature` and optionally `Reasoning(effort=reasoning_effort)` when set
3. Creates `Agent` via the SDK
4. Captures caller source file (for Studio)
5. Registers in the global `AgentRegistry`

**Examples:**

```python
# Minimal
agent = define_agent(name="Helper", instructions="You help users.")

# With tools and model settings
agent = define_agent(
    name="TravelAgent",
    instructions="Help find and book flights.",
    model="gpt-5.2",
    temperature=0.7,
    reasoning_effort="high",
    tools=get_tools("search_flights", "book_flight"),
)

# Multi-agent with handoffs
agent = define_agent(
    name="Router",
    instructions="Route the user to the right specialist.",
    handoffs=[search_agent, booking_agent],
)

# Non-OpenAI provider
agent = define_agent(
    name="ClaudeAgent",
    model="anthropic/claude-sonnet-4-20250514",
    instructions="You are a helpful assistant.",
)
```

---

## @tool decorator

```python
@tool
async def my_function(param: str) -> str:
    """Description shown to the LLM."""
    return result

@tool(name_override="custom_name")
async def my_function(param: str) -> str:
    """Description shown to the LLM."""
    return result
```

**Requirements:** docstring (tool description) + type hints on all params (JSON schema). Should be `async`.

**Behavior:**
1. Wraps SDK `@function_tool`
2. Extracts docstring as description, type hints as parameter schema
3. Registers in `AgentRegistry` (discoverable via `get_tools()`)

---

## get_tools()

```python
def get_tools(*names: str) -> list[FunctionTool]:
```

Retrieves registered tools by name. **Raises** `ValueError` if not found.

Tools must be imported before `get_tools()` is called. The discovery system handles this automatically — imports all `.py` files before the entry point.

---

## ProjectConfig

Pydantic model for `klisk.config.yaml`.

```python
class ProjectConfig(BaseModel):
    entry: str = "agents/main.py"
    name: str = "MyAgent"
    studio: StudioConfig  # port: int = 3000
    api: ApiConfig        # port: int = 8000

    @classmethod
    def load(cls, project_dir: str | Path) -> ProjectConfig: ...
```

---

## AgentRegistry

Singleton tracking all agents and tools. Populated by `define_agent()` and `@tool`.

```python
registry = AgentRegistry.get_instance()
registry.agents    # dict[str, AgentEntry]
registry.tools     # dict[str, ToolEntry]
registry.get_agent("name")  # AgentEntry | None
registry.get_tool("name")   # ToolEntry | None
registry.get_project_snapshot()  # ProjectSnapshot
registry.clear()   # Reset (for hot reload)
```

**Data classes:**

```python
@dataclass
class AgentEntry:
    name: str
    instructions: str | None
    model: str | None          # Original model string (e.g. "anthropic/claude-...")
    tools: list[str]
    temperature: float | None
    source_file: str
    sdk_agent: Agent

@dataclass
class ToolEntry:
    name: str
    description: str
    parameters: dict
    source_file: str
    function_tool: FunctionTool

@dataclass
class ProjectSnapshot:
    agents: dict[str, AgentEntry]
    tools: dict[str, ToolEntry]
    config: dict
```

---

## klisk.config.yaml

```yaml
entry: agents/main.py          # Entry point (relative to project root)
name: MyProjectName             # Project name
studio:
  port: 3000                    # Studio web UI port
api:
  port: 8000                    # API/WebSocket server port
```

All fields have defaults. The file is optional.

---

## OpenAI Agents SDK Primitives

| SDK Primitive | Klisk Wrapper | Purpose |
|---|---|---|
| `Agent(name, instructions, model, tools, handoffs)` | `define_agent()` | Define an agent |
| `@function_tool` | `@tool` | Convert function to tool |
| `ModelSettings(temperature, reasoning)` | `temperature` + `reasoning_effort` params | Model config |
| `handoffs=[agent_a, agent_b]` | Pass via `**kwargs` | Agent-to-agent delegation |
| `InputGuardrail` / `OutputGuardrail` | Pass via `**kwargs` | Input/output validation |
| `Runner.run()` / `Runner.run_streamed()` | `klisk run` / Studio / `serve` API | Execute agent loop |

### Agent execution loop (managed by SDK Runner)

```
User input
    |
    v
[Input Guardrails] --tripwire--> Exception
    |
    v
[Agent + LLM call]
    |
    |--> Final output --> [Output Guardrails] --> Result
    |--> Tool calls --> Execute tools --> Add results --> Loop
    |--> Handoff --> Switch agent --> Loop
    |--> max_turns exceeded --> Error
```
