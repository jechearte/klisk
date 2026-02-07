# Built-in Tools

Klisk wraps OpenAI's provider-hosted tools as built-in tools. These run server-side on OpenAI's infrastructure — no local code needed.

**Important:** Built-in tools **only work with OpenAI models**. Using them with other providers (Anthropic, Gemini, etc.) raises `ValueError`.

## Available Tools

| Tool | Description | String shortcut |
|---|---|---|
| **WebSearch** | Search the web for current information | `"web_search"` |
| **CodeInterpreter** | Execute code in a sandboxed environment | `"code_interpreter"` |
| **FileSearch** | Search through OpenAI vector stores | *(none — requires config)* |
| **ImageGeneration** | Generate images from text descriptions | `"image_generation"` |

## Usage

Pass built-in tools via the `builtin_tools` parameter of `define_agent()`. This is separate from `tools` (which is for custom `@tool` functions).

### String shortcuts (simplest)

For tools that don't require configuration, use string shortcuts:

```python
from klisk import define_agent, get_tools

agent = define_agent(
    name="Assistant",
    model="gpt-5.2",
    instructions="You are a helpful assistant.",
    tools=get_tools("my_tool"),
    builtin_tools=["web_search", "code_interpreter", "image_generation"],
)
```

### Object form (for configuration)

Import the tool classes to pass custom configuration:

```python
from klisk import define_agent, get_tools, WebSearch, FileSearch, ImageGeneration

agent = define_agent(
    name="Researcher",
    model="gpt-5.2",
    instructions="You research topics deeply.",
    tools=get_tools("summarize"),
    builtin_tools=[
        WebSearch(search_context_size="high"),
        FileSearch(vector_store_ids=["vs_abc123"]),
        ImageGeneration(quality="high", size="1024x1024"),
    ],
)
```

### Mixing string shortcuts and objects

You can combine both forms in the same list:

```python
builtin_tools=[
    "code_interpreter",                          # string shortcut (defaults)
    WebSearch(search_context_size="high"),        # object (custom config)
]
```

## Tool Reference

### WebSearch

Search the web for up-to-date information.

```python
from klisk import WebSearch

WebSearch(search_context_size="medium")
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `search_context_size` | `"low"` \| `"medium"` \| `"high"` | `"medium"` | Amount of context from search results passed to the model. Higher = more detail but more tokens. |

**String shortcut:** `"web_search"` (uses defaults)

### CodeInterpreter

Execute Python code in a sandboxed container. Useful for math, data analysis, chart generation.

```python
from klisk import CodeInterpreter

CodeInterpreter(container=None)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `container` | `dict` \| `None` | `None` | Optional container configuration (e.g. `{"image": "custom-image"}`) |

**String shortcut:** `"code_interpreter"` (uses defaults)

### FileSearch

Search through OpenAI vector stores. Requires pre-created vector stores via the OpenAI API.

```python
from klisk import FileSearch

FileSearch(vector_store_ids=["vs_abc123"], max_num_results=10)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `vector_store_ids` | `list[str]` | `[]` (required) | List of OpenAI vector store IDs to search. Must provide at least one. |
| `max_num_results` | `int` \| `None` | `None` | Maximum number of results to return. |

**No string shortcut** — `FileSearch` always requires `vector_store_ids`, so it must be used in object form. Using `"file_search"` as a string shortcut raises `ValueError`.

### ImageGeneration

Generate images from text prompts.

```python
from klisk import ImageGeneration

ImageGeneration(model="gpt-image-1", quality="auto", size="auto")
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `model` | `str` | `"gpt-image-1"` | Image generation model to use |
| `quality` | `"auto"` \| `"low"` \| `"medium"` \| `"high"` | `"auto"` | Image quality |
| `size` | `"auto"` \| `"1024x1024"` \| `"1536x1024"` \| `"1024x1536"` | `"auto"` | Image dimensions |

**String shortcut:** `"image_generation"` (uses defaults)

## Imports

All built-in tool classes are exported from the main `klisk` package:

```python
from klisk import WebSearch, CodeInterpreter, FileSearch, ImageGeneration
```

## Errors

| Error | Cause |
|---|---|
| `ValueError: ... is only supported with OpenAI models` | Used a built-in tool with a non-OpenAI model (e.g. `anthropic/claude-...`) |
| `ValueError: file_search requires configuration` | Used `"file_search"` as string shortcut instead of `FileSearch(vector_store_ids=[...])` |
| `ValueError: file_search requires vector_store_ids` | Used `FileSearch()` without providing `vector_store_ids` |
| `ValueError: Unknown builtin tool '...'` | Typo in string shortcut. Valid: `web_search`, `code_interpreter`, `file_search`, `image_generation` |
