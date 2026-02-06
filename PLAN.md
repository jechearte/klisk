# agentkit — Plan de Desarrollo

## Alcance del MVP

Mono-agentes con tools. Sin handoffs, guardrails ni export.
El usuario puede crear un proyecto, definir un agente con tools, probarlo en el Studio y ejecutarlo desde la CLI.

---

## Fase 0 — Inicialización del proyecto

Configurar el monorepo y las dependencias base.

### 0.1 Estructura del repositorio

```
agentkit/
├── pyproject.toml              # Paquete Python principal (CLI + framework)
├── src/
│   └── agentkit/
│       ├── __init__.py          # Exports públicos: define_agent, tool
│       ├── cli/                 # Comandos CLI (Typer)
│       ├── core/                # Framework: registry, config, discovery
│       └── server/              # Dev server: FastAPI + WebSockets
├── studio/                      # Frontend React + Vite
│   ├── package.json
│   └── src/
├── templates/                   # Templates para scaffolding (agentkit create)
│   └── default/
└── tests/
```

### 0.2 Tareas

- [ ] Inicializar git
- [ ] Crear `pyproject.toml` con dependencias: `openai-agents`, `typer`, `fastapi`, `uvicorn`, `watchfiles`, `pyyaml`, `pydantic`
- [ ] Crear `studio/package.json` con dependencias: `react`, `vite`, `@xyflow/react`, `tailwindcss`
- [ ] Configurar estructura de carpetas base
- [ ] Crear un virtualenv y verificar que las dependencias se instalan

---

## Fase 1 — Framework Core (las primitivas)

El corazón de agentkit: las funciones que el usuario (o su LLM) usa para definir agentes.

### 1.1 `define_agent()`

Wrapper sobre `Agent()` del OpenAI Agents SDK que además registra el agente en un registry global.

```python
# Lo que escribe el usuario
from agentkit import define_agent, tool

agent = define_agent(
    name="MiAgente",
    instructions="Eres un asistente útil.",
    model="gpt-4o",
    tools=[mi_tool],
)
```

Por debajo:
- Crea un `Agent()` del SDK
- Lo registra en `AgentRegistry` (singleton) con su metadata (nombre, archivo fuente, tools, etc.)
- El registry es lo que el Studio consulta para saber qué agentes existen

### 1.2 `@tool`

Wrapper sobre `@function_tool` del SDK que añade metadata para el Studio.

```python
from agentkit import tool

@tool
async def buscar_vuelos(origen: str, destino: str, fecha: str) -> str:
    """Busca vuelos disponibles entre dos ciudades."""
    return "Vuelo encontrado: Madrid → NYC, $450"
```

Por debajo:
- Llama a `@function_tool` del SDK
- Extrae metadata adicional: nombre, descripción (del docstring), parámetros (de los type hints)
- Registra la tool en el registry

### 1.3 `AgentRegistry`

Singleton que mantiene el estado de todos los agentes y tools registrados.

```python
class AgentRegistry:
    agents: dict[str, AgentEntry]    # name → agent + metadata
    tools: dict[str, ToolEntry]      # name → tool + metadata

    def register_agent(...)
    def register_tool(...)
    def get_project_snapshot() -> ProjectSnapshot  # Lo que el Studio consume
    def clear()  # Para hot reload
```

### 1.4 `ProjectConfig`

Parser de `agentkit.config.yaml` con Pydantic.

```python
class ProjectConfig(BaseModel):
    entry: str = "agents/main.py"
    name: str = "MyAgent"
    studio: StudioConfig = StudioConfig()
    api: ApiConfig = ApiConfig()
    defaults: DefaultsConfig = DefaultsConfig()
```

### 1.5 `Discovery`

Módulo que:
1. Lee `agentkit.config.yaml`
2. Importa dinámicamente el entry point (`agents/main.py`)
3. Al importar, los decoradores `define_agent()` y `@tool` pueblan el `AgentRegistry`
4. Devuelve el `ProjectSnapshot` con toda la info del proyecto

### Tareas

- [ ] Implementar `AgentRegistry` (singleton con register/get/clear)
- [ ] Implementar `define_agent()` (wrapper sobre `Agent()` + registro)
- [ ] Implementar `@tool` (wrapper sobre `@function_tool` + registro)
- [ ] Implementar `ProjectConfig` (Pydantic model + parser YAML)
- [ ] Implementar `Discovery` (carga dinámica del entry point)
- [ ] Tests unitarios de cada primitiva

---

## Fase 2 — CLI

Comandos que el usuario ejecuta desde la terminal.

### 2.1 `agentkit create <nombre>`

Genera un proyecto nuevo con la estructura convencional y un agente de ejemplo.

```bash
$ agentkit create mi-agente
# Crea:
#   mi-agente/
#   ├── agentkit.config.yaml
#   ├── agents/
#   │   ├── main.py          # Agente de ejemplo funcional
#   │   └── tools/
#   │       └── example.py   # Tool de ejemplo
#   └── .env.example         # OPENAI_API_KEY=...
```

El template vive en `templates/default/` dentro del paquete.

### 2.2 `agentkit dev`

El comando principal de desarrollo. Levanta todo:
1. Ejecuta Discovery para cargar el proyecto
2. Levanta el servidor FastAPI (API del agente + WebSocket para el Studio)
3. Levanta el frontend del Studio (Vite dev server o sirve el build estático)
4. Inicia el file watcher sobre la carpeta del proyecto
5. Cuando detecta cambios: limpia el registry, re-ejecuta Discovery, notifica al Studio vía WebSocket

```bash
$ agentkit dev
  Studio:    http://localhost:3000
  Agent API: http://localhost:8000
  Watching for changes...
```

### 2.3 `agentkit run "<mensaje>"`

Ejecuta el agente en la terminal, sin Studio. Útil para testing rápido.

```bash
$ agentkit run "Busca vuelos de Madrid a NYC"
# Carga el proyecto, ejecuta Runner.run(), imprime la respuesta
```

### 2.4 `agentkit check`

Valida que el proyecto esté bien formado:
- Entry point existe
- Config YAML es válida
- Todos los tools tienen type hints y docstrings
- Los agentes referenciados existen
- No hay errores de importación

```bash
$ agentkit check
  ✓ Config válida
  ✓ Entry point: agents/main.py
  ✓ 1 agente registrado
  ✓ 2 tools registradas
  ✗ tools/example.py: 'buscar_vuelos' missing docstring
```

### Tareas

- [ ] Setup Typer app con estructura de comandos
- [ ] Implementar `agentkit create` + templates en `templates/default/`
- [ ] Implementar `agentkit dev` (orquestación de server + watcher + studio)
- [ ] Implementar `agentkit run` (discovery + Runner.run + print)
- [ ] Implementar `agentkit check` (validaciones)
- [ ] Tests de integración de cada comando

---

## Fase 3 — Dev Server (backend del Studio)

Servidor FastAPI que conecta el framework con el Studio.

### 3.1 Endpoints REST

```
GET  /api/project          → ProjectSnapshot (agentes, tools, config)
GET  /api/agents            → Lista de agentes con su metadata
GET  /api/agents/:name      → Detalle de un agente
GET  /api/tools             → Lista de tools con su metadata
```

### 3.2 WebSocket: Chat

```
WS /ws/chat
  → Cliente envía: { "message": "Busca vuelos..." }
  ← Servidor envía (streaming): { "type": "token", "data": "Encontré" }
  ← Servidor envía (streaming): { "type": "token", "data": " 3 vuelos" }
  ← Servidor envía: { "type": "done", "data": "..." }
  ← Servidor envía: { "type": "trace", "data": { spans: [...] } }
```

Por debajo usa `Runner.run_streamed()` del SDK y envía los tokens al cliente conforme llegan.

### 3.3 WebSocket: Hot Reload

```
WS /ws/reload
  ← Servidor envía: { "type": "reload", "snapshot": {...} }
```

Se dispara cuando el file watcher detecta cambios. El Studio recibe el nuevo snapshot y se actualiza.

### 3.4 File Watcher

Usa `watchfiles` para observar la carpeta del proyecto. Cuando detecta cambios en `.py` o `.yaml`:
1. Limpia el `AgentRegistry`
2. Re-ejecuta `Discovery`
3. Envía el nuevo `ProjectSnapshot` a todos los clientes WS conectados

### Tareas

- [ ] Crear app FastAPI con endpoints REST
- [ ] Implementar WebSocket de chat con streaming (`Runner.run_streamed()`)
- [ ] Implementar WebSocket de hot reload
- [ ] Implementar file watcher con `watchfiles`
- [ ] Integrar el tracing del SDK para capturar spans y enviarlos al cliente
- [ ] Tests del server (endpoints + WebSocket)

---

## Fase 4 — Studio (frontend)

Interfaz React que visualiza el proyecto y permite probar el agente.

### 4.1 Layout

Tres paneles:

```
┌─────────────────────┬──────────────────────────┐
│   SIDEBAR           │    MAIN PANEL            │
│   (Config/Agents)   │    (Chat o Tracing)      │
│                     │                          │
└─────────────────────┴──────────────────────────┘
```

### 4.2 Sidebar — Vista de configuración

- Nombre del proyecto y config global (modelo, temperatura)
- Agente: nombre, instructions (preview), modelo
- Lista de tools con nombre, descripción, parámetros
- Indicador de conexión (WebSocket status)
- Indicador de último reload

### 4.3 Main Panel — Chat de prueba

- Input de texto + botón enviar
- Mensajes del usuario y del agente (streaming)
- Indicador de "pensando..." y "ejecutando tool X..."
- Botón para limpiar conversación

### 4.4 Main Panel — Vista de Tracing (tab)

- Timeline de la última ejecución
- Cada span como una barra: tool calls con duración, LLM calls
- Click en un span para ver detalle (input/output de la tool, tokens)

### 4.5 Hot Reload

- WebSocket conectado a `/ws/reload`
- Cuando recibe un nuevo snapshot, actualiza el sidebar automáticamente
- Muestra un toast de "Proyecto recargado" brevemente

### Tareas

- [ ] Setup proyecto Vite + React + TailwindCSS
- [ ] Layout base con sidebar + main panel
- [ ] Sidebar: renderizar proyecto snapshot (agentes, tools, config)
- [ ] Chat: UI de mensajes + input
- [ ] Chat: conectar WebSocket `/ws/chat` con streaming
- [ ] Chat: indicadores de estado (pensando, ejecutando tool)
- [ ] Tracing: timeline de spans
- [ ] Hot reload: WebSocket `/ws/reload` + actualización automática
- [ ] Servir el Studio desde el dev server de agentkit (build estático o proxy a Vite)

---

## Fase 5 — Integración y pulido

Conectar todas las piezas y asegurar que el flujo end-to-end funciona.

### Tareas

- [ ] Test end-to-end: `agentkit create` → `agentkit dev` → abrir Studio → chatear → ver tracing
- [ ] Manejo de errores: qué pasa si el código del usuario tiene errores de sintaxis, imports faltantes, etc.
- [ ] Mensajes de error claros en la CLI y en el Studio
- [ ] El Studio muestra errores de carga del proyecto (no se queda en blanco)
- [ ] `agentkit check` reporta todos los problemas encontrados
- [ ] README con instrucciones de uso
- [ ] Limpiar TODOs y código muerto

---

## Resumen de fases

| Fase | Qué | Entregable |
|------|-----|------------|
| **0** | Inicialización | Repo configurado, dependencias instaladas |
| **1** | Framework Core | `define_agent()`, `@tool`, registry, config, discovery |
| **2** | CLI | `create`, `dev`, `run`, `check` |
| **3** | Dev Server | FastAPI + WebSockets (chat streaming, hot reload, tracing) |
| **4** | Studio | React app (sidebar + chat + tracing + hot reload) |
| **5** | Integración | Todo funciona end-to-end, errores manejados |

---

## Dependencias clave

### Python (pyproject.toml)

```
openai-agents >= 0.1
typer >= 0.9
fastapi >= 0.110
uvicorn >= 0.29
websockets >= 12.0
watchfiles >= 0.21
pyyaml >= 6.0
pydantic >= 2.0
python-dotenv >= 1.0
```

### Frontend (studio/package.json)

```
react >= 18
react-dom >= 18
vite >= 5
@xyflow/react >= 12
tailwindcss >= 3
```

---

## Decisiones técnicas pendientes (a resolver durante el desarrollo)

1. **Nombre definitivo del proyecto** — usando "agentkit" provisionalmente
2. **Studio como build estático o Vite dev server** — en dev, proxy a Vite es más cómodo; en producción, build estático servido por FastAPI
3. **Formato del tracing** — definir el schema exacto de los spans que el backend envía al frontend
4. **Gestión de la API key** — leer de `.env`, variable de entorno, o config YAML
