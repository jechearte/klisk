# AgentKit Serve — Interfaces

`agentkit serve` inicia un servidor de producción que expone tres interfaces para interactuar con tu agente: una **web de chat**, un **widget embebible** y una **API HTTP**.

```
agentkit serve my-agent          # Puerto por defecto: 8080
agentkit serve my-agent -p 3000  # Puerto personalizado
```

---

## 1. Chat Web

**URL:** `http://localhost:8080/`

Página completa con una interfaz de chat centrada en la pantalla. Incluye:

- Message bubbles (usuario a la derecha, agente a la izquierda)
- Renderizado de Markdown (bold, italic, code, listas, headings, links, blockquotes, tablas)
- Tool calls colapsables con spinner (running) e icono wrench (done)
- Thinking traces colapsables
- Errores mostrados en rojo
- Toggle de tema claro/oscuro (persiste en `localStorage`)
- Botón de reset de conversación
- Persistencia: la conversación sobrevive a refrescos de página. Solo se reinicia con el botón de reset.

La comunicación con el servidor se realiza via **WebSocket** en `/ws/chat`.

---

## 2. Widget Embebible

Inserta el chat de tu agente en cualquier web con una sola línea:

```html
<script src="https://tu-agente.run.app/widget.js"></script>
```

Crea un botón flotante (bottom-right por defecto) que al hacer clic abre un panel con el chat dentro de un iframe (`/?embed=1`). El iframe aísla los estilos, sin conflictos CSS con la web host.

### Configuración via `data-*` attributes

| Atributo | Valores | Default |
|---|---|---|
| `data-position` | `"bottom-right"`, `"bottom-left"` | `"bottom-right"` |
| `data-color` | Cualquier color CSS | `"#2563eb"` |
| `data-width` | Ancho del panel | `"380px"` |
| `data-height` | Alto del panel | `"560px"` |

### Ejemplo con personalización

```html
<script
  src="https://tu-agente.run.app/widget.js"
  data-position="bottom-left"
  data-color="#10b981"
  data-width="400px"
  data-height="600px"
></script>
```

### Modo Embed

Al cargar la URL con `?embed=1`, la página de chat se adapta al modo embebido:
- La tarjeta ocupa el 100% del viewport (sin bordes, sin fondo con patrón)
- Se oculta el toggle de tema (se hereda del sistema)
- Se mantiene la cabecera con el nombre del agente y el botón de reset

---

## 3. API HTTP

### `GET /api/info`

Información básica del agente.

**Response:**
```json
{
  "name": "MyAgent",
  "agent": "search_agent"
}
```

### `GET /health`

Health check para Cloud Run / load balancers.

**Response:**
```json
{
  "status": "ok"
}
```

### `POST /api/chat`

Endpoint principal para chatear con el agente programáticamente. Soporta dos modos: **streaming (SSE)** y **no-streaming**.

#### Request

```json
{
  "message": "Hola, busca circuitos en Madrid",
  "stream": true,
  "state": {}
}
```

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `message` | `string` | `""` | Mensaje del usuario |
| `stream` | `boolean` | `true` | `true` para SSE streaming, `false` para respuesta completa |
| `state` | `object` | `{}` | Estado de conversación (ver sección de historial) |

#### Modo Streaming (SSE) — `stream: true`

Devuelve un stream de Server-Sent Events (`text/event-stream`). Cada evento es una línea `data: {json}\n\n`.

**Tipos de evento:**

| Tipo | Campos | Descripción |
|---|---|---|
| `token` | `data: string` | Delta de texto de la respuesta del agente |
| `thinking` | `data: string` | Delta de reasoning/thinking del modelo |
| `tool_call` | `data: {tool, arguments, status}` | El agente invoca una tool |
| `tool_result` | `data: {output}` | Resultado de la tool |
| `done` | `data: string, response_id: string?` | Fin del turno. `data` contiene la respuesta final completa. `response_id` se usa para continuar la conversación. |
| `error` | `data: string` | Error durante la ejecución |

El stream termina con `data: [DONE]\n\n`.

**Ejemplo con `curl`:**

```bash
curl -N -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola", "stream": true}'
```

**Output:**
```
data: {"type": "token", "data": "¡"}
data: {"type": "token", "data": "Hola"}
data: {"type": "token", "data": "!"}
data: {"type": "tool_call", "data": {"tool": "search", "arguments": "{\"q\": \"Madrid\"}", "status": "running"}}
data: {"type": "tool_result", "data": {"output": "[{\"name\": \"Karting Madrid\"}]"}}
data: {"type": "token", "data": "Encontré"}
data: {"type": "token", "data": " un circuito."}
data: {"type": "done", "data": "¡Hola! Encontré un circuito.", "response_id": "resp_abc123"}
data: [DONE]
```

**Ejemplo en JavaScript:**

```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hola', state: {} }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
      const event = JSON.parse(line.slice(6));
      if (event.type === 'token') {
        process.stdout.write(event.data);
      }
    }
  }
}
```

#### Modo No-Streaming — `stream: false`

Espera a que el agente termine y devuelve la respuesta completa en un solo JSON.

```bash
curl -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola", "stream": false}'
```

**Response:**
```json
{
  "response": "¡Hola! Soy tu asistente. ¿En qué puedo ayudarte?",
  "state": {
    "previous_response_id": "resp_abc123"
  },
  "done": true
}
```

---

## Historial de conversación

La API es **stateless** — el servidor no guarda el historial entre requests. El cliente es responsable de mantener y enviar el estado de conversación.

### Cómo funciona

El campo `state` es un objeto opaco que el cliente envía y recibe en cada turno. El servidor lo modifica internamente para rastrear la conversación y lo devuelve actualizado.

**Flujo:**

```
Turno 1:  Cliente envía   state: {}
          Servidor devuelve state: {"previous_response_id": "resp_001"}

Turno 2:  Cliente envía   state: {"previous_response_id": "resp_001"}
          Servidor devuelve state: {"previous_response_id": "resp_002"}

Turno 3:  Cliente envía   state: {"previous_response_id": "resp_002"}
          ...
```

### Mecanismo interno según el proveedor

El `state` funciona de forma diferente dependiendo del modelo configurado:

#### Modelos OpenAI nativos (ej. `gpt-4o`)

Usa `previous_response_id` de la OpenAI Responses API. El historial se mantiene del lado de OpenAI — solo se necesita el ID de la última respuesta.

```json
{
  "state": {
    "previous_response_id": "resp_abc123"
  }
}
```

#### Modelos LiteLLM (ej. `anthropic/claude-sonnet-4-20250514`)

Como la Responses API no está disponible, el historial se mantiene como una lista de mensajes completa dentro del `state`.

```json
{
  "state": {
    "conversation_history": [
      {"role": "user", "content": "Hola"},
      {"role": "assistant", "content": "¡Hola! ¿En qué puedo ayudarte?"},
      {"role": "user", "content": "Busca circuitos en Madrid"}
    ]
  }
}
```

### Ejemplo: conversación multi-turno con la API

```python
import requests

url = "http://localhost:8080/api/chat"
state = {}

# Turno 1
r = requests.post(url, json={"message": "Hola", "stream": False, "state": state})
data = r.json()
print(data["response"])
state = data["state"]  # Guardar el state actualizado

# Turno 2 — el agente recuerda el contexto anterior
r = requests.post(url, json={"message": "Busca circuitos en Madrid", "stream": False, "state": state})
data = r.json()
print(data["response"])
state = data["state"]

# Nueva conversación — enviar state vacío
state = {}
r = requests.post(url, json={"message": "Hola de nuevo", "stream": False, "state": state})
```

### Cómo persiste el Chat Web / Widget

La web de chat y el widget (que usa la misma página en modo embed) no usan `POST /api/chat`. Se comunican via **WebSocket** (`/ws/chat`), donde el historial se mantiene en la conexión del socket.

Para persistir entre refrescos de página, el cliente guarda en `localStorage`:

| Key | Contenido |
|---|---|
| `agentkit-chat-messages` | Array JSON con todos los mensajes renderizados |
| `agentkit-chat-response-id` | ID de la última respuesta (para reanudar contexto) |

Al reconectar el WebSocket, el cliente envía el `previous_response_id` guardado para que el servidor retome la conversación donde se dejó.

### `WS /ws/chat`

WebSocket usado por el Chat Web y el Widget. Protocolo de mensajes JSON.

**Mensajes del cliente al servidor:**

| Mensaje | Descripción |
|---|---|
| `{"message": "texto"}` | Enviar mensaje del usuario |
| `{"type": "clear"}` | Reiniciar conversación |
| `{"previous_response_id": "resp_xxx"}` | Restaurar contexto al reconectar |

**Mensajes del servidor al cliente:**

Los mismos tipos de evento que en SSE: `token`, `thinking`, `tool_call`, `tool_result`, `done`, `error`.
