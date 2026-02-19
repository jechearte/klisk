"""Project configuration parsed from klisk.config.yaml."""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel

from klisk.core.paths import KLISK_HOME


# ---------------------------------------------------------------------------
# Global config (~~/klisk/config.yaml)
# ---------------------------------------------------------------------------


class GCloudConfig(BaseModel):
    project: str = ""
    region: str = ""


class GlobalConfig(BaseModel):
    gcloud: GCloudConfig = GCloudConfig()

    @classmethod
    def load(cls) -> GlobalConfig:
        path = KLISK_HOME / "config.yaml"
        if not path.exists():
            return cls()
        with open(path) as f:
            data = yaml.safe_load(f) or {}
        return cls.model_validate(data)

    def save(self) -> None:
        KLISK_HOME.mkdir(parents=True, exist_ok=True)
        path = KLISK_HOME / "config.yaml"
        data = self.model_dump()
        with open(path, "w") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)


# ---------------------------------------------------------------------------
# Project config (klisk.config.yaml per project)
# ---------------------------------------------------------------------------


class StudioConfig(BaseModel):
    port: int = 3000


class ApiConfig(BaseModel):
    port: int = 8321


class ChatDeployConfig(BaseModel):
    enabled: bool = True
    title: str = ""
    welcome_message: str = ""
    attachments: bool = True


class WidgetDeployConfig(BaseModel):
    enabled: bool = True
    color: str = "#2563eb"
    position: str = "bottom-right"
    width: str = "380px"
    height: str = "560px"
    welcome_message: str = ""
    placeholder: str = "Type a message..."
    auto_open: bool = False
    user_message_color: str = "#2563eb"
    header_color: str = ""
    bubble_icon: str = "chat"


class ApiDeployConfig(BaseModel):
    cors_origins: list[str] = ["*"]


class DeployConfig(BaseModel):
    chat: ChatDeployConfig = ChatDeployConfig()
    widget: WidgetDeployConfig = WidgetDeployConfig()
    api: ApiDeployConfig = ApiDeployConfig()


class ProjectConfig(BaseModel):
    entry: str = "src/main.py"
    name: str = "MyAgent"
    studio: StudioConfig = StudioConfig()
    api: ApiConfig = ApiConfig()
    deploy: DeployConfig = DeployConfig()

    @classmethod
    def load(cls, project_dir: str | Path) -> ProjectConfig:
        config_path = Path(project_dir) / "klisk.config.yaml"
        if not config_path.exists():
            return cls()
        with open(config_path) as f:
            data = yaml.safe_load(f) or {}
        return cls.model_validate(data)

    def save(self, project_dir: str | Path) -> None:
        """Write the current config back to klisk.config.yaml."""
        config_path = Path(project_dir) / "klisk.config.yaml"
        data = self.model_dump()
        with open(config_path, "w") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)
