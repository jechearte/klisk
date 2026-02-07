"""FastAPI dev server for Klisk Studio."""

from __future__ import annotations

import asyncio
import json
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import logging

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from klisk.core.config import ProjectConfig
from klisk.core.discovery import discover_all_projects, discover_project
from klisk.core.paths import PROJECTS_DIR
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
        "gpt-5.2",
        "gpt-5.2-pro",
        "gpt-5.1",
        "gpt-5",
        "gpt-5-mini",
        "gpt-5-nano",
        "gpt-5-pro",
        "gpt-4.1",
        "gpt-4.1-mini",
        "gpt-4.1-nano",
        "gpt-4.5-preview",
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "o4-mini",
        "o3",
        "o3-mini",
        "o3-pro",
        "o1",
        "o1-mini",
        "o1-pro",
        "codex-mini-latest",
    ],
    "anthropic": [
        "claude-opus-4-6",
        "claude-opus-4-5",
        "claude-opus-4-1",
        "claude-sonnet-4-5",
        "claude-haiku-4-5",
    ],
    "gemini": [
        "gemini-3-pro-preview",
        "gemini-3-flash-preview",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
    ],
}


_CHAT_MODES = {"chat", "responses"}

# ---------------------------------------------------------------------------
# Model filtering: keep only canonical, current models relevant for agents
# ---------------------------------------------------------------------------

_EXCLUDE_PREFIXES = (
    "ft:", "gpt-3.5", "gpt-4-", "gpt-4-32k", "chatgpt-",
    "claude-3-", "claude-4-",
    "gemini-pro", "gemini-exp-", "gemini-gemma-", "gemma-",
    "gemini-1.5-", "learnlm-", "gemini-robotics-",
)
_EXCLUDE_SUBSTRINGS = (
    "realtime", "audio", "search-preview", "vision",
    "deep-research", "container", "-codex", "-chat",
    "-tts", "-live-", "image-generation",
    "-exp-", "thinking-exp", "computer-use",
)
_EXCLUDE_SUFFIXES = ("-latest", "-001", "-002", "-003", "-exp")

# Match: -YYYY-MM-DD, -YYYYMMDD, preview-MM-DD, preview-MM-YYYY
_DATE_SUFFIX_RE = re.compile(r"-(\d{4}-\d{2}-\d{2}|\d{8})$")
_PREVIEW_DATE_RE = re.compile(r"preview-\d{2}-\d{2,4}$")

_EXCLUDE_EXACT = {"gpt-4"}
# Models whose canonical name matches an exclude rule but should be kept
_ALWAYS_INCLUDE = {"codex-mini-latest"}


def _is_relevant_model(name: str) -> bool:
    """Filter out dated snapshots, legacy, and non-agent models."""
    if name in _ALWAYS_INCLUDE:
        return True
    if name in _EXCLUDE_EXACT:
        return False
    if _DATE_SUFFIX_RE.search(name):
        return False
    if _PREVIEW_DATE_RE.search(name):
        return False
    if any(name.startswith(p) for p in _EXCLUDE_PREFIXES):
        return False
    if any(s in name for s in _EXCLUDE_SUBSTRINGS):
        return False
    if any(name.endswith(s) for s in _EXCLUDE_SUFFIXES):
        return False
    return True


def _get_provider_models() -> dict[str, list[str]]:
    """Return {provider: [model, ...]} from litellm or fallback to curated list."""
    try:
        import litellm

        result: dict[str, list[str]] = {}
        for provider in ("openai", "anthropic", "gemini"):
            raw = litellm.models_by_provider.get(provider, set())
            seen: set[str] = set()
            chat_models: list[str] = []
            for m in sorted(raw):
                info = litellm.model_cost.get(m, {})
                mode = info.get("mode")
                if mode and mode not in _CHAT_MODES:
                    continue
                # Strip provider prefix (gemini models come as "gemini/gemini-2.5-flash")
                clean = m.split("/", 1)[1] if "/" in m else m
                if clean in seen or not _is_relevant_model(clean):
                    continue
                seen.add(clean)
                chat_models.append(clean)
            result[provider] = chat_models if chat_models else _CURATED_MODELS.get(provider, [])
        return result
    except ImportError:
        return dict(_CURATED_MODELS)
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print(f"[klisk] _get_provider_models failed: {exc}", flush=True)
        return dict(_CURATED_MODELS)


_project_path: Path | None = None
_workspace_mode: bool = False
_snapshot: ProjectSnapshot | None = None
_config: ProjectConfig | None = None
_reload_clients: list[WebSocket] = []


def create_app(project_dir: Path | None) -> FastAPI:
    global _project_path, _workspace_mode, _snapshot, _config

    _workspace_mode = project_dir is None

    if _workspace_mode:
        _project_path = None
        _config = None
        try:
            _snapshot = discover_all_projects()
        except Exception as e:
            logger.exception("Failed to discover workspace at startup")
            _snapshot = ProjectSnapshot()
            _snapshot.config = {"error": str(e)}
    else:
        _project_path = project_dir.resolve()
        _config = ProjectConfig.load(_project_path)
        try:
            _snapshot = discover_project(_project_path)
        except Exception as e:
            logger.exception("Failed to discover project at startup")
            _snapshot = ProjectSnapshot()
            _snapshot.config = {"error": str(e)}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        watch_dir = PROJECTS_DIR if _workspace_mode else _project_path
        watcher_task = asyncio.create_task(start_watcher(watch_dir, _on_file_change))
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
                "project": e.project,
            }
            for e in _snapshot.agents.values()
        ]

    @router.get("/agents/{name:path}")
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
                "project": e.project,
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
                "project": e.project,
            }
            for e in _snapshot.tools.values()
        ]

    @router.get("/tools/{name:path}/source")
    async def get_tool_source(name: str):
        if not _snapshot or name not in _snapshot.tools:
            return {"error": "Tool not found"}
        entry = _snapshot.tools[name]
        if not entry.source_file:
            return {"source_code": ""}
        # For source lookup, use the base function name (strip project prefix)
        func_name = name.split("/")[-1] if "/" in name else name
        code = get_function_source(entry.source_file, func_name)
        return {"source_code": code}

    @router.put("/agents/{name:path}")
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

        # Use the base agent name (strip project prefix) for source edits
        base_name = name.split("/")[-1] if "/" in name else name
        logger.info("Updating agent '%s' in %s: %s", base_name, entry.source_file, updates)

        try:
            update_agent_in_source(entry.source_file, base_name, updates)
        except Exception as e:
            logger.exception("Failed to update agent '%s'", name)
            return {"error": str(e)}

        return {"ok": True}

    @router.put("/tools/{name:path}")
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

        # Use the base tool name (strip project prefix) for source edits
        base_name = name.split("/")[-1] if "/" in name else name
        old_name = base_name
        new_name = updates.get("name", old_name)

        try:
            update_tool_in_source(entry.source_file, old_name, updates)
            if new_name != old_name:
                project_dir = _get_project_dir_for_source(entry.source_file)
                if project_dir:
                    rename_tool_references(str(project_dir), old_name, new_name)
        except Exception as e:
            logger.exception("Failed to update tool '%s'", name)
            return {"error": str(e)}

        return {"ok": True}

    return router


async def _handle_chat(websocket: WebSocket) -> None:
    await handle_websocket_chat(websocket, lambda: _snapshot)


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
        if _workspace_mode:
            _snapshot = discover_all_projects()
        else:
            _snapshot = discover_project(_project_path)
    except Exception as e:
        logger.exception("Failed to reload project")
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


def _get_project_dir_for_source(source_file: str) -> Path | None:
    """Resolve the project directory that contains the given source file."""
    if _project_path:
        return _project_path
    # Workspace mode: find the project dir from the source file path
    src = Path(source_file).resolve()
    projects_str = str(PROJECTS_DIR.resolve())
    if str(src).startswith(projects_str):
        # The project dir is the first directory under PROJECTS_DIR
        rel = src.relative_to(PROJECTS_DIR.resolve())
        return PROJECTS_DIR / rel.parts[0]
    return None


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
