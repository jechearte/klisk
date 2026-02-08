"""Tests for the FastAPI dev server."""

import tempfile
from pathlib import Path

import pytest
from httpx import AsyncClient, ASGITransport

from klisk.core.registry import AgentRegistry


@pytest.fixture(autouse=True)
def reset_registry():
    AgentRegistry.reset()
    yield
    AgentRegistry.reset()


def _create_test_project(tmpdir: Path) -> Path:
    config = tmpdir / "klisk.config.yaml"
    config.write_text("entry: src/main.py\nname: TestBot\n")
    src_dir = tmpdir / "src"
    src_dir.mkdir()
    main_py = src_dir / "main.py"
    main_py.write_text(
        "from klisk import define_agent, tool\n"
        "\n"
        "@tool\n"
        "async def hello(name: str) -> str:\n"
        '    """Say hello."""\n'
        "    return f'Hello {name}'\n"
        "\n"
        "agent = define_agent(\n"
        "    name='Greeter',\n"
        "    instructions='You greet people.',\n"
        "    model='gpt-4o',\n"
        "    tools=[hello],\n"
        ")\n"
    )
    return tmpdir


@pytest.mark.asyncio
async def test_get_project():
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = _create_test_project(Path(tmpdir))

        from klisk.server.app import create_app
        app = create_app(project_dir)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/project")
            assert resp.status_code == 200
            data = resp.json()
            assert "Greeter" in data["agents"]
            assert "hello" in data["tools"]
            assert data["config"]["name"] == "TestBot"


@pytest.mark.asyncio
async def test_get_agents():
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = _create_test_project(Path(tmpdir))

        from klisk.server.app import create_app
        app = create_app(project_dir)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/agents")
            assert resp.status_code == 200
            agents = resp.json()
            assert len(agents) == 1
            assert agents[0]["name"] == "Greeter"


@pytest.mark.asyncio
async def test_get_agent_by_name():
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = _create_test_project(Path(tmpdir))

        from klisk.server.app import create_app
        app = create_app(project_dir)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/agents/Greeter")
            assert resp.status_code == 200
            agent = resp.json()
            assert agent["name"] == "Greeter"
            assert agent["model"] == "gpt-4o"

            resp404 = await client.get("/api/agents/NonExistent")
            assert resp404.status_code == 200
            assert resp404.json()["error"] == "Agent not found"


@pytest.mark.asyncio
async def test_get_tools():
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = _create_test_project(Path(tmpdir))

        from klisk.server.app import create_app
        app = create_app(project_dir)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/tools")
            assert resp.status_code == 200
            tools = resp.json()
            assert len(tools) == 1
            assert tools[0]["name"] == "hello"
            assert tools[0]["description"] == "Say hello."
