"""Production server for AgentKit — serves chat UI and API without Studio/watcher."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from agentkit.core.config import ProjectConfig
from agentkit.core.discovery import discover_project
from agentkit.core.registry import ProjectSnapshot
from agentkit.server.chat import handle_streaming_chat, handle_websocket_chat

logger = logging.getLogger(__name__)


def create_production_app(project_dir: Path) -> FastAPI:
    """Create a production FastAPI app (no file watcher, no Studio)."""
    project_dir = project_dir.resolve()
    config = ProjectConfig.load(project_dir)

    try:
        snapshot = discover_project(project_dir)
    except Exception as e:
        snapshot = ProjectSnapshot()
        snapshot.config = {"error": str(e)}

    app = FastAPI(title="AgentKit")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
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
        return {"name": config.name, "agent": agent_name}

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/api/chat")
    async def api_chat(request: Request):
        body = await request.json()
        message = body.get("message", "")
        stream = body.get("stream", True)
        state = body.get("state") or {}

        if not stream:
            # Collect full response
            full_text = ""
            final_event = None
            async for event in handle_streaming_chat(message, snapshot, state):
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
            async for event in handle_streaming_chat(message, snapshot, state):
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
        await handle_websocket_chat(websocket, snapshot)

    # Serve chat_dist as static files (must be last — catches all routes)
    chat_dist = _find_chat_dist()
    if chat_dist and chat_dist.exists():
        app.mount("/", StaticFiles(directory=str(chat_dist), html=True), name="chat")

    return app


def _find_chat_dist() -> Path | None:
    """Locate the chat UI static build directory."""
    import importlib.resources

    # 1. Inside the installed package
    pkg_dist = Path(str(importlib.resources.files("agentkit"))) / "chat_dist"
    if pkg_dist.exists():
        return pkg_dist
    # 2. Development fallback
    dev_dist = Path(__file__).resolve().parent.parent / "chat_dist"
    if dev_dist.exists():
        return dev_dist
    return None


def run_production_server(app: FastAPI, host: str = "0.0.0.0", port: int = 8080) -> None:
    uvicorn.run(app, host=host, port=port, log_level="info")
