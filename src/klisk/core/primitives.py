"""Core primitives: define_agent() and @tool."""

from __future__ import annotations

import inspect
import os
from typing import Any, Callable

from agents import Agent, function_tool, FunctionTool

from klisk.core.builtin_tools import (
    BuiltinTool,
    resolve_builtin_tools,
    builtin_tool_name,
)
from klisk.core.registry import AgentRegistry, AgentEntry, ToolEntry


def _resolve_model(model_str: str | None) -> Any:
    """Resolve a model string to a native OpenAI string or a LitellmModel instance.

    Convention:
    - No "/" in the string (e.g. "gpt-4o") → native OpenAI model
    - "openai/..." prefix (e.g. "openai/gpt-4o") → strip prefix, native OpenAI
    - Any other prefix (e.g. "anthropic/claude-...") → LitellmModel via LiteLLM
    """
    if model_str is None:
        return "gpt-5.2"

    if "/" not in model_str:
        return model_str

    if model_str.startswith("openai/"):
        return model_str[len("openai/"):]

    # Enable the serializer compatibility patch to suppress Pydantic warnings
    os.environ.setdefault("OPENAI_AGENTS_ENABLE_LITELLM_SERIALIZER_PATCH", "true")

    try:
        from agents.extensions.models.litellm_model import LitellmModel
    except ImportError:
        raise ImportError(
            f"LiteLLM is required to use '{model_str}'. "
            "Install it with: pip install 'klisk[litellm]'"
        )

    # Disable OpenAI tracing when there is no OpenAI API key
    if not os.environ.get("OPENAI_API_KEY"):
        from agents import set_tracing_disabled
        set_tracing_disabled(True)

    # Auto-detect API key from environment based on provider prefix
    # e.g. "gemini/..." → GEMINI_API_KEY, "anthropic/..." → ANTHROPIC_API_KEY
    provider = model_str.split("/", 1)[0]
    api_key = os.environ.get(f"{provider.upper()}_API_KEY")

    return LitellmModel(model=model_str, api_key=api_key)


def define_agent(
    *,
    name: str,
    instructions: str | None = None,
    model: str | None = None,
    temperature: float | None = None,
    reasoning_effort: str = "medium",
    tools: list[Any] | None = None,
    builtin_tools: list[str | BuiltinTool] | None = None,
    **kwargs: Any,
) -> Agent:
    """Create an agent and register it in the global AgentRegistry.

    Thin wrapper over the OpenAI Agents SDK `Agent` class that also registers
    the agent so the Studio and CLI can discover it.

    The *model* parameter accepts:
    - OpenAI model names: ``"gpt-5.2"``, ``"gpt-4.1"``
    - LiteLLM provider/model format: ``"anthropic/claude-3-5-sonnet-20240620"``,
      ``"gemini/gemini-2.5-flash"``, ``"mistral/mistral-large-latest"``

    The *reasoning_effort* parameter controls how much reasoning the model uses.
    Supported values: ``"none"``, ``"minimal"``, ``"low"``, ``"medium"`` (default),
    ``"high"``, ``"xhigh"``.
    LiteLLM translates this to each provider's equivalent parameter.

    The *builtin_tools* parameter enables provider-hosted tools:
    - String shortcuts: ``["web_search"]``, ``["code_interpreter"]``
    - Configured objects: ``[WebSearch(search_context_size="high")]``
    - All builtin tools require OpenAI models.
    """
    sdk_tools = []
    tool_names = []
    if tools:
        for t in tools:
            if isinstance(t, FunctionTool):
                sdk_tools.append(t)
                tool_names.append(t.name)
            else:
                sdk_tools.append(t)
                tool_names.append(getattr(t, "name", str(t)))

    resolved_model = _resolve_model(model)
    is_openai = model is None or "/" not in model or model.startswith("openai/")

    # Resolve builtin tools (web_search, code_interpreter, etc.)
    # All builtin tools require OpenAI models — resolve_builtin_tools raises for non-OpenAI.
    if builtin_tools:
        hosted_sdk_tools, _ = resolve_builtin_tools(builtin_tools, is_openai)
        sdk_tools.extend(hosted_sdk_tools)
        for bt in builtin_tools:
            tool_names.append(builtin_tool_name(bt))

    if "model_settings" not in kwargs:
        from agents import ModelSettings
        from agents.model_settings import Reasoning
        kwargs["model_settings"] = ModelSettings(
            temperature=temperature,
            reasoning=Reasoning(effort=reasoning_effort),
        )

    sdk_agent = Agent(
        name=name,
        instructions=instructions,
        model=resolved_model,
        tools=sdk_tools,
        **kwargs,
    )

    caller_frame = inspect.stack()[1]
    source_file = caller_frame.filename

    entry = AgentEntry(
        name=name,
        instructions=instructions if isinstance(instructions, str) else None,
        model=model,
        tools=tool_names,
        temperature=temperature,
        reasoning_effort=reasoning_effort,
        source_file=source_file,
        sdk_agent=sdk_agent,
    )
    AgentRegistry.get_instance().register_agent(entry)

    return sdk_agent


def tool(func: Callable | None = None, **kwargs: Any) -> Any:
    """Decorator that wraps @function_tool and registers the tool in the AgentRegistry.

    Can be used with or without parentheses:
        @tool
        async def my_func(...): ...

        @tool(name_override="custom_name")
        async def my_func(...): ...
    """
    def _wrap(fn: Callable) -> FunctionTool:
        ft = function_tool(fn, **kwargs)
        _register_tool(fn, ft)
        return ft

    if func is not None:
        return _wrap(func)
    return _wrap


def get_tools(*names: str) -> list[FunctionTool]:
    """Retrieve registered tools by name.

    Use this in your entry point (main.py) to reference tools defined in
    separate files under the tools/ directory.

    Example:
        from klisk import define_agent, get_tools

        agent = define_agent(
            name="MyAgent",
            tools=get_tools("greet", "search"),
        )
    """
    registry = AgentRegistry.get_instance()
    result = []
    for name in names:
        entry = registry.get_tool(name)
        if entry is None:
            raise ValueError(f"Tool '{name}' not found. Make sure it's decorated with @tool.")
        result.append(entry.function_tool)
    return result


def _register_tool(fn: Callable, ft: FunctionTool) -> None:
    source_file = inspect.getfile(fn)

    entry = ToolEntry(
        name=ft.name,
        description=ft.description,
        parameters=ft.params_json_schema,
        source_file=source_file,
        function_tool=ft,
    )
    AgentRegistry.get_instance().register_tool(entry)
