from __future__ import annotations

from .ast import VariableRegistryEntry


def validate_registry_access(
    variable: str,
    registry_entry: VariableRegistryEntry | None,
) -> tuple[bool, str | None, str | None]:
    if registry_entry is None:
        return False, "UNKNOWN_VARIABLE", f"Variable '{variable}' is not registered"

    if registry_entry.forbidden:
        return False, "FORBIDDEN_VARIABLE", f"Variable '{registry_entry.name}' is forbidden by policy"

    return True, None, None


def can_be_ai_filled(entry: VariableRegistryEntry) -> bool:
    return entry.source == "ai_generated" or entry.generation_policy in {"AI_INFER", "AI_DRAFT"}
