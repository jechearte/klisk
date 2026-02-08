---
name: klisk-guide
description: Guide for building AI agents programmatically using the Klisk CLI and framework. Use when the user asks to create, scaffold, develop, run, validate, or modify a Klisk project. Triggers include requests like "create an agent", "add a tool to the agent", "scaffold a new klisk project", "run the agent", "start the studio", "deploy the agent", "serve the agent", or any task involving the klisk CLI commands (create, dev, run, check, list, serve, deploy) or the Klisk Python API (define_agent, @tool, get_tools, handoffs).
---

# Klisk Guide

Klisk is a framework for building AI agents programmatically. It wraps the OpenAI Agents SDK with conventions, a CLI, and a visual Studio. Supports **any LLM provider** (OpenAI, Anthropic, Gemini, Mistral, etc.) via LiteLLM.

## Workflow: From Zero to Deployed Agent

### 1. Create the project

```bash
klisk create my-agent
```

Projects are created in `~/klisk/projects/<name>`. All CLI commands accept the project name directly — no need to `cd`:

```bash
klisk dev my-agent
klisk run -p my-agent "Hello"
klisk check my-agent
```

This scaffolds a standard project structure:

```
my-agent/
├── klisk.config.yaml        # Config (entry point, ports)
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

Edit `~/klisk/projects/my-agent/.env` (created automatically from `.env.example`):

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
from klisk import tool

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
from klisk import define_agent, get_tools

agent = define_agent(
    name="TravelAgent",
    instructions="You help users find and book flights.",
    model="gpt-5.2",
    temperature=0.7,
    tools=get_tools("search_flights"),
)
```

Key parameters: `name`, `instructions`, `model`, `temperature`, `reasoning_effort`, `tools`, `builtin_tools`, plus SDK kwargs (`handoffs`, `guardrails`, `output_type`).

**Note:** `reasoning_effort` defaults to `None` (not sent to the API). Only set it for reasoning models like `o3` or `o4-mini`. Non-reasoning models like `gpt-4.1` do NOT support this parameter.

For OpenAI models, you can also add **built-in tools** (web search, code interpreter, file search, image generation) via the `builtin_tools` parameter. See [references/builtin_tools.md](references/builtin_tools.md).

**Important:** `temperature` and `reasoning_effort` MUST be passed as direct parameters of `define_agent()`, NOT inside `model_settings`. If you pass `model_settings` explicitly, the automatic `temperature` and `reasoning_effort` configuration is skipped and those parameters are ignored. Wrong:

```python
# DON'T do this — temperature and reasoning_effort are ignored
agent = define_agent(
    name="MyAgent",
    temperature=0.7,
    reasoning_effort="medium",
    model_settings=ModelSettings(temperature=0.3),  # overrides everything
)
```

Correct:

```python
# DO this — let define_agent() build model_settings automatically
agent = define_agent(
    name="MyAgent",
    temperature=0.7,
    reasoning_effort="medium",
    tools=get_tools("my_tool"),
)
```

For non-OpenAI models, use `provider/model` format (e.g. `"anthropic/claude-sonnet-4-20250514"`). Requires `pip install 'klisk[litellm]'`. See [references/litellm.md](references/litellm.md).

### 5. Develop and test with Studio

```bash
klisk dev my-agent       # Single-project mode
klisk dev                # Workspace mode — loads ALL projects
```

**Single-project mode** (`klisk dev <name>`): Opens Studio for one project.

**Workspace mode** (`klisk dev` without arguments): Loads every project from `~/klisk/projects/` into a single Studio session. Agents/tools are tagged with their project name. If two projects define an agent with the same name, they get prefixed (`project-a/MyAgent`, `project-b/MyAgent`). `.env` files from all projects are loaded (no override).

Studio features:
- Graph view of agents and tools
- Chat panel to test the agent
- Live editing of agent/tool properties
- Hot reload on file changes (watches all projects in workspace mode)

### 6. Test from the terminal

```bash
klisk run -p my-agent "Find flights from Madrid to Tokyo on March 15"
klisk run -p my-agent -i   # interactive conversation mode
```

**Multimodal (images/PDFs):** Use `@path` to attach files:

```bash
klisk run -p my-agent "@photo.jpg Describe this image"
klisk run -p my-agent "@report.pdf Summarize this document"
klisk run -p my-agent "@img1.png @img2.png Compare these images"
```

Supported: JPEG, PNG, GIF, WebP images and PDF files (max 20MB each).

### 7. Validate before deploying

```bash
klisk check my-agent
```

Verifies config, entry point, agent/tool discovery, docstrings, and correct usage of `temperature`/`reasoning_effort` (must be `define_agent()` params, not inside `model_settings`).

### 8. Serve in production

```bash
klisk serve my-agent --port 8080
```

Starts a production server with chat UI (`/`), REST API (`/api/chat`), WebSocket (`/ws/chat`), and embeddable widget (`/widget.js`). Supports optional API key authentication.

See [references/production.md](references/production.md) for endpoints, auth, streaming events, and widget config.

### 9. Deploy to the cloud

```bash
klisk deploy init my-agent    # generates Dockerfile + requirements.txt
klisk deploy -p my-agent      # deploys to Google Cloud Run
```

Auto-checks prerequisites, enables APIs, passes `.env` as env vars. Returns the deployed URL with chat, API, and widget embed code.

See [references/deploy.md](references/deploy.md) for options and troubleshooting.

## CLI Commands (Quick Reference)

```bash
klisk create <name>              # Scaffold new project in ~/klisk/projects/
klisk dev <name>                 # Start Studio + hot reload (single project)
klisk dev                        # Start Studio in workspace mode (all projects)
klisk run -p <name> "<message>"  # Run agent (or -i for interactive)
klisk check <name>               # Validate project
klisk list                       # List all projects
klisk delete <name>              # Remove project
klisk serve <name>               # Production server
klisk deploy init <name>         # Generate deploy files
klisk deploy -p <name>           # Deploy to Cloud Run
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
| Built-in tools (web search, code interpreter, file search, image gen) | [references/builtin_tools.md](references/builtin_tools.md) |
| Deployment to Google Cloud Run | [references/deploy.md](references/deploy.md) |
