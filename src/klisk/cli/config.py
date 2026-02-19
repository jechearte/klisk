"""klisk config — view and set global configuration."""

from __future__ import annotations

from typing import Optional

import typer
import yaml

from klisk.core.config import GlobalConfig


def config(
    key: Optional[str] = typer.Argument(None, help="Config key (e.g. gcloud.project)"),
    value: Optional[str] = typer.Argument(None, help="Value to set"),
) -> None:
    """View or set global Klisk configuration.

    Examples:
      klisk config                          # show current config
      klisk config gcloud.project my-id     # set a value
      klisk config gcloud.region us-central1
    """
    cfg = GlobalConfig.load()

    # No arguments — print current config
    if key is None:
        data = cfg.model_dump()
        typer.echo(yaml.dump(data, default_flow_style=False, sort_keys=False).rstrip())
        return

    # Key without value — print that specific value
    if value is None:
        current = _get_nested(cfg.model_dump(), key)
        if current is None:
            typer.echo(f"Unknown key: {key}", err=True)
            raise typer.Exit(1)
        typer.echo(current)
        return

    # Key + value — set it
    if not _set_nested(cfg, key, value):
        typer.echo(f"Unknown key: {key}", err=True)
        raise typer.Exit(1)

    cfg.save()
    typer.echo(f"  {key} = {value}")


def _get_nested(data: dict, dotted_key: str):
    """Retrieve a value from a nested dict using a dotted key."""
    parts = dotted_key.split(".")
    current = data
    for part in parts:
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _set_nested(model, dotted_key: str, value: str) -> bool:
    """Set a value on a nested Pydantic model using a dotted key."""
    parts = dotted_key.split(".")
    obj = model
    for part in parts[:-1]:
        if not hasattr(obj, part):
            return False
        obj = getattr(obj, part)
    field = parts[-1]
    if not hasattr(obj, field):
        return False
    setattr(obj, field, value)
    return True
