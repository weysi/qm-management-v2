from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from .ai_client import AiClient, AiClientError


logger = logging.getLogger(__name__)

ALLOWED_LANGUAGES = {"de-DE", "en-US"}
PII_KEYS = {
    "name",
    "first_name",
    "last_name",
    "email",
    "phone",
    "mobile",
    "address",
    "zip",
    "city",
    "ceo",
    "qm_manager",
}


@dataclass(frozen=True)
class VariableFillError(ValueError):
    message: str
    error_code: str
    status_code: int = 400

    def __str__(self) -> str:
        return self.message


def _as_int_or_none(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _validate_language(language: str) -> str:
    normalized = (language or "").strip()
    if normalized not in ALLOWED_LANGUAGES:
        raise VariableFillError(
            message="language must be one of: de-DE, en-US",
            error_code="INVALID_LANGUAGE",
            status_code=400,
        )
    return normalized


def _validate_instruction(instruction: str) -> str:
    clean = (instruction or "").strip()
    if not clean:
        raise VariableFillError(
            message="instruction is required",
            error_code="INSTRUCTION_REQUIRED",
            status_code=400,
        )
    if len(clean) > 4000:
        raise VariableFillError(
            message="instruction exceeds max length",
            error_code="INSTRUCTION_TOO_LONG",
            status_code=400,
        )
    return clean


def _validate_variable_name(variable_name: str) -> str:
    clean = (variable_name or "").strip()
    if not clean:
        raise VariableFillError(
            message="variable_name is required",
            error_code="VARIABLE_NAME_REQUIRED",
            status_code=400,
        )
    return clean


def _masked_context_overview(context: dict[str, object]) -> dict[str, object]:
    masked_keys = [
        key
        for key in context.keys()
        if any(token in key.lower() for token in PII_KEYS)
    ]
    return {
        "key_count": len(context),
        "keys": sorted(context.keys()),
        "masked_key_count": len(masked_keys),
    }


def fill_variable_value(
    *,
    handbook_id: str,
    variable_name: str,
    current_value: str | None,
    instruction: str,
    language: str,
    client_context: dict[str, object] | None,
    constraints: dict[str, object] | None,
    variable_description: str | None = None,
) -> dict[str, object]:
    del handbook_id  # scope key is passed for endpoint consistency; logic is model-agnostic in v1.

    validated_instruction = _validate_instruction(instruction)
    validated_variable_name = _validate_variable_name(variable_name)
    validated_language = _validate_language(language)
    context = client_context or {}
    if not isinstance(context, dict):
        raise VariableFillError(
            message="client_context must be an object",
            error_code="INVALID_CLIENT_CONTEXT",
            status_code=400,
        )
    constraints_payload = constraints or {}
    if not isinstance(constraints_payload, dict):
        raise VariableFillError(
            message="constraints must be an object",
            error_code="INVALID_CONSTRAINTS",
            status_code=400,
        )

    required = bool(constraints_payload.get("required", False))
    max_length = _as_int_or_none(constraints_payload.get("max_length"))
    if max_length is not None and max_length <= 0:
        raise VariableFillError(
            message="constraints.max_length must be a positive integer or null",
            error_code="INVALID_MAX_LENGTH",
            status_code=400,
        )

    try:
        result = AiClient().generate_variable_value(
            instruction=validated_instruction,
            variable_name=validated_variable_name,
            variable_description=variable_description,
            client_context=context,
            current_value=current_value,
            language=validated_language,
            constraints={
                "required": required,
                "max_length": max_length,
            },
        )
    except AiClientError as exc:
        raise VariableFillError(
            message="AI provider error",
            error_code="AI_PROVIDER_ERROR",
            status_code=502,
        ) from exc

    value = (result.value or "").strip()
    if required and not value:
        raise VariableFillError(
            message=f"Generated value is empty for required variable '{validated_variable_name}'",
            error_code="REQUIRED_EMPTY_VALUE",
            status_code=400,
        )

    if max_length is not None and len(value) > max_length:
        raise VariableFillError(
            message=(
                f"Generated value for '{validated_variable_name}' exceeds max_length "
                f"({len(value)} > {max_length})"
            ),
            error_code="MAX_LENGTH_EXCEEDED",
            status_code=400,
        )

    logger.info(
        "AI_VARIABLE_FILL variable=%s language=%s usage=%s context=%s",
        validated_variable_name,
        validated_language,
        result.usage,
        _masked_context_overview(context),
    )

    return {
        "value": value,
        "model": result.model,
        "usage": result.usage,
    }
