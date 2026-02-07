# Claude Code Instructions

## Commits

Haz un commit después de completar cada funcionalidad o cambio significativo. No acumules múltiples features en un solo commit.
Usa commits atómicos: cada commit debe representar un cambio lógico independiente.

Formato del mensaje:
```
<tipo>: <descripción breve>

<descripción detallada si es necesario>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

Tipos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

## Proyecto

Klisk es un framework para construir agentes de IA programáticamente. Wrapper sobre OpenAI Agents SDK con soporte multi-proveedor via LiteLLM.

### Estructura clave
- `src/klisk/core/primitives.py` - `define_agent()`, `@tool`, `get_tools()`
- `src/klisk/templates/default/` - Templates para nuevos proyectos (CLI copia de aquí)
- `templates/default/` - Copia de desarrollo (mantener sincronizado)

### Comandos útiles
```bash
.venv/bin/python -c "..."   # Ejecutar Python
.venv/bin/pip install ...   # Instalar dependencias
klisk create <name>         # Crear proyecto
klisk dev <name>            # Iniciar Studio
```

## Actualizar la Skill

Cada vez que hagas un cambio en el funcionamiento de la CLI actualiza la skill klisk-guide.
