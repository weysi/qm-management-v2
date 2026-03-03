from __future__ import annotations

import json
from pathlib import Path

from django.conf import settings

from .catalog import get_package_config


def _resolve_path(rel_path: str) -> Path:
    path = Path(rel_path)
    if path.is_absolute():
        return path
    return (settings.PROJECT_ROOT / path).resolve()


def load_variable_schema(package_code: str, package_version: str) -> dict:
    config = get_package_config(package_code, package_version)
    schema_path = _resolve_path(config["variable_schema_path"])
    return json.loads(schema_path.read_text(encoding="utf-8"))


def load_playbook(package_code: str, package_version: str) -> dict:
    config = get_package_config(package_code, package_version)
    handbook_path = _resolve_path(config["handbook_path"])
    return json.loads(handbook_path.read_text(encoding="utf-8"))
