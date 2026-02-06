# AgentKit — Vision & Architecture

> **Un framework para construir agentes de IA de forma programática.**
> Como Remotion es para vídeos, AgentKit es para agentes.

---

## Qué es AgentKit

AgentKit es una **capa de abstracción sobre el OpenAI Agents SDK** que ofrece:

1. **Una estructura de proyecto convencional** (como Next.js lo es para React)
2. **Un Studio en localhost** para visualizar y chatear con el agente que estás construyendo
3. **Una CLI** para crear, previsualizar, ejecutar y exportar
4. **Convenciones claras** que hacen que un LLM (el agente personal del usuario) pueda generar código correcto fácilmente

AgentKit **no contiene inteligencia artificial propia**. Es infraestructura pura. El usuario utiliza su propio agente de IA (Claude, ChatGPT, etc.) para generar código que sigue las convenciones de AgentKit, y usa el Studio para visualizar y probar el resultado.

---

## La analogía con Remotion

| Remotion | AgentKit |
|---|---|
| Framework + CLI para crear vídeos programáticamente | Framework + CLI para crear agentes programáticamente |
| Remotion no tiene ningún agente de IA | AgentKit no tiene ningún agente de IA |
| El usuario usa Claude para que genere componentes React | El usuario usa Claude para que genere código AgentKit |
| Remotion expone primitivas: `<Composition>`, `<Sequence>`, `useCurrentFrame()` | AgentKit expone primitivas: `define_agent()`, `@tool`, handoffs, guardrails |
| `npx remotion preview` abre Remotion Studio en localhost | `agentkit dev` abre AgentKit Studio en localhost |
| `npx remotion render` renderiza el vídeo | `agentkit run` ejecuta el agente |
| El valor de Remotion es el framework, no la IA | El valor de AgentKit es el framework, no la IA |

---

## Flujo del usuario

```
1. $ agentkit create travel-bot && cd travel-bot

2. $ agentkit dev
   → Se abre Studio en localhost:3000

3. El usuario le pide a su agente de IA (Claude, etc.):
   "Estoy en un proyecto AgentKit. Crea un agente que busque
    vuelos, compare precios y ayude a reservar."

4. El agente de IA genera los archivos siguiendo las convenciones de AgentKit

5. El Studio detecta los cambios y se actualiza automáticamente:
   → Muestra el grafo de agentes
   → Lista las tools disponibles
   → Permite chatear con el agente para probarlo

6. El usuario prueba, ve el tracing, y vuelve a su agente de IA:
   "El agente no pasa la ubicación al tool de búsqueda, corrígelo"

7. Cuando está satisfecho:
   $ agentkit export --format standalone ./output
   → Código Python limpio con openai-agents, sin dependencia de AgentKit
```

---

## Arquitectura — Las 3 piezas

### 1. El Framework (estructura de proyecto + convenciones)

Una forma estándar y opinada de estructurar un proyecto de agentes. Igual que Remotion dice "un vídeo es un componente React que recibe props y usa `useCurrentFrame()`", AgentKit dice **"un agente es un módulo Python que exporta una configuración estándar"**.

#### La convención central

Todo agente se define en un archivo Python que exporta una config:

```python
# agents/travel_agent.py
from agentkit import define_agent, tool

@tool
async def search_flights(origin: str, destination: str, date: str) -> str:
    """Busca vuelos disponibles."""
    # implementación...
    return results

travel_agent = define_agent(
    name="TravelAgent",
    instructions="Ayudas a encontrar y reservar vuelos.",
    model="gpt-4o",
    tools=[search_flights],
)
```

#### Estructura de proyecto convencional

```
mi-agente/
├── agentkit.config.yaml        # Config del proyecto
├── agents/
│   ├── main.py                 # Agente principal (entry point)
│   ├── booking.py              # Sub-agentes
│   └── tools/
│       ├── search_flights.py
│       └── send_email.py
├── guardrails/
│   └── topic_filter.py
├── schemas/
│   └── flight.py               # Pydantic models
└── tests/
    └── test_main.py
```

#### Fichero de configuración

`agentkit.config.yaml` es el equivalente al `remotion.config.ts`:

```yaml
entry: agents/main.py
name: TravelBot
studio:
  port: 3000
api:
  port: 8000
defaults:
  model: gpt-4o
  temperature: 0.7
```

#### Qué aporta el framework sobre el SDK crudo

| Primitiva | Qué hace |
|---|---|
| `define_agent()` | Wrapper sobre `Agent()` del SDK que registra el agente en el proyecto y lo hace visible para el Studio |
| `@tool` | Wrapper sobre `@function_tool` que añade metadata para el Studio (categorías, iconos, testing) |
| Auto-discovery | El framework escanea la carpeta `agents/` y registra todo automáticamente |
| Config centralizada | Modelo, temperatura, API keys, todo en un sitio |
| Hot reload | Cambias el código, el agente se recarga |

---

### 2. El Studio (interfaz en localhost)

Una interfaz web que se levanta con `agentkit dev` y permite **visualizar y probar** el agente que estás construyendo. **No genera código** — solo refleja lo que hay en disco.

```
┌─────────────────────────────────────────────────────┐
│  AgentKit Studio              localhost:3000         │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│   CONFIGURACIÓN      │       CHAT DE PRUEBA         │
│                      │                              │
│  ┌──────────────┐    │   Usuario: Busca vuelos      │
│  │ TravelAgent  │────│── Madrid → NYC en marzo      │
│  └──────┬───────┘    │                              │
│         │ handoff    │   Agente: Encontré 3 vuelos: │
│  ┌──────▼───────┐    │   1. Iberia - $450           │
│  │ BookingAgent │    │   2. Delta - $520            │
│  └──────────────┘    │   ...                        │
│                      │                              │
│  Tools:              │                              │
│  • search_flights    │──────────────────────────────│
│  • send_email        │       TRACING                │
│                      │                              │
│  Model: gpt-4o       │  → search_flights (1.2s)     │
│  Temp: 0.7           │  → LLM response (0.8s)       │
│                      │                              │
├──────────────────────┴──────────────────────────────┤
│  📁 agents/main.py  │  agents/booking.py  │ tools/  │
└─────────────────────────────────────────────────────┘
```

#### Lo que hace el Studio

- **Lee el código del disco** y renderiza el grafo de agentes (quién conecta con quién vía handoffs)
- **Muestra la config** de cada agente (instructions, model, tools) de forma visual
- **Chat de prueba** — hablas con tu agente directamente, usando `Runner.run_streamed()` por debajo
- **Tracing en vivo** — muestra los spans del SDK (qué tool se llamó, cuánto tardó, qué handoff ocurrió)
- **File watcher** — cuando el código cambia en disco (porque el usuario o su agente IA lo editó), el Studio se actualiza automáticamente

#### Lo que NO hace el Studio

- No genera código
- No modifica archivos
- No tiene inteligencia artificial propia

---

### 3. La CLI

```bash
# Crear proyecto nuevo (scaffolding)
agentkit create mi-agente
# → Genera la estructura de carpetas + config + ejemplo básico

# Desarrollo (levanta Studio + hot reload)
agentkit dev
# → Studio:    http://localhost:3000
# → Agent API: http://localhost:8000
# → Watching for changes...

# Ejecutar el agente en terminal (sin Studio)
agentkit run "Busca vuelos Madrid-NYC en marzo"

# Validar que el proyecto está bien formado
agentkit check
# → ✓ Entry point found
# → ✓ All tools have type hints
# → ✓ No circular handoffs
# → ✗ booking.py: tool 'reserve' missing docstring

# Exportar como API standalone (FastAPI)
agentkit export --format api ./output

# Exportar como paquete Python puro (sin AgentKit)
agentkit export --format standalone ./output
# → Genera código directo con openai-agents, sin dependencia de AgentKit
```

---

## Por qué esto funciona para que un LLM genere código

La clave (igual que con Remotion) es que las **convenciones sean tan claras** que cualquier LLM pueda generar código correcto:

1. **Pocos conceptos** — `define_agent()`, `@tool`, `handoffs=[...]`, `guardrails=[...]`. Nada más.
2. **Estructura predecible** — los archivos siempre van en los mismos sitios
3. **Feedback inmediato** — el usuario ve en el Studio si el agente funciona, y le dice al LLM qué corregir
4. **`agentkit check`** — el LLM puede ejecutar esto para validar que lo que generó es correcto

---

## Primitivas del OpenAI Agents SDK (por debajo)

AgentKit es un wrapper delgado sobre el OpenAI Agents SDK. Estas son las primitivas del SDK que AgentKit expone de forma simplificada:

| Primitiva SDK | Wrapper AgentKit | Descripción |
|---|---|---|
| `Agent(name, instructions, model, tools, handoffs)` | `define_agent()` | Define un agente con su personalidad, modelo y capacidades |
| `@function_tool` | `@tool` | Convierte una función Python en una herramienta que el agente puede invocar |
| `handoffs=[agent_a, agent_b]` | Mismo concepto | Un agente delega el control completo a otro agente |
| `InputGuardrail` / `OutputGuardrail` | `@guardrail` | Validación de entrada/salida que puede detener la ejecución |
| `Runner.run()` / `Runner.run_streamed()` | `agentkit run` / Studio chat | Ejecuta el bucle del agente (LLM → tools → handoffs → respuesta) |
| Tracing (spans, traces) | Studio tracing panel | Observabilidad automática de cada ejecución |

### El bucle del agente (gestionado por el Runner del SDK)

```
Input del usuario
    │
    ▼
[Input Guardrails] ──tripwire──▶ Excepción
    │
    ▼
[Agente + llamada al LLM]
    │
    ├──▶ Output final → [Output Guardrails] → Resultado
    │
    ├──▶ Tool calls → Ejecutar tools → Añadir resultados → Volver al bucle
    │
    ├──▶ Handoff → Cambiar de agente → Volver al bucle
    │
    └──▶ max_turns excedido → Error
```

---

## Stack tecnológico

| Capa | Tecnología | Razón |
|---|---|---|
| **CLI** | Python + Typer | Mismo ecosistema que el Agents SDK |
| **Framework** | Python puro | Wrappers delgados sobre `openai-agents` |
| **Studio backend** | FastAPI + WebSockets | Async, rápido, buen soporte de streaming |
| **Studio frontend** | React + Vite | Para el grafo, editors, y el chat UI |
| **Grafo de agentes** | React Flow | Visualización de nodos y conexiones |
| **File watching** | watchfiles (Python) | Detecta cambios en disco para hot reload |
| **Config** | YAML (parseado con Pydantic) | Simple, legible, versionable |
| **Code export** | Jinja2 templates | Genera código Python limpio |

---

## Propuesta de valor

AgentKit **no construye IA**. Construye **la infraestructura para que la IA del usuario pueda construir agentes de forma predecible**.

| Valor | Descripción |
|---|---|
| **Convenciones claras** | El LLM del usuario genera código correcto a la primera |
| **Studio** | Feedback visual inmediato sin tocar la terminal |
| **CLI** | Scaffold, dev, run, check, export |
| **Código exportable** | Cero vendor lock-in — el output es Python limpio con el Agents SDK |
| **Hot reload** | Cambia el código y ve el resultado al instante |
| **Tracing integrado** | Entiende qué hace tu agente sin añadir logging manual |
