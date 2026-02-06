# Claude Code Instructions

## Commits

Haz un commit después de completar cada funcionalidad o cambio significativo. No acumules múltiples features en un solo commit.

Formato del mensaje:
```
<tipo>: <descripción breve>

<descripción detallada si es necesario>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

Tipos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

## Proyecto

AgentKit es un framework para construir agentes de IA programáticamente. Wrapper sobre OpenAI Agents SDK con soporte multi-proveedor via LiteLLM.

### Estructura clave
- `src/agentkit/core/primitives.py` - `define_agent()`, `@tool`, `get_tools()`
- `src/agentkit/templates/default/` - Templates para nuevos proyectos (CLI copia de aquí)
- `templates/default/` - Copia de desarrollo (mantener sincronizado)

### Comandos útiles
```bash
.venv/bin/python -c "..."   # Ejecutar Python
.venv/bin/pip install ...   # Instalar dependencias
agentkit create <name>      # Crear proyecto
agentkit dev <name>         # Iniciar Studio
```
