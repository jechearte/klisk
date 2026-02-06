---
name: agentkit-guide
description: Guide for building AI agents programmatically using the AgentKit CLI and framework. Use when the user asks to create, scaffold, develop, run, validate, or modify an AgentKit project. Triggers include requests like "create an agent", "add a tool to the agent", "scaffold a new agentkit project", "run the agent", "start the studio", "deploy the agent", "serve the agent", or any task involving the agentkit CLI commands (create, dev, run, check, list, serve, deploy) or the AgentKit Python API (define_agent, @tool, get_tools, handoffs).
---

# AgentKit Guide

AgentKit is a framework for building AI agents programmatically. It wraps the OpenAI Agents SDK with conventions, a CLI, and a visual Studio. Supports **any LLM provider** (OpenAI, Anthropic, Gemini, Mistral, etc.) via LiteLLM.

## Workflow: From Zero to Deployed Agent

### 1. Create the project

```bash
agentkit create my-agent
```

Projects are created in `~/agentkit/projects/<name>`. All CLI commands accept the project name directly — no need to `cd`:

```bash
agentkit dev my-agent
agentkit run -p my-agent "Hello"
agentkit check my-agent
```

This scaffolds a standard project structure:

```
my-agent/
├── agentkit.config.yaml        # Config (entry point, ports)
├── .env                        # API keys (gitignored)
├── agents/
│   ├── __init__.py
│   ├── main.py                 # Entry point — defines the main agent
│   └── tools/
│       ├── __init__.py
│       └── example.py          # Example tool (@tool decorated)
└── tests/
```

### 2. Configure the API key

Edit `~/agentkit/projects/my-agent/.env` (created automatically from `.env.example`):

```env
OPENAI_API_KEY=sk-...
# Or for other providers:
# ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=...
```

### 3. Define tools

Create files under `agents/tools/`. Each tool is a decorated async function:

```python
# agents/tools/search_flights.py
from agentkit import tool

@tool
async def search_flights(origin: str, destination: str, date: str) -> str:
    """Search available flights between two cities."""
    # your implementation...
    return results
```

Rules: must have **docstring** + **type hints** on all params. Should be **async**. Tools are auto-discovered.

### 4. Define the agent

Edit `agents/main.py` to wire the agent with its tools and instructions:

```python
# agents/main.py
from agentkit import define_agent, get_tools

agent = define_agent(
    name="TravelAgent",
    instructions="You help users find and book flights.",
    model="gpt-5.2",
    temperature=0.7,
    tools=get_tools("search_flights"),
)
```

Key parameters: `name`, `instructions`, `model`, `temperature`, `reasoning_effort`, `tools`, plus SDK kwargs (`handoffs`, `guardrails`, `output_type`).

For non-OpenAI models, use `provider/model` format (e.g. `"anthropic/claude-sonnet-4-20250514"`). Requires `pip install 'agentkit[litellm]'`. See [references/litellm.md](references/litellm.md).

### 5. Develop and test with Studio

```bash
agentkit dev my-agent
```

Opens a visual Studio with:
- Graph view of agents and tools
- Chat panel to test the agent
- Live editing of agent/tool properties
- Hot reload on file changes

### 6. Test from the terminal

```bash
agentkit run -p my-agent "Find flights from Madrid to Tokyo on March 15"
agentkit run -p my-agent -i   # interactive conversation mode
```

### 7. Validate before deploying

```bash
agentkit check my-agent
```

Verifies config, entry point, agent/tool discovery, and docstrings.

### 8. Serve in production

```bash
agentkit serve my-agent --port 8080
```

Starts a production server with chat UI (`/`), REST API (`/api/chat`), WebSocket (`/ws/chat`), and embeddable widget (`/widget.js`). Supports optional API key authentication.

See [references/production.md](references/production.md) for endpoints, auth, streaming events, and widget config.

### 9. Deploy to the cloud

```bash
agentkit deploy init my-agent    # generates Dockerfile + requirements.txt
agentkit deploy -p my-agent      # deploys to Google Cloud Run
```

Auto-checks prerequisites, enables APIs, passes `.env` as env vars. Returns the deployed URL with chat, API, and widget embed code.

See [references/deploy.md](references/deploy.md) for options and troubleshooting.

## CLI Commands (Quick Reference)

```bash
agentkit create <name>              # Scaffold new project in ~/agentkit/projects/
agentkit dev <name>                 # Start Studio + hot reload
agentkit run -p <name> "<message>"  # Run agent (or -i for interactive)
agentkit check <name>               # Validate project
agentkit list                       # List all projects
agentkit delete <name>              # Remove project
agentkit serve <name>               # Production server
agentkit deploy init <name>         # Generate deploy files
agentkit deploy -p <name>           # Deploy to Cloud Run
```

## Key Patterns

### Multi-agent with handoffs

```python
search_agent = define_agent(name="Search", tools=get_tools("search_flights"))

router = define_agent(
    name="Router",
    instructions="Route to the right specialist.",
    handoffs=[search_agent],
)
```

### Adding a new tool to an existing project

1. Create `agents/tools/send_email.py` with `@tool` decorator
2. Add to `get_tools()` in `agents/main.py`: `tools=get_tools("search_flights", "send_email")`

## Important Rules

- Tools are auto-discovered: all `.py` files imported before the entry point
- Every `@tool` function **must** have a docstring and type hints
- `define_agent()` returns the SDK `Agent` object — usable with `Runner.run()` directly
- `**kwargs` forwarded to the SDK: `handoffs`, `guardrails`, `output_type`, etc.

## Reference Docs

| Topic | File |
|---|---|
| Core API (define_agent, @tool, get_tools, registry, config) | [references/api_reference.md](references/api_reference.md) |
| Multi-provider / LiteLLM setup | [references/litellm.md](references/litellm.md) |
| Production server, API, auth, widget | [references/production.md](references/production.md) |
| Deployment to Google Cloud Run | [references/deploy.md](references/deploy.md) |
