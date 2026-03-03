from __future__ import annotations

from typing import Any

from .compat import canonicalize_name


def get_value_by_path(data: dict[str, Any], path: str) -> tuple[bool, Any]:
    if path in data:
        return True, data[path]

    current: Any = data
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return False, None
        current = current[part]
    return True, current


def resolve_value(
    data: dict[str, Any],
    variable: str,
    alias_to_name: dict[str, str],
) -> tuple[str, bool, Any]:
    canonical = canonicalize_name(variable, alias_to_name)

    found, value = get_value_by_path(data, canonical)
    if found:
        return canonical, True, value

    found, value = get_value_by_path(data, variable)
    if found:
        return canonical, True, value

    return canonical, False, None


def serialize_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return value
    # deterministic fallback for object/array values
    import json

    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
