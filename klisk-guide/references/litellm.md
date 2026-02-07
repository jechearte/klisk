# Multi-Provider Support (LiteLLM)

Klisk supports any LLM provider via LiteLLM using the `provider/model` convention.

## Setup

```bash
pip install 'klisk[litellm]'
```

Set the provider's API key in `.env`:

```env
OPENAI_API_KEY=sk-...

# Uncomment for your provider:
# ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=...
# MISTRAL_API_KEY=...
```

## Usage

```python
from klisk import define_agent

# OpenAI (native — no LiteLLM needed)
agent = define_agent(name="A", model="gpt-5.2")
agent = define_agent(name="A", model="openai/gpt-5.2")  # equivalent

# Anthropic
agent = define_agent(name="A", model="anthropic/claude-sonnet-4-20250514")

# Google Gemini
agent = define_agent(name="A", model="gemini/gemini-2.5-flash")

# Mistral
agent = define_agent(name="A", model="mistral/mistral-large-latest")
```

## Model Resolution Rules

The `_resolve_model()` function in `primitives.py` applies these rules:

| Model string | Result |
|---|---|
| `"gpt-5.2"` (no `/`) | Native OpenAI |
| `"openai/gpt-5.2"` | Strip prefix → native OpenAI |
| `"anthropic/claude-..."` | `LitellmModel` via LiteLLM |
| `"gemini/gemini-..."` | `LitellmModel` via LiteLLM |
| Any `provider/model` | `LitellmModel` via LiteLLM |

## Auto-Behaviors

- **API key detection**: Reads `{PROVIDER}_API_KEY` from environment (e.g. `anthropic/...` → `ANTHROPIC_API_KEY`)
- **Tracing disabled**: When no `OPENAI_API_KEY` is set, OpenAI tracing is auto-disabled (avoids 401 errors)
- **Serializer patch**: `OPENAI_AGENTS_ENABLE_LITELLM_SERIALIZER_PATCH=true` is auto-set to suppress Pydantic warnings

## Conversation Handling

- **OpenAI models**: Use `previous_response_id` for conversation continuity
- **LiteLLM models**: Use `conversation_history` (list of message dicts) instead, since non-OpenAI providers don't support response IDs

This difference is handled automatically in both Studio and the production server.

## Error Handling

If LiteLLM is not installed and a non-OpenAI model is used:

```
ImportError: LiteLLM is required to use 'anthropic/claude-...'.
Install it with: pip install 'klisk[litellm]'
```
