"""Project configuration parsed from klisk.config.yaml."""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel


class StudioConfig(BaseModel):
    port: int = 3000


class ApiConfig(BaseModel):
    port: int = 8000


class ProjectConfig(BaseModel):
    entry: str = "src/main.py"
    name: str = "MyAgent"
    studio: StudioConfig = StudioConfig()
    api: ApiConfig = ApiConfig()

    @classmethod
    def load(cls, project_dir: str | Path) -> ProjectConfig:
        config_path = Path(project_dir) / "klisk.config.yaml"
        if not config_path.exists():
            return cls()
        with open(config_path) as f:
            data = yaml.safe_load(f) or {}
        return cls.model_validate(data)
