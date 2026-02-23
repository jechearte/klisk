"""Production server for Klisk — serves chat UI and API without Studio/watcher."""

from __future__ import annotations

import hmac
import json
import logging
import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from klisk.core.config import ProjectConfig
from klisk.core.discovery import discover_project
from klisk.core.registry import ProjectSnapshot
from klisk.server.chat import handle_streaming_chat, handle_websocket_chat

logger = logging.getLogger(__name__)


def _get_valid_keys() -> set[str] | None:
    """Read API keys from environment variables. Returns None if no keys configured."""
    keys: set[str] = set()
    for var in ("KLISK_API_KEY", "KLISK_CHAT_KEY", "KLISK_WIDGET_KEY"):
        raw = os.environ.get(var, "").strip()
        if raw:
            keys.update(k.strip() for k in raw.split(",") if k.strip())
    return keys or None


def _validate_api_key(provided: str, valid_keys: set[str]) -> bool:
    """Validate an API key using constant-time comparison."""
    return any(hmac.compare_digest(provided, k) for k in valid_keys)


def create_production_app(project_dir: Path) -> FastAPI:
    """Create a production FastAPI app (no file watcher, no Studio)."""
    project_dir = project_dir.resolve()
    config = ProjectConfig.load(project_dir)
    project_name = project_dir.name

    # Populate the per-project env cache so the chat handler can resolve
    # API keys via get_project_env() — same mechanism used in workspace mode.
    from klisk.core.env import load_project_env

    load_project_env(project_dir)

    try:
        snapshot = discover_project(project_dir)
    except Exception as e:
        snapshot = ProjectSnapshot()
        snapshot.config = {"error": str(e)}

    # Tag agents/tools with the project name so chat handler can look up
    # the correct per-project env vars (in workspace mode this is done by
    # discover_all_projects, but discover_project leaves .project as None).
    for ae in snapshot.agents.values():
        ae.project = project_name
    for te in snapshot.tools.values():
        te.project = project_name

    api_keys = _get_valid_keys()

    app = FastAPI(title="Klisk")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.deploy.api.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- API routes ---

    @app.get("/api/info")
    async def api_info():
        agent_name = None
        if snapshot and snapshot.agents:
            agent_name = next(iter(snapshot.agents))
        return {
            "name": config.name,
            "agent": agent_name,
            "auth_required": api_keys is not None,
            "deploy": config.deploy.model_dump(),
        }

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/api/chat")
    async def api_chat(request: Request):
        if api_keys:
            auth = request.headers.get("authorization", "")
            key = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
            if not _validate_api_key(key, api_keys):
                return JSONResponse({"error": "Invalid API key"}, status_code=401)

        body = await request.json()
        message = body.get("message", "")
        stream = body.get("stream", True)
        state = body.get("state") or {}
        attachments = body.get("attachments")
        req_agent_name = body.get("agent_name")

        if not stream:
            # Collect full response
            full_text = ""
            final_event = None
            async for event in handle_streaming_chat(message, snapshot, state, attachments=attachments, agent_name=req_agent_name):
                if event["type"] == "token":
                    full_text += event["data"]
                final_event = event
            return {
                "response": full_text,
                "state": state,
                "done": final_event and final_event.get("type") == "done",
            }

        # SSE streaming
        async def event_stream():
            async for event in handle_streaming_chat(message, snapshot, state, attachments=attachments, agent_name=req_agent_name):
                yield f"data: {json.dumps(event)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @app.websocket("/ws/chat")
    async def ws_chat(websocket: WebSocket):
        if api_keys:
            key = websocket.query_params.get("key", "")
            if not _validate_api_key(key, api_keys):
                await websocket.accept()
                await websocket.send_json({"type": "auth_error", "data": "Invalid API key"})
                await websocket.close(code=4001)
                return
        await handle_websocket_chat(websocket, lambda: snapshot)

    # Conditionally serve widget.js
    if not config.deploy.widget.enabled:
        @app.get("/widget.js")
        async def widget_disabled():
            return JSONResponse({"error": "Widget is disabled"}, status_code=404)

    # Serve chat_dist as static files (must be last — catches all routes)
    if config.deploy.chat.enabled:
        chat_dist = _find_chat_dist()
        if chat_dist and chat_dist.exists():
            app.mount("/", StaticFiles(directory=str(chat_dist), html=True), name="chat")
    else:
        @app.get("/")
        async def chat_disabled():
            return JSONResponse({"message": "Chat interface is disabled", "api": "/api/chat"})

    return app


def _find_chat_dist() -> Path | None:
    """Locate the chat UI static build directory."""
    import importlib.resources

    # 1. Inside the installed package
    pkg_dist = Path(str(importlib.resources.files("klisk"))) / "chat_dist"
    if pkg_dist.exists():
        return pkg_dist
    # 2. Development fallback
    dev_dist = Path(__file__).resolve().parent.parent / "chat_dist"
    if dev_dist.exists():
        return dev_dist
    return None


def run_production_server(app: FastAPI, host: str = "0.0.0.0", port: int = 8080) -> None:
    uvicorn.run(app, host=host, port=port, log_level="info")
