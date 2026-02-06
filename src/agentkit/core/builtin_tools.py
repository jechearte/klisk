"""Builtin tools: wrappers for provider-hosted tools (web search, code interpreter, etc.)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class WebSearch:
    """Web search builtin tool.

    Works with OpenAI (via WebSearchTool) and LiteLLM providers
    (via web_search_options in extra_body).
    """

    search_context_size: Literal["low", "medium", "high"] = "medium"


@dataclass
class CodeInterpreter:
    """Code interpreter builtin tool. Only supported with OpenAI models."""

    container: dict[str, Any] | None = None


@dataclass
class FileSearch:
    """File search builtin tool. Only supported with OpenAI models.

    Requires vector_store_ids — must be configured via the object form.
    """

    vector_store_ids: list[str] = field(default_factory=list)
    max_num_results: int | None = None


@dataclass
class ImageGeneration:
    """Image generation builtin tool. Only supported with OpenAI models."""

    model: str = "gpt-image-1"
    quality: Literal["auto", "low", "medium", "high"] = "auto"
    size: Literal["auto", "1024x1024", "1536x1024", "1024x1536"] = "auto"


# Mapping from string shortcuts to default wrapper instances
_SHORTCUT_MAP: dict[str, type] = {
    "web_search": WebSearch,
    "code_interpreter": CodeInterpreter,
    "file_search": FileSearch,
    "image_generation": ImageGeneration,
}

BuiltinTool = WebSearch | CodeInterpreter | FileSearch | ImageGeneration


def _shortcut_to_object(name: str) -> BuiltinTool:
    """Convert a string shortcut like "web_search" to a default wrapper instance."""
    cls = _SHORTCUT_MAP.get(name)
    if cls is None:
        valid = ", ".join(sorted(_SHORTCUT_MAP.keys()))
        raise ValueError(f"Unknown builtin tool '{name}'. Valid options: {valid}")
    if cls is FileSearch:
        raise ValueError(
            "file_search requires configuration. Use FileSearch(vector_store_ids=[...]) instead of the string shortcut."
        )
    return cls()


def resolve_builtin_tools(
    builtin_tools: list[str | BuiltinTool],
    is_openai_model: bool,
) -> tuple[list[Any], dict[str, Any]]:
    """Resolve builtin tool specs into SDK hosted tools and/or extra_body params.

    Returns:
        (sdk_tools, extra_body) — sdk_tools are appended to the Agent's tools list,
        extra_body is merged into ModelSettings.extra_body for LiteLLM providers.
    """
    sdk_tools: list[Any] = []
    extra_body: dict[str, Any] = {}

    for bt in builtin_tools:
        if isinstance(bt, str):
            bt = _shortcut_to_object(bt)

        if isinstance(bt, WebSearch):
            if is_openai_model:
                from agents import WebSearchTool

                sdk_tools.append(
                    WebSearchTool(search_context_size=bt.search_context_size)
                )
            else:
                extra_body["web_search_options"] = {
                    "search_context_size": bt.search_context_size,
                }

        elif isinstance(bt, CodeInterpreter):
            if not is_openai_model:
                raise ValueError(
                    "code_interpreter is only supported with OpenAI models. "
                    "Remove it or switch to an OpenAI model."
                )
            from agents import CodeInterpreterTool

            tool_config: dict[str, Any] = {}
            if bt.container is not None:
                tool_config["container"] = bt.container
            sdk_tools.append(CodeInterpreterTool(tool_config=tool_config))

        elif isinstance(bt, FileSearch):
            if not is_openai_model:
                raise ValueError(
                    "file_search is only supported with OpenAI models. "
                    "Remove it or switch to an OpenAI model."
                )
            if not bt.vector_store_ids:
                raise ValueError(
                    "file_search requires vector_store_ids. "
                    "Use FileSearch(vector_store_ids=['vs_...'])."
                )
            from agents import FileSearchTool

            sdk_tools.append(
                FileSearchTool(
                    vector_store_ids=bt.vector_store_ids,
                    max_num_results=bt.max_num_results,
                )
            )

        elif isinstance(bt, ImageGeneration):
            if not is_openai_model:
                raise ValueError(
                    "image_generation is only supported with OpenAI models. "
                    "Remove it or switch to an OpenAI model."
                )
            from agents import ImageGenerationTool

            sdk_tools.append(
                ImageGenerationTool(
                    tool_config={
                        "model": bt.model,
                        "quality": bt.quality,
                        "size": bt.size,
                    }
                )
            )

        else:
            raise TypeError(f"Invalid builtin tool: {bt!r}")

    return sdk_tools, extra_body


def builtin_tool_name(bt: str | BuiltinTool) -> str:
    """Return a display name for a builtin tool (for registry)."""
    if isinstance(bt, str):
        return f"builtin:{bt}"
    return f"builtin:{type(bt).__name__.lower()}"
