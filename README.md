# Klisk

The easiest way to build AI agents.

Klisk is a framework for building AI agents programmatically. Define agents and tools with a simple API, iterate with an interactive Studio, and deploy to production — all from the CLI.

## Install

```bash
pip install klisk
```

## Quick start

```bash
klisk                    # creates ~/klisk workspace
cd ~/klisk
claude                   # or your preferred AI agent
> "Create an agent that ..."
```

Or create a project manually:

```bash
klisk create my-agent
```

This scaffolds a ready-to-run project:

```
my-agent/
├── klisk.config.yaml
├── .env
└── src/
    ├── main.py
    └── tools/
        └── example.py
```

Define your agent in `src/main.py`:

```python
from klisk import define_agent, get_tools

agent = define_agent(
    name="Assistant",
    instructions="You are a helpful assistant.",
    model="gpt-5.2",
    tools=get_tools("greet"),
)
```

Create tools in `src/tools/`:

```python
from klisk import tool

@tool
async def greet(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"
```

Run it:

```bash
klisk run "Say hello to Juan"
klisk run -i  # Interactive chat mode
```

## Studio

Launch the interactive development environment:

```bash
klisk dev my-agent
```

A visual Studio opens in your browser with:

- **Agent graph** — see agents and their connected tools
- **Live chat** — test your agent with file attachments, tool call inspection, and markdown rendering
- **Inline editing** — modify agent instructions, model, and tools directly from the UI
- **Hot reload** — changes to your code update the Studio instantly

## Multi-provider

Use any LLM provider via LiteLLM. Just prefix the model name:

```python
# OpenAI (default)
define_agent(name="Agent", model="gpt-5.2")

# Anthropic
define_agent(name="Agent", model="anthropic/claude-sonnet-4-5-20250929")

# Google
define_agent(name="Agent", model="gemini/gemini-2.5-flash")
```

Set the corresponding API key in your `.env` file (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, etc.).

## Builtin tools

OpenAI models support builtin tools out of the box:

```python
define_agent(
    name="Researcher",
    model="gpt-5.2",
    builtin_tools=["web_search", "code_interpreter"],
)
```

Available: `web_search`, `code_interpreter`, `file_search`, `image_generation`.

## Production

Serve your agent with a chat UI and REST API:

```bash
klisk serve my-agent
```

This starts a production server with:

- Chat UI at `http://localhost:8080`
- REST API at `/api/chat` (streaming supported)
- WebSocket endpoint at `/ws/chat`
- Embeddable widget via `/widget.js`
- Optional API key auth via `KLISK_API_KEY`

## Deploy

Deploy to Google Cloud Run in one command:

```bash
klisk deploy init    # Generate Dockerfile and config
klisk deploy         # Deploy to Cloud Run
```

## CLI reference

| Command | Description |
|---------|-------------|
| `klisk` | Initialize workspace and show welcome |
| `klisk create <name>` | Scaffold a new project |
| `klisk dev [name]` | Start Studio with hot reload |
| `klisk run [message]` | Run agent from terminal |
| `klisk check [name]` | Validate project configuration |
| `klisk list` | List workspace projects |
| `klisk serve [name]` | Start production server |
| `klisk deploy` | Deploy to Google Cloud Run |

## License

[Elastic License 2.0 (ELv2)](https://www.elastic.co/licensing/elastic-license) — free to use, cannot be offered as a managed service.
