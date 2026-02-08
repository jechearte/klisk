"""Tests for ProjectConfig."""

import tempfile
from pathlib import Path

from klisk.core.config import ProjectConfig


def test_defaults():
    config = ProjectConfig()
    assert config.entry == "src/main.py"
    assert config.name == "MyAgent"
    assert config.studio.port == 3000
    assert config.api.port == 8000
    assert config.defaults.model == "gpt-5.2"
    assert config.defaults.temperature == 0.7


def test_load_from_yaml():
    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = Path(tmpdir) / "klisk.config.yaml"
        config_path.write_text(
            "entry: src/bot.py\n"
            "name: TravelBot\n"
            "studio:\n"
            "  port: 4000\n"
            "defaults:\n"
            "  model: gpt-4o-mini\n"
            "  temperature: 0.5\n"
        )
        config = ProjectConfig.load(tmpdir)
        assert config.entry == "src/bot.py"
        assert config.name == "TravelBot"
        assert config.studio.port == 4000
        assert config.defaults.model == "gpt-4o-mini"
        assert config.defaults.temperature == 0.5


def test_load_missing_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        config = ProjectConfig.load(tmpdir)
        assert config.entry == "src/main.py"
