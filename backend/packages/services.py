from __future__ import annotations

import json
from pathlib import Path

from django.conf import settings

from rag.models import RagVariableKey

from .catalog import get_package_config


def _resolve_path(rel_path: str) -> Path:
    """Resolve a path relative to PROJECT_ROOT (works both locally and in Docker)."""
    p = Path(rel_path)
    if p.is_absolute():
        return p
    return (settings.PROJECT_ROOT / p).resolve()


def load_variable_schema(package_code: str, package_version: str) -> dict:
    config = get_package_config(package_code, package_version)
    schema_path = _resolve_path(config["variable_schema_path"])
    return json.loads(schema_path.read_text(encoding="utf-8"))


def load_playbook(package_code: str, package_version: str) -> dict:
    config = get_package_config(package_code, package_version)
    playbook_path = _resolve_path(config["playbook_path"])
    return json.loads(playbook_path.read_text(encoding="utf-8"))


def seed_variable_keys(package_code: str, package_version: str) -> list[RagVariableKey]:
    schema = load_variable_schema(package_code, package_version)
    variables = schema.get("variables", [])
    upserted: list[RagVariableKey] = []

    for item in variables:
        token = item["token"]
        defaults = {
            "type": item.get("type", RagVariableKey.Type.STRING),
            "required": bool(item.get("required", False)),
            "description": item.get("description", ""),
            "examples": item.get("examples", []),
            "default_value": item.get("default_value"),
            "generation_policy": item.get(
                "generation_policy", RagVariableKey.GenerationPolicy.DETERMINISTIC
            ),
        }
        obj, _created = RagVariableKey.objects.update_or_create(
            package_code=package_code,
            package_version=package_version,
            token=token,
            defaults=defaults,
        )
        upserted.append(obj)

    return upserted
