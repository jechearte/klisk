"""FastAPI dev server for AgentKit Studio."""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import logging

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from agentkit.core.config import ProjectConfig
from agentkit.core.discovery import discover_project
from agentkit.core.registry import AgentRegistry, ProjectSnapshot
from agentkit.server.file_editor import (
    update_agent_in_source,
    update_tool_in_source,
    rename_tool_references,
    get_function_source,
)
from agentkit.server.watcher import start_watcher

logger = logging.getLogger(__name__)

_project_path: Path | None = None
_snapshot: ProjectSnapshot | None = None
_config: ProjectConfig | None = None
_reload_clients: list[WebSocket] = []


def create_app(project_dir: Path) -> FastAPI:
    global _project_path, _snapshot, _config

    _project_path = project_dir.resolve()
    _config = ProjectConfig.load(_project_path)

    try:
        _snapshot = discover_project(_project_path)
    except Exception as e:
        _snapshot = ProjectSnapshot()
        _snapshot.config = {"error": str(e)}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        watcher_task = asyncio.create_task(start_watcher(_project_path, _on_file_change))
        yield
        watcher_task.cancel()

    app = FastAPI(title="AgentKit Dev Server", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(_build_api_router())

    @app.websocket("/ws/chat")
    async def ws_chat(websocket: WebSocket):
        await _handle_chat(websocket)

    @app.websocket("/ws/reload")
    async def ws_reload(websocket: WebSocket):
        await _handle_reload(websocket)

    # Serve studio static files if the build exists
    studio_dist = _find_studio_dist()
    if studio_dist and studio_dist.exists():
        app.mount("/", StaticFiles(directory=str(studio_dist), html=True), name="studio")

    return app


def _build_api_router():
    from fastapi import APIRouter

    router = APIRouter(prefix="/api")

    @router.get("/project")
    async def get_project():
        return _snapshot.to_dict() if _snapshot else {}

    @router.get("/agents")
    async def get_agents():
        if not _snapshot:
            return []
        return [
            {
                "name": e.name,
                "instructions": e.instructions,
                "model": e.model,
                "tools": e.tools,
                "temperature": e.temperature,
                "source_file": e.source_file,
            }
            for e in _snapshot.agents.values()
        ]

    @router.get("/agents/{name}")
    async def get_agent(name: str):
        if _snapshot and name in _snapshot.agents:
            e = _snapshot.agents[name]
            return {
                "name": e.name,
                "instructions": e.instructions,
                "model": e.model,
                "tools": e.tools,
                "temperature": e.temperature,
                "source_file": e.source_file,
            }
        return {"error": "Agent not found"}

    @router.get("/tools")
    async def get_tools():
        if not _snapshot:
            return []
        return [
            {
                "name": e.name,
                "description": e.description,
                "parameters": e.parameters,
                "source_file": e.source_file,
            }
            for e in _snapshot.tools.values()
        ]

    @router.get("/tools/{name}/source")
    async def get_tool_source(name: str):
        if not _snapshot or name not in _snapshot.tools:
            return {"error": "Tool not found"}
        entry = _snapshot.tools[name]
        if not entry.source_file:
            return {"source_code": ""}
        code = get_function_source(entry.source_file, name)
        return {"source_code": code}

    @router.put("/agents/{name}")
    async def update_agent(name: str, request: Request):
        body = await request.json()
        logger.info("PUT /api/agents/%s  body=%s", name, body)

        if not _snapshot or name not in _snapshot.agents:
            logger.warning("Agent '%s' not found in snapshot", name)
            return {"error": "Agent not found"}

        entry = _snapshot.agents[name]
        if not entry.source_file:
            return {"error": "Source file unknown"}

        allowed = {"name", "instructions", "model", "temperature"}
        updates = {k: v for k, v in body.items() if k in allowed and v is not None}
        if not updates:
            return {"ok": True}

        logger.info("Updating agent '%s' in %s: %s", name, entry.source_file, updates)

        try:
            update_agent_in_source(entry.source_file, name, updates)
        except Exception as e:
            logger.exception("Failed to update agent '%s'", name)
            return {"error": str(e)}

        return {"ok": True}

    @router.put("/tools/{name}")
    async def update_tool(name: str, request: Request):
        body = await request.json()
        logger.info("PUT /api/tools/%s  body=%s", name, body)

        if not _snapshot or name not in _snapshot.tools:
            logger.warning("Tool '%s' not found in snapshot", name)
            return {"error": "Tool not found"}

        entry = _snapshot.tools[name]
        if not entry.source_file:
            return {"error": "Source file unknown"}

        allowed = {"name", "description"}
        updates = {k: v for k, v in body.items() if k in allowed and v is not None}
        if not updates:
            return {"ok": True}

        old_name = name
        new_name = updates.get("name", old_name)

        try:
            update_tool_in_source(entry.source_file, old_name, updates)
            if new_name != old_name and _project_path:
                rename_tool_references(str(_project_path), old_name, new_name)
        except Exception as e:
            logger.exception("Failed to update tool '%s'", name)
            return {"error": str(e)}

        return {"ok": True}

    return router


async def _handle_chat(websocket: WebSocket) -> None:
    await websocket.accept()
    previous_response_id: str | None = None

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            user_message = msg.get("message", "")

            # Client can request a conversation reset
            if msg.get("type") == "clear":
                previous_response_id = None
                continue

            # Client can restore a previous conversation context
            if msg.get("previous_response_id"):
                previous_response_id = msg["previous_response_id"]

            if not _snapshot or not _snapshot.agents:
                await websocket.send_json({"type": "error", "data": "No agents loaded"})
                continue

            first_agent_name = next(iter(_snapshot.agents))
            agent_entry = _snapshot.agents[first_agent_name]
            sdk_agent = agent_entry.sdk_agent

            if sdk_agent is None:
                await websocket.send_json({"type": "error", "data": "Agent SDK object not available"})
                continue

            try:
                from agents import Runner

                result = Runner.run_streamed(
                    sdk_agent,
                    user_message,
                    previous_response_id=previous_response_id,
                )

                async for event in result.stream_events():
                    event_type = type(event).__name__

                    if event_type == "RawResponsesStreamEvent":
                        raw = event.data
                        raw_type = type(raw).__name__
                        if raw_type == "ResponseTextDeltaEvent":
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
                            tool_name = getattr(item, "name", getattr(item, "tool_name", str(item)))
                            # Try to extract arguments
                            raw_item = getattr(item, "raw_item", None)
                            args_str = ""
                            if raw_item:
                                args_str = getattr(raw_item, "arguments", "")
                                if not args_str and isinstance(raw_item, dict):
                                    args_str = raw_item.get("arguments", "")
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

                # Save the response ID for conversation continuity
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


async def _handle_reload(websocket: WebSocket) -> None:
    await websocket.accept()
    _reload_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        _reload_clients.remove(websocket)


async def _on_file_change() -> None:
    global _snapshot
    try:
        _snapshot = discover_project(_project_path)
    except Exception as e:
        _snapshot = ProjectSnapshot()
        _snapshot.config = {"error": str(e)}

    data = json.dumps({"type": "reload", "snapshot": _snapshot.to_dict()})
    disconnected = []
    for ws in _reload_clients:
        try:
            await ws.send_text(data)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        _reload_clients.remove(ws)


def _find_studio_dist() -> Path | None:
    """Locate the Studio static build directory."""
    import importlib.resources
    # 1. Inside the installed package
    pkg_dist = Path(str(importlib.resources.files("agentkit"))) / "studio_dist"
    if pkg_dist.exists():
        return pkg_dist
    # 2. Development fallback (studio/dist next to the repo root)
    dev_dist = Path(__file__).resolve().parent.parent.parent.parent / "studio" / "dist"
    if dev_dist.exists():
        return dev_dist
    return None


def run_server(app: FastAPI, host: str = "0.0.0.0", port: int = 8000) -> None:
    uvicorn.run(app, host=host, port=port, log_level="info")
