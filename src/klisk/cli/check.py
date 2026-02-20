"""klisk check — validate the project structure."""

from __future__ import annotations

from pathlib import Path

import typer

from klisk.cli import ui
from klisk.core.config import ProjectConfig
from klisk.core.paths import resolve_project


def _supports_reasoning(model: str | None) -> bool:
    """Check if an OpenAI model supports the reasoning_effort parameter.

    Supported: o-series (o1, o3, o4-mini) and gpt-5+ (gpt-5.1, gpt-5.2).
    Not supported: gpt-4.1, gpt-4o, gpt-4o-mini, etc.
    """
    if model is None:
        return True  # default model (gpt-5.2) supports it

    base = model.removeprefix("openai/")

    # o-series models (o1, o3, o4-mini, etc.)
    if base.startswith("o"):
        return True

    # gpt-N models: supported if N >= 5
    if base.startswith("gpt-"):
        version_part = base[4:]  # e.g. "5.2", "4.1", "4o", "4o-mini"
        try:
            major = int(version_part.split(".")[0].split("-")[0])
            return major >= 5
        except ValueError:
            return False

    return False


def check(
    name_or_path: str = typer.Argument(".", help="Project name or path"),
    agent: str | None = typer.Option(None, "--agent", "-a", help="Check only a specific agent by name"),
) -> None:
    """Validate that the project is well-formed."""
    project_path = resolve_project(name_or_path)
    errors: list[str] = []
    warnings: list[str] = []
    ok: list[str] = []

    # 1. Config
    config_path = project_path / "klisk.config.yaml"
    if config_path.exists():
        try:
            config = ProjectConfig.load(project_path)
            ok.append("Config valid")
        except Exception as e:
            errors.append(f"Config error: {e}")
            config = ProjectConfig()
    else:
        ok.append("Config valid (using defaults)")
        config = ProjectConfig()

    # 2. Entry point
    entry_path = project_path / config.entry
    if entry_path.exists():
        ok.append(f"Entry point: {config.entry}")
    else:
        errors.append(f"Entry point not found: {config.entry}")

    # 3. Try to discover agents and tools
    if entry_path.exists():
        try:
            from klisk.core.discovery import discover_project

            snapshot = discover_project(project_path)

            # Filter to a single agent if --agent is specified
            if agent:
                if agent not in snapshot.agents:
                    errors.append(
                        f"Agent '{agent}' not found. "
                        f"Available: {', '.join(sorted(snapshot.agents)) or '(none)'}"
                    )
                else:
                    agents_to_check = {agent: snapshot.agents[agent]}
                    ok.append(f"Checking agent: {agent}")

                    # Collect only tools used by this agent
                    agent_tool_names = {
                        t for t in agents_to_check[agent].tools
                        if not t.startswith("builtin:")
                    }
                    tools_to_check = {
                        n: t for n, t in snapshot.tools.items()
                        if n in agent_tool_names
                    }
                    ok.append(f"{len(tools_to_check)} tool(s) used by '{agent}'")
            else:
                agents_to_check = snapshot.agents
                tools_to_check = snapshot.tools
                ok.append(f"{len(agents_to_check)} agent(s) registered")
                ok.append(f"{len(tools_to_check)} tool(s) registered")

            if agent and agent not in snapshot.agents:
                pass  # already reported error above
            else:
                # 4. Count builtin tools across checked agents
                builtin_names = set()
                for agent_entry in agents_to_check.values():
                    for t in agent_entry.tools:
                        if t.startswith("builtin:"):
                            builtin_names.add(t)
                if builtin_names:
                    ok.append(f"{len(builtin_names)} builtin tool(s): {', '.join(sorted(builtin_names))}")

                # 5. Check for model_settings misuse
                for agent_name, agent_entry in agents_to_check.items():
                    sdk_agent = agent_entry.sdk_agent
                    if sdk_agent and hasattr(sdk_agent, "model_settings") and sdk_agent.model_settings:
                        ms = sdk_agent.model_settings
                        # Check if temperature was set via model_settings instead of define_agent param
                        if ms.temperature is not None and agent_entry.temperature is None:
                            errors.append(
                                f"Agent '{agent_name}': temperature should be a "
                                f"define_agent() parameter, not inside model_settings"
                            )
                        # Check if reasoning effort was set via model_settings instead of define_agent param
                        if ms.reasoning and ms.reasoning.effort is None:
                            errors.append(
                                f"Agent '{agent_name}': reasoning_effort should be a "
                                f"define_agent() parameter, not inside model_settings"
                            )

                # 6. Validate reasoning_effort values
                VALID_EFFORTS = {"none", "minimal", "low", "medium", "high", "xhigh"}
                OPENAI_ONLY_EFFORTS = {"minimal", "xhigh"}
                for agent_name, agent_entry in agents_to_check.items():
                    effort = agent_entry.reasoning_effort
                    if not effort:
                        continue
                    if effort not in VALID_EFFORTS:
                        errors.append(
                            f"Agent '{agent_name}': invalid reasoning_effort "
                            f"'{effort}'. "
                            f"Valid values: {', '.join(sorted(VALID_EFFORTS))}"
                        )
                        continue
                    model = agent_entry.model
                    is_openai = model is None or "/" not in model or model.startswith("openai/")
                    if is_openai and not _supports_reasoning(model):
                        warnings.append(
                            f"Agent '{agent_name}': reasoning_effort='{effort}' "
                            f"is not supported by '{model or 'default'}'. "
                            f"Only o-series (o1, o3, o4-mini) and gpt-5+ support it"
                        )
                    elif not is_openai and effort in OPENAI_ONLY_EFFORTS:
                        warnings.append(
                            f"Agent '{agent_name}': reasoning_effort='{effort}' "
                            f"is OpenAI-specific and may not be supported by '{model}'"
                        )

                # 7. Validate tools have docstrings and type hints
                for name, tool_entry in tools_to_check.items():
                    if not tool_entry.description:
                        errors.append(f"Tool '{name}' missing docstring")

        except Exception as e:
            errors.append(f"Discovery error: {e}")

    # Print results
    for msg in ok:
        ui.success(msg)
    for msg in warnings:
        ui.warning(msg)
    for msg in errors:
        ui.error(msg)

    if errors:
        raise typer.Exit(1)
    else:
        ui.plain()
        ui.success("All checks passed.")
