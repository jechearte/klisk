"""Shared chat logic for dev and production servers."""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from fastapi import WebSocket, WebSocketDisconnect

from agentkit.core.registry import ProjectSnapshot

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
ALLOWED_FILE_MIMES = {"application/pdf"}
MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024  # 20MB


def is_litellm_model(model_str: str | None) -> bool:
    """Check if a model string refers to a LiteLLM model (non-OpenAI provider)."""
    if not model_str:
        return False
    return "/" in model_str and not model_str.startswith("openai/")


def _build_content_parts(
    text: str, attachments: list[dict] | None, *, litellm: bool = False
) -> str | list[dict]:
    """Build content parts from text + attachments.

    Without attachments, returns the plain string (preserving current behaviour).
    With attachments, returns a list of content part dicts in the appropriate format:
    - litellm=False: Responses API format (input_image, input_file) for native OpenAI
    - litellm=True:  Chat Completions format (image_url, file) for LiteLLM providers
    """
    if not attachments:
        return text

    parts: list[dict] = []
    if text:
        if litellm:
            parts.append({"type": "text", "text": text})
        else:
            parts.append({"type": "input_text", "text": text})

    for att in attachments:
        mime = att.get("mime_type", "")
        data = att.get("data", "")
        name = att.get("name", "file")

        # Validate size (base64 string length ≈ 4/3 × raw bytes)
        if len(data) > MAX_ATTACHMENT_SIZE * 4 // 3:
            continue

        data_uri = f"data:{mime};base64,{data}"

        if mime in ALLOWED_IMAGE_MIMES:
            if litellm:
                parts.append({
                    "type": "image_url",
                    "image_url": {"url": data_uri, "detail": "auto"},
                })
            else:
                parts.append({
                    "type": "input_image",
                    "image_url": data_uri,
                    "detail": "auto",
                })
        elif mime in ALLOWED_FILE_MIMES:
            if litellm:
                parts.append({
                    "type": "file",
                    "file": {"file_data": data_uri, "filename": name},
                })
            else:
                parts.append({
                    "type": "input_file",
                    "file_data": data_uri,
                    "filename": name,
                })
        # Silently skip unsupported MIME types

    return parts if parts else text


async def handle_websocket_chat(websocket: WebSocket, snapshot: ProjectSnapshot) -> None:
    """Handle a WebSocket chat session using agents from the given snapshot."""
    await websocket.accept()
    previous_response_id: str | None = None
    conversation_history: list | None = None
    current_agent_name: str | None = None

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            user_message = msg.get("message", "")

            if msg.get("type") == "clear":
                previous_response_id = None
                conversation_history = None
                continue

            if msg.get("previous_response_id"):
                previous_response_id = msg["previous_response_id"]

            if not snapshot or not snapshot.agents:
                await websocket.send_json({"type": "error", "data": "No agents loaded"})
                continue

            # Select agent: use agent_name from message, fall back to first agent
            agent_name = msg.get("agent_name")
            if agent_name and agent_name in snapshot.agents:
                selected_name = agent_name
            else:
                selected_name = next(iter(snapshot.agents))

            # Reset conversation state when switching agents
            if current_agent_name is not None and selected_name != current_agent_name:
                previous_response_id = None
                conversation_history = None

            current_agent_name = selected_name
            agent_entry = snapshot.agents[selected_name]
            sdk_agent = agent_entry.sdk_agent

            if sdk_agent is None:
                await websocket.send_json({"type": "error", "data": "Agent SDK object not available"})
                continue

            use_litellm = is_litellm_model(agent_entry.model)

            try:
                from agents import RunConfig, Runner

                attachments = msg.get("attachments")
                content = _build_content_parts(user_message, attachments, litellm=use_litellm)

                if use_litellm and conversation_history is not None:
                    run_input = conversation_history + [{"role": "user", "content": content}]
                elif isinstance(content, list):
                    # Native OpenAI path with attachments — wrap in Responses API message
                    run_input = [{"role": "user", "content": content}]
                else:
                    run_input = content

                # Disable tracing when attachments are present to avoid
                # "payload too large" errors from base64 data in span input
                run_config = RunConfig(tracing_disabled=True) if attachments else None

                result = Runner.run_streamed(
                    sdk_agent,
                    run_input,
                    previous_response_id=previous_response_id if not use_litellm else None,
                    run_config=run_config,
                )

                async for event in result.stream_events():
                    event_type = type(event).__name__

                    if event_type == "RawResponsesStreamEvent":
                        raw = event.data
                        raw_type = type(raw).__name__
                        if raw_type == "ResponseTextDeltaEvent":
                            if raw.delta:
                                await websocket.send_json({
                                    "type": "token",
                                    "data": raw.delta,
                                })
                        elif raw_type in (
                            "ResponseReasoningSummaryTextDeltaEvent",
                            "ResponseReasoningDeltaEvent",
                        ):
                            delta = getattr(raw, "delta", getattr(raw, "text", ""))
                            if delta:
                                await websocket.send_json({
                                    "type": "thinking",
                                    "data": delta,
                                })
                    elif event_type == "RunItemStreamEvent":
                        item = event.item
                        item_type = type(item).__name__
                        if item_type == "ToolCallItem":
                            raw_item = getattr(item, "raw_item", None)
                            tool_name = "tool"
                            if raw_item:
                                if isinstance(raw_item, dict):
                                    tool_name = raw_item.get("name", "tool")
                                elif hasattr(raw_item, "name"):
                                    tool_name = raw_item.name
                            args_str = ""
                            if raw_item:
                                if isinstance(raw_item, dict):
                                    args_str = raw_item.get("arguments", "")
                                else:
                                    args_str = getattr(raw_item, "arguments", "")
                            await websocket.send_json({
                                "type": "tool_call",
                                "data": {
                                    "tool": tool_name,
                                    "arguments": args_str,
                                    "status": "running",
                                },
                            })
                        elif item_type == "ToolCallOutputItem":
                            await websocket.send_json({
                                "type": "tool_result",
                                "data": {
                                    "output": str(getattr(item, "output", "")),
                                },
                            })

                if use_litellm:
                    conversation_history = result.to_input_list()
                else:
                    previous_response_id = result.last_response_id

                final_output = result.final_output
                await websocket.send_json({
                    "type": "done",
                    "data": str(final_output) if final_output else "",
                    "response_id": previous_response_id,
                })

            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "data": str(e),
                })

    except WebSocketDisconnect:
        pass


async def handle_streaming_chat(
    message: str,
    snapshot: ProjectSnapshot,
    state: dict | None = None,
    attachments: list[dict] | None = None,
    agent_name: str | None = None,
) -> AsyncGenerator[dict, None]:
    """Stream chat events as dicts for SSE/REST usage.

    State dict is used to maintain conversation continuity between requests.
    Keys: 'previous_response_id', 'conversation_history', 'current_agent_name'.
    """
    if state is None:
        state = {}

    previous_response_id = state.get("previous_response_id")
    conversation_history = state.get("conversation_history")

    if not snapshot or not snapshot.agents:
        yield {"type": "error", "data": "No agents loaded"}
        return

    # Select agent: use agent_name param, fall back to first agent
    if agent_name and agent_name in snapshot.agents:
        selected_name = agent_name
    else:
        selected_name = next(iter(snapshot.agents))

    # Reset conversation state when switching agents
    if state.get("current_agent_name") is not None and selected_name != state.get("current_agent_name"):
        previous_response_id = None
        conversation_history = None

    state["current_agent_name"] = selected_name
    agent_entry = snapshot.agents[selected_name]
    sdk_agent = agent_entry.sdk_agent

    if sdk_agent is None:
        yield {"type": "error", "data": "Agent SDK object not available"}
        return

    use_litellm = is_litellm_model(agent_entry.model)

    try:
        from agents import RunConfig, Runner

        content = _build_content_parts(message, attachments, litellm=use_litellm)

        if use_litellm and conversation_history is not None:
            run_input = conversation_history + [{"role": "user", "content": content}]
        elif isinstance(content, list):
            run_input = [{"role": "user", "content": content}]
        else:
            run_input = content

        run_config = RunConfig(tracing_disabled=True) if attachments else None

        result = Runner.run_streamed(
            sdk_agent,
            run_input,
            previous_response_id=previous_response_id if not use_litellm else None,
            run_config=run_config,
        )

        async for event in result.stream_events():
            event_type = type(event).__name__

            if event_type == "RawResponsesStreamEvent":
                raw = event.data
                raw_type = type(raw).__name__
                if raw_type == "ResponseTextDeltaEvent":
                    if raw.delta:
                        yield {"type": "token", "data": raw.delta}
                elif raw_type in (
                    "ResponseReasoningSummaryTextDeltaEvent",
                    "ResponseReasoningDeltaEvent",
                ):
                    delta = getattr(raw, "delta", getattr(raw, "text", ""))
                    if delta:
                        yield {"type": "thinking", "data": delta}
            elif event_type == "RunItemStreamEvent":
                item = event.item
                item_type = type(item).__name__
                if item_type == "ToolCallItem":
                    raw_item = getattr(item, "raw_item", None)
                    tool_name = "tool"
                    if raw_item:
                        if isinstance(raw_item, dict):
                            tool_name = raw_item.get("name", "tool")
                        elif hasattr(raw_item, "name"):
                            tool_name = raw_item.name
                    args_str = ""
                    if raw_item:
                        if isinstance(raw_item, dict):
                            args_str = raw_item.get("arguments", "")
                        else:
                            args_str = getattr(raw_item, "arguments", "")
                    yield {
                        "type": "tool_call",
                        "data": {
                            "tool": tool_name,
                            "arguments": args_str,
                            "status": "running",
                        },
                    }
                elif item_type == "ToolCallOutputItem":
                    yield {
                        "type": "tool_result",
                        "data": {"output": str(getattr(item, "output", ""))},
                    }

        if use_litellm:
            state["conversation_history"] = result.to_input_list()
            state.pop("previous_response_id", None)
        else:
            state["previous_response_id"] = result.last_response_id
            state.pop("conversation_history", None)

        final_output = result.final_output
        yield {
            "type": "done",
            "data": str(final_output) if final_output else "",
            "response_id": state.get("previous_response_id"),
        }

    except Exception as e:
        yield {"type": "error", "data": str(e)}
