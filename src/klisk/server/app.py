"""FastAPI dev server for Klisk Studio."""

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

from klisk.core.config import ProjectConfig
from klisk.core.discovery import discover_project
from klisk.core.registry import AgentRegistry, ProjectSnapshot
from klisk.server.chat import handle_websocket_chat
from klisk.server.file_editor import (
    update_agent_in_source,
    update_tool_in_source,
    rename_tool_references,
    get_function_source,
)
from klisk.server.watcher import start_watcher

logger = logging.getLogger(__name__)

_CURATED_MODELS: dict[str, list[str]] = {
    "openai": [
        "gpt-4.1",
        "gpt-4.1-mini",
        "gpt-4.1-nano",
        "gpt-4o",
        "gpt-4o-mini",
        "o3",
        "o3-mini",
        "o4-mini",
    ],
    "anthropic": [
        "claude-opus-4-6",
        "claude-sonnet-4-5",
        "claude-haiku-4-5",
    ],
    "gemini": [
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
    ],
}


def _get_provider_models() -> dict[str, list[str]]:
    """Return {provider: [model, ...]} from litellm or fallback to curated list."""
    try:
        import litellm

        result: dict[str, list[str]] = {}
        for provider in ("openai", "anthropic", "gemini"):
            raw = litellm.models_by_provider.get(provider, set())
            chat_models: list[str] = []
            for m in sorted(raw):
                info = litellm.model_cost.get(m, {})
                mode = info.get("mode")
                if mode and mode != "chat":
                    continue
                # Strip provider prefix (gemini models come as "gemini/gemini-2.5-flash")
                clean = m.split("/", 1)[1] if "/" in m else m
                chat_models.append(clean)
            result[provider] = chat_models if chat_models else _CURATED_MODELS.get(provider, [])
        return result
    except (ImportError, Exception):
        return dict(_CURATED_MODELS)


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

    app = FastAPI(title="Klisk Dev Server", lifespan=lifespan)

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

    @router.get("/models")
    async def get_models():
        return {"providers": _get_provider_models()}

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
                "reasoning_effort": e.reasoning_effort,
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
                "reasoning_effort": e.reasoning_effort,
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

        allowed = {"name", "instructions", "model", "temperature", "reasoning_effort"}
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
    await handle_websocket_chat(websocket, _snapshot)


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
    pkg_dist = Path(str(importlib.resources.files("klisk"))) / "studio_dist"
    if pkg_dist.exists():
        return pkg_dist
    # 2. Development fallback (studio/dist next to the repo root)
    dev_dist = Path(__file__).resolve().parent.parent.parent.parent / "studio" / "dist"
    if dev_dist.exists():
        return dev_dist
    return None


def run_server(app: FastAPI, host: str = "0.0.0.0", port: int = 8000) -> None:
    uvicorn.run(app, host=host, port=port, log_level="info")
