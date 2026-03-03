from __future__ import annotations

from typing import Any

from .ast import VariableRegistryEntry
from .compat import canonicalize_name
from .errors import TemplateEngineError


_TYPE_MAP = {
    "string": str,
    "rich_text": str,
    "date": str,
    "number": (int, float),
    "enum": str,
    "boolean": bool,
    "object": dict,
}


def validate_template_vars(
    variables: set[str],
    registry_by_name: dict[str, VariableRegistryEntry],
    alias_to_name: dict[str, str],
) -> list[TemplateEngineError]:
    errors: list[TemplateEngineError] = []
    for variable in sorted(variables):
        canonical = canonicalize_name(variable, alias_to_name)
        entry = registry_by_name.get(canonical)
        if entry is None:
            errors.append(
                TemplateEngineError(
                    code="UNKNOWN_VARIABLE",
                    message=f"Variable '{variable}' is not registered",
                    variable=variable,
                    path=variable,
                )
            )
            continue
        if entry.forbidden:
            errors.append(
                TemplateEngineError(
                    code="FORBIDDEN_VARIABLE",
                    message=f"Variable '{canonical}' is forbidden by policy",
                    variable=canonical,
                    path=canonical,
                )
            )
    return errors


def _validate_constraints(value: Any, entry: VariableRegistryEntry) -> list[str]:
    constraints = entry.constraints or {}
    messages: list[str] = []

    if isinstance(value, str):
        min_len = constraints.get("min_length")
        max_len = constraints.get("max_length")
        pattern = constraints.get("regex")

        if isinstance(min_len, int) and len(value) < min_len:
            messages.append(f"Minimum length is {min_len}")
        if isinstance(max_len, int) and len(value) > max_len:
            messages.append(f"Maximum length is {max_len}")
        if isinstance(pattern, str) and pattern:
            import re

            if re.fullmatch(pattern, value) is None:
                messages.append("Value does not match required pattern")

    if entry.var_type == "enum":
        options = set(entry.enum_options)
        if options and str(value) not in options:
            messages.append("Value must be one of enum options")

    return messages


def validate_data(
    data: dict[str, Any],
    registry_by_name: dict[str, VariableRegistryEntry],
    alias_to_name: dict[str, str],
    *,
    validate_required: bool = False,
) -> list[TemplateEngineError]:
    errors: list[TemplateEngineError] = []
    normalized: dict[str, Any] = {}

    for key, value in data.items():
        canonical = canonicalize_name(key, alias_to_name)
        entry = registry_by_name.get(canonical)
        if entry is None:
            errors.append(
                TemplateEngineError(
                    code="UNKNOWN_VARIABLE",
                    message=f"Variable '{key}' is not registered",
                    variable=key,
                    path=key,
                )
            )
            continue

        if entry.forbidden:
            errors.append(
                TemplateEngineError(
                    code="FORBIDDEN_VARIABLE",
                    message=f"Variable '{canonical}' is forbidden by policy",
                    variable=canonical,
                    path=canonical,
                )
            )
            continue

        expected = _TYPE_MAP.get(entry.var_type)
        if expected and value is not None and not isinstance(value, expected):
            errors.append(
                TemplateEngineError(
                    code="INVALID_TYPE",
                    message=f"Variable '{canonical}' expects type '{entry.var_type}'",
                    variable=canonical,
                    path=canonical,
                )
            )
            continue

        for message in _validate_constraints(value, entry):
            errors.append(
                TemplateEngineError(
                    code="CONSTRAINT_VIOLATION",
                    message=f"Variable '{canonical}': {message}",
                    variable=canonical,
                    path=canonical,
                )
            )

        normalized[canonical] = value

    if validate_required:
        for canonical, entry in registry_by_name.items():
            if not entry.required:
                continue
            if canonical in normalized:
                continue
            errors.append(
                TemplateEngineError(
                    code="MISSING_REQUIRED",
                    message=f"Missing required variable '{canonical}'",
                    variable=canonical,
                    path=canonical,
                )
            )

    return errors
