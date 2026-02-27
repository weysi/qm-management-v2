from __future__ import annotations

from typing import Any

from django.conf import settings
from django.utils import timezone

from common.openai_client import chat_json
from prompts.registry import get_prompt
from rag.models import RagManual, RagVariableKey, RagVariableValue, RagRun
from rag.services.retrieval import RetrievalFilters, retrieve_context
from runs.services.run_logger import emit_event


def _upsert_variable_value(
    *,
    manual: RagManual,
    token: str,
    value: str,
    source: str,
    confidence: float | None,
    provenance: dict[str, Any],
) -> RagVariableValue:
    row, _created = RagVariableValue.objects.update_or_create(
        manual=manual,
        token=token,
        defaults={
            "value": value,
            "source": source,
            "confidence": confidence,
            "provenance": provenance,
        },
    )
    return row


def _profile_value(customer_profile: dict[str, Any], token: str) -> str | None:
    direct = customer_profile.get(token)
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    lowered = customer_profile.get(token.lower())
    if isinstance(lowered, str) and lowered.strip():
        return lowered.strip()
    return None


def _infer_with_ai(
    manual: RagManual,
    token: str,
    key: RagVariableKey,
    customer_profile: dict[str, Any],
) -> tuple[str, float, dict[str, Any]]:
    prompt_version, prompt = get_prompt("infer_variables", "v1")
    response = chat_json(
        model=settings.OPENAI_CHAT_MODEL,
        system_prompt=prompt,
        user_prompt=(
            f"package={manual.package_code}/{manual.package_version}\n"
            f"token={token}\n"
            f"description={key.description}\n"
            f"customer_profile={customer_profile}\n"
            "Return values only for requested token."
        ),
        temperature=0,
        retries=1,
    )
    values = response.payload.get("values", {})
    item = values.get(token, {}) if isinstance(values, dict) else {}
    value = str(item.get("value", "")).strip()
    confidence = float(item.get("confidence", 0.0))
    provenance = {
        "model": response.model,
        "prompt_version": prompt_version,
        "used_chunk_ids": [],
        "temperature": 0,
        "timestamp": timezone.now().isoformat(),
    }
    return value, confidence, provenance


def _draft_with_ai(
    manual: RagManual,
    token: str,
    key: RagVariableKey,
    customer_profile: dict[str, Any],
) -> tuple[str, float, dict[str, Any]]:
    chunks = retrieve_context(
        manual_id=str(manual.id),
        query=f"{token} {key.description}",
        filters=RetrievalFilters(role="REFERENCE"),
        top_n=8,
    )
    prompt_version, prompt = get_prompt("draft_variables", "v1")
    response = chat_json(
        model=settings.OPENAI_CHAT_MODEL,
        system_prompt=prompt,
        user_prompt=(
            f"token={token}\n"
            f"description={key.description}\n"
            f"customer_profile={customer_profile}\n"
            f"context={chunks}"
        ),
        temperature=0,
        retries=1,
    )
    values = response.payload.get("values", {})
    item = values.get(token, {}) if isinstance(values, dict) else {}
    value = str(item.get("value", "")).strip()
    confidence = float(item.get("confidence", 0.0))
    provenance = {
        "model": response.model,
        "prompt_version": prompt_version,
        "used_chunk_ids": [chunk["chunk_id"] for chunk in chunks],
        "temperature": 0,
        "timestamp": timezone.now().isoformat(),
    }
    return value, confidence, provenance


def resolve_required_variables(
    *,
    manual: RagManual,
    required_tokens: list[str],
    customer_profile: dict[str, Any],
    human_overrides: dict[str, str] | None,
    run: RagRun,
) -> tuple[dict[str, str], dict[str, str]]:
    values: dict[str, str] = {}
    source_by_token: dict[str, str] = {}
    human_overrides = human_overrides or {}

    keys = {
        item.token: item
        for item in RagVariableKey.objects.filter(
            package_code=manual.package_code,
            package_version=manual.package_version,
            token__in=required_tokens,
        )
    }
    existing = {
        item.token: item
        for item in RagVariableValue.objects.filter(
            manual=manual,
            token__in=required_tokens,
        )
    }

    for token in required_tokens:
        existing_value = existing.get(token)

        if existing_value and existing_value.source == RagVariableValue.Source.CUSTOMER_INPUT:
            values[token] = existing_value.value
            source_by_token[token] = existing_value.source
            continue

        profile_value = _profile_value(customer_profile, token)
        if profile_value:
            _upsert_variable_value(
                manual=manual,
                token=token,
                value=profile_value,
                source=RagVariableValue.Source.CUSTOMER_INPUT,
                confidence=1.0,
                provenance={"source": "request.customer_profile"},
            )
            values[token] = profile_value
            source_by_token[token] = RagVariableValue.Source.CUSTOMER_INPUT
            continue

        if existing_value and existing_value.source == RagVariableValue.Source.HUMAN_OVERRIDE:
            values[token] = existing_value.value
            source_by_token[token] = existing_value.source
            continue

        override_value = human_overrides.get(token)
        if isinstance(override_value, str) and override_value.strip():
            text = override_value.strip()
            _upsert_variable_value(
                manual=manual,
                token=token,
                value=text,
                source=RagVariableValue.Source.HUMAN_OVERRIDE,
                confidence=1.0,
                provenance={"source": "request.overrides"},
            )
            values[token] = text
            source_by_token[token] = RagVariableValue.Source.HUMAN_OVERRIDE
            continue

        key = keys.get(token)
        if key and key.default_value and key.default_value.strip():
            _upsert_variable_value(
                manual=manual,
                token=token,
                value=key.default_value,
                source=RagVariableValue.Source.DEFAULT,
                confidence=1.0,
                provenance={"source": "variable_key.default_value"},
            )
            values[token] = key.default_value
            source_by_token[token] = RagVariableValue.Source.DEFAULT
            continue

        if not key:
            emit_event(
                run,
                level="WARN",
                message="Unknown variable key",
                payload={"token": token},
            )
            continue

        try:
            if key.generation_policy == RagVariableKey.GenerationPolicy.AI_INFER:
                value, confidence, provenance = _infer_with_ai(
                    manual,
                    token,
                    key,
                    customer_profile,
                )
                source = RagVariableValue.Source.AI_INFERRED
            elif key.generation_policy == RagVariableKey.GenerationPolicy.AI_DRAFT:
                value, confidence, provenance = _draft_with_ai(
                    manual,
                    token,
                    key,
                    customer_profile,
                )
                source = RagVariableValue.Source.AI_DRAFTED
            else:
                value, confidence, provenance = "", None, {}
                source = RagVariableValue.Source.DEFAULT

            if value:
                _upsert_variable_value(
                    manual=manual,
                    token=token,
                    value=value,
                    source=source,
                    confidence=confidence,
                    provenance=provenance,
                )
                values[token] = value
                source_by_token[token] = source
            else:
                emit_event(
                    run,
                    level="WARN",
                    message="Variable unresolved after AI step",
                    payload={"token": token, "policy": key.generation_policy},
                )
        except Exception as exc:  # noqa: BLE001
            emit_event(
                run,
                level="ERROR",
                message="Variable resolution failed",
                payload={"token": token, "error": str(exc)},
            )

    return values, source_by_token
