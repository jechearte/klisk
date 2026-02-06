# Production Server & API

## Starting the Server

```bash
agentkit serve [name_or_path] --port 8080 --host 0.0.0.0
```

- `--port/-p`: Port (default: `$PORT` env var or `8080`)
- `--host/-h`: Host to bind (default: `0.0.0.0`)

Serves: chat UI, REST API, WebSocket, and embeddable widget.

---

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | No | Chat UI (SPA with markdown, tool calls, thinking, themes) |
| `GET` | `/api/info` | No | Agent info + auth status |
| `GET` | `/health` | No | Health check |
| `POST` | `/api/chat` | Yes* | Chat (SSE streaming or JSON) |
| `WS` | `/ws/chat` | Yes* | WebSocket chat |

*Auth only required if API keys are configured.

### `GET /api/info`

```json
{"name": "MyAgent", "agent": "Assistant", "auth_required": true}
```

### `POST /api/chat`

**Request:**
```json
{"message": "Hello", "stream": true, "state": {}}
```

- `stream: true` → SSE (Server-Sent Events)
- `stream: false` → JSON: `{"response": "...", "state": {...}, "done": true}`
- `state`: Pass back between requests for conversation continuity
- `attachments` (optional): Array of file attachments (see Multimodal below)

**Auth header:** `Authorization: Bearer <key>`

### `WS /ws/chat`

**Auth:** `?key=<key>` query parameter.

**Send message:**
```json
{"message": "Hello", "previous_response_id": "resp_xxx"}
```

**Send message with attachments:**
```json
{
  "message": "Describe this image",
  "attachments": [
    {"type": "image", "name": "photo.jpg", "mime_type": "image/jpeg", "data": "<base64>"}
  ]
}
```

**Clear conversation:**
```json
{"type": "clear"}
```

---

## Streaming Events

Both SSE and WebSocket emit:

| Event | Data | Description |
|---|---|---|
| `token` | `string` | Text delta from the LLM |
| `thinking` | `string` | Reasoning/thinking delta |
| `tool_call` | `{"tool": "name", "arguments": "...", "status": "running"}` | Tool invocation started |
| `tool_result` | `{"output": "..."}` | Tool execution result |
| `done` | `string` (final output) | Run completed |
| `error` | `string` | Error message |

**Conversation state per provider:**
- OpenAI: `{"previous_response_id": "resp_xxx"}`
- LiteLLM: `{"conversation_history": [...]}`

---

## API Key Authentication

Protect your server with environment variables:

```env
AGENTKIT_API_KEY=my-secret-key
AGENTKIT_CHAT_KEY=chat-key-1,chat-key-2
AGENTKIT_WIDGET_KEY=widget-key
```

| Variable | Description |
|---|---|
| `AGENTKIT_API_KEY` | General-purpose key(s) |
| `AGENTKIT_CHAT_KEY` | Chat UI key(s) |
| `AGENTKIT_WIDGET_KEY` | Widget key(s) |

- All keys are **pooled** — any valid key grants access
- Multiple keys per variable (comma-separated)
- Constant-time comparison (`hmac.compare_digest`)
- **REST API**: `Authorization: Bearer <key>` header
- **WebSocket**: `?key=<key>` query parameter
- **Chat UI**: Prompts for key, stores in localStorage

---

## Embeddable Widget

Add a chat widget to any website:

```html
<script src="https://your-url/widget.js"></script>
```

**Customization via `data-*` attributes:**

| Attribute | Default | Description |
|---|---|---|
| `data-position` | `"bottom-right"` | `"bottom-right"` or `"bottom-left"` |
| `data-color` | `"#2563eb"` | Button color |
| `data-width` | `"380px"` | Panel width |
| `data-height` | `"560px"` | Panel height |
| `data-key` | — | API key (transparent auth) |

**Full example:**

```html
<script
  src="https://your-url/widget.js"
  data-position="bottom-right"
  data-color="#2563eb"
  data-width="380px"
  data-height="560px"
  data-key="your-api-key"
></script>
```

---

## Multimodal Support (Images & PDFs)

All interfaces (Studio, Chat UI, CLI, API) support sending images and PDFs to the agent.

**Supported formats:** JPEG, PNG, GIF, WebP (images), PDF (files). Max 20MB per file.

**Attachment wire format:**
```json
{
  "type": "image",
  "name": "photo.jpg",
  "mime_type": "image/jpeg",
  "data": "<base64 encoded, no data URL prefix>"
}
```

- `type`: `"image"` or `"file"` (for PDFs)
- `data`: Raw base64 string (not a `data:...` URL)

**Provider support via LiteLLM:**
- Images: OpenAI, Anthropic Claude 3+, Google Gemini, AWS Bedrock, Vertex AI, Ollama (LLaVA)
- PDFs: Anthropic, Bedrock, Vertex AI (OpenAI does NOT support PDFs directly)

**Chat UI & Studio:** Paperclip button to attach files, drag-and-drop onto messages area, preview strip before sending. Images show as thumbnails in message bubbles.

**CLI:** Use `@path` syntax: `agentkit run -p my-agent "@photo.jpg Describe this"`

**API example with attachment:**
```bash
curl -X POST https://your-url/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "message": "What is in this image?",
    "stream": false,
    "attachments": [
      {"type": "image", "name": "photo.jpg", "mime_type": "image/jpeg", "data": "<base64>"}
    ]
  }'
```

---

## Chat UI Features

The built-in chat UI at `/` includes:
- Message bubbles (user right, agent left)
- Markdown rendering (bold, italic, code, lists, headings, links, tables)
- Tool call display (collapsible, spinner while running)
- Thinking traces (collapsible)
- Error messages (red)
- File attachments (images & PDFs) with drag-and-drop
- Dark/light theme toggle (persists in localStorage)
- Reset button
- Embed mode: `/?embed=1` (full viewport, no borders)

---

## REST API Usage Examples

```bash
# Non-streaming
curl -X POST https://your-url/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"message": "Hello", "stream": false}'

# Streaming (SSE)
curl -X POST https://your-url/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"message": "Hello", "stream": true}'

# With conversation state
curl -X POST https://your-url/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"message": "Follow up", "stream": false, "state": {"previous_response_id": "resp_xxx"}}'
```
