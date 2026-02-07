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

Search through OpenAI vector stores. The model retrieves relevant chunks from your uploaded documents to answer questions.

```python
from klisk import FileSearch

FileSearch(vector_store_ids=["vs_abc123"], max_num_results=10)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `vector_store_ids` | `list[str]` | `[]` (required) | List of OpenAI vector store IDs to search. Must provide at least one. |
| `max_num_results` | `int` \| `None` | `None` | Maximum number of results to return. |

**No string shortcut** — `FileSearch` always requires `vector_store_ids`, so it must be used in object form. Using `"file_search"` as a string shortcut raises `ValueError`.

#### Setting up a vector store

Before using `FileSearch` in your agent, you need to upload your documents to OpenAI and create a vector store. This is done once, via the OpenAI API — Klisk does not manage vector stores.

You can create a setup script in your project (e.g. `scripts/setup_vector_store.py`):

```python
from openai import OpenAI

client = OpenAI()  # uses OPENAI_API_KEY from .env

# 1. Upload files
file1 = client.files.create(file=open("docs/manual.pdf", "rb"), purpose="assistants")
file2 = client.files.create(file=open("docs/faq.pdf", "rb"), purpose="assistants")

# 2. Create a vector store
vector_store = client.vector_stores.create(name="my-knowledge-base")

# 3. Add files to the vector store
client.vector_stores.files.create(vector_store_id=vector_store.id, file_id=file1.id)
client.vector_stores.files.create(vector_store_id=vector_store.id, file_id=file2.id)

# 4. Print the vector store ID — use this in your agent
print(f"Vector store ID: {vector_store.id}")  # → vs_abc123...
```

You can also upload files from a URL:

```python
import requests
from io import BytesIO

url = "https://example.com/report.pdf"
response = requests.get(url)
file = client.files.create(
    file=("report.pdf", BytesIO(response.content)),
    purpose="assistants"
)
```

After running the script, copy the vector store ID (`vs_...`) and use it in your agent:

```python
from klisk import define_agent, FileSearch

agent = define_agent(
    name="DocSearch",
    model="gpt-5.2",
    instructions="Answer questions based on the uploaded documents.",
    builtin_tools=[
        FileSearch(vector_store_ids=["vs_abc123"]),
    ],
)
```

**Alternatively**, you can create vector stores from the [OpenAI dashboard](https://platform.openai.com/storage/vector-stores) (Storage > Vector Stores) without writing any code.

#### Supported file types

OpenAI vector stores support: PDF, TXT, MD, DOCX, PPTX, HTML, JSON, CSV, and more. Each file can be up to 512 MB / 5M tokens. A vector store can hold up to 10,000 files.

#### Checking vector store status

After uploading files, wait until processing completes before using the agent:

```python
files = client.vector_stores.files.list(vector_store_id=vector_store.id)
for f in files:
    print(f"{f.id}: {f.status}")  # should be "completed"
```

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
