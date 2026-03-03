from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .ast import TemplateAst
from .compat import canonicalize_name
from .errors import TemplateEngineError


@dataclass(frozen=True)
class RenderResult:
    output: str
    unresolved: tuple[dict[str, object], ...]
    errors: tuple[TemplateEngineError, ...]


def _resolve(data: dict[str, Any], variable: str) -> tuple[bool, Any]:
    if variable in data:
        return True, data[variable]

    current: Any = data
    for item in variable.split("."):
        if not isinstance(current, dict) or item not in current:
            return False, None
        current = current[item]
    return True, current


def _serialize(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return value
    return str(value)


def render(
    ast: TemplateAst,
    data: dict[str, Any],
    registry_by_name: dict[str, Any] | None = None,
    alias_to_name: dict[str, str] | None = None,
    *,
    fail_fast_on_required: bool = False,
    required_variables: set[str] | None = None,
    preserve_unresolved: bool = True,
) -> RenderResult:
    del registry_by_name  # Kept for backward-compatible signature.

    aliases = alias_to_name or {}

    required = required_variables or set()
    output_parts: list[str] = []
    unresolved: list[dict[str, object]] = []
    errors: list[TemplateEngineError] = []

    for node in ast.nodes:
        if node.kind == "text":
            output_parts.append(node.text)
            continue

        variable = canonicalize_name(node.variable, aliases)
        found, value = _resolve(data, variable)
        serialized = _serialize(value).strip() if found else ""

        if not found or serialized == "":
            unresolved.append(
                {
                    "variable": variable,
                    "raw_variable": node.raw_expression,
                    "start": node.range.start,
                    "end": node.range.end,
                }
            )
            if variable in required:
                errors.append(
                    TemplateEngineError(
                        code="MISSING_REQUIRED",
                        message=f"Missing required variable '{variable}'",
                        start=node.range.start,
                        end=node.range.end,
                        variable=variable,
                        path=variable,
                    )
                )
                if preserve_unresolved:
                    output_parts.append(ast.source[node.range.start : node.range.end])
                if fail_fast_on_required:
                    break
                continue

            if preserve_unresolved:
                output_parts.append(ast.source[node.range.start : node.range.end])
            else:
                output_parts.append("")
            continue

        output_parts.append(_serialize(value))

    return RenderResult(
        output="".join(output_parts),
        unresolved=tuple(unresolved),
        errors=tuple(errors),
    )
