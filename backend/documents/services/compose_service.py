from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any

from django.conf import settings

from documents.models import (
    Handbook,
    HandbookFile,
    Placeholder,
    PlaceholderGenerationAudit,
    ReferenceChunk,
    ReferenceDocument,
    ReferenceDocumentLink,
)

from .ai_client import AiClient, AiClientError
from .compose_capabilities import REFERENCE_SCOPES, SUPPORTED_LANGUAGES, get_capability_registry, get_output_styles
from .compose_prompts import build_compose_prompt, build_quick_fill_prompt
from .reference_service import get_handbook_file_text_context
from .variable_fill_service import VariableFillError, fill_variable_value


OUTPUT_CLASS_BY_STYLE = {
    "concise": "short",
    "slide_ready": "short",
    "table_cell_short": "short",
    "formal": "medium",
    "process_oriented": "medium",
    "audit_ready": "long",
    "procedure_style": "long",
    "long_form_explanation": "long",
}

LONG_HINTS = {
    "beschreibung",
    "description",
    "prozess",
    "process",
    "workflow",
    "scope",
    "ziel",
    "objective",
    "procedure",
    "verantwort",
    "instruction",
    "anweisung",
    "policy",
    "audit",
    "compliance",
}
SHORT_HINTS = {"title", "name", "owner", "rolle", "status", "cell", "bullet", "slide"}


def _canonicalize_placeholder_key(raw: str) -> str:
    token = (raw or "").strip()
    if token.startswith("{{") and token.endswith("}}"):
        token = token[2:-2].strip()
    token = token.split("|", 1)[0].strip()
    return re.sub(r"\s+", "", token).lower()


@dataclass(frozen=True)
class ComposeDraftResult:
    value: str
    mode: str
    output_class: str
    model: str
    usage: dict[str, int]
    audit: PlaceholderGenerationAudit
    trace: dict[str, object]


class ComposeValidationError(ValueError):
    def __init__(self, message: str, error_code: str = "COMPOSE_INVALID", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.status_code = status_code


def get_compose_config() -> dict[str, object]:
    return {
        "supported_languages": list(SUPPORTED_LANGUAGES),
        "reference_scopes": list(REFERENCE_SCOPES),
        "output_styles": get_output_styles(),
        "capabilities": get_capability_registry(),
        "limits": {
            "max_reference_documents": int(getattr(settings, "COMPOSE_MAX_REFERENCE_DOCUMENTS", 6)),
            "max_reference_chunks": int(getattr(settings, "COMPOSE_MAX_REFERENCE_CHUNKS", 6)),
            "max_reference_tokens": int(getattr(settings, "COMPOSE_MAX_REFERENCE_TOKENS", 1800)),
        },
    }


def supported_capabilities_for_placeholder(*, placeholder: Placeholder, handbook_file: HandbookFile) -> list[str]:
    if placeholder.kind != Placeholder.Kind.TEXT:
        return []
    capabilities = ["quick_fill", "compose_from_company_context", "rewrite_existing_value", "generate_audit_ready_text"]
    if handbook_file.file_type in {HandbookFile.FileType.DOCX, HandbookFile.FileType.PPTX, HandbookFile.FileType.XLSX}:
        capabilities.append("extract_workflow_language")
    capabilities.extend(["compose_from_references", "summarize_reference"])
    return capabilities


def suggested_mode_for_placeholder(*, placeholder: Placeholder, handbook_file: HandbookFile) -> str:
    if placeholder.kind != Placeholder.Kind.TEXT:
        return "manual"
    if suggested_output_class_for_placeholder(placeholder=placeholder, handbook_file=handbook_file) == "long":
        return "compose"
    return "quick_fill"


def suggested_output_class_for_placeholder(*, placeholder: Placeholder, handbook_file: HandbookFile) -> str:
    key = _canonicalize_placeholder_key(placeholder.key)
    if handbook_file.file_type == HandbookFile.FileType.PPTX:
        return "short"
    pieces = set(re.split(r"[._-]+", key.lower()))
    if pieces & LONG_HINTS:
        return "long"
    if pieces & SHORT_HINTS:
        return "short"
    if placeholder.occurrences > 1:
        return "medium"
    return "medium"


def serialize_audit_summary(audit: PlaceholderGenerationAudit | None) -> dict[str, object] | None:
    if audit is None:
        return None
    return {
        "id": str(audit.id),
        "mode": audit.mode,
        "output_style": audit.output_style,
        "language": audit.language,
        "model": audit.model,
        "total_tokens": audit.total_tokens,
        "success": audit.success,
        "created_at": audit.created_at.isoformat(),
    }


def quick_fill_placeholder_value(
    *,
    handbook: Handbook,
    handbook_file: HandbookFile,
    placeholder: Placeholder,
    current_value: str | None,
    instruction: str,
    language: str,
    user_context: dict[str, object] | None,
    constraints: dict[str, object] | None,
) -> ComposeDraftResult:
    validated_language = _validate_language(language)
    validated_constraints = _normalize_constraints(constraints)
    placeholder_context = build_placeholder_context(
        handbook=handbook,
        handbook_file=handbook_file,
        placeholder=placeholder,
        current_value=current_value,
        user_context=user_context,
    )

    try:
        result = fill_variable_value(
            handbook_id=str(handbook.id),
            variable_name=_canonicalize_placeholder_key(placeholder.key),
            current_value=current_value,
            instruction=instruction,
            language=validated_language,
            client_context=placeholder_context,
            constraints=validated_constraints,
            variable_description=None,
        )
    except VariableFillError:
        raise

    trace = {
        "generation_mode": "quick_fill",
        "file_context_used": None,
        "selected_references": [],
        "chunk_count": 0,
        "fallback_path": "quick_fill_no_references",
    }
    audit = _create_generation_audit(
        handbook=handbook,
        handbook_file=handbook_file,
        placeholder=placeholder,
        mode=PlaceholderGenerationAudit.Mode.QUICK_FILL,
        instruction=instruction,
        output_style="concise",
        language=validated_language,
        model=str(result.get("model", "")),
        usage=result.get("usage") if isinstance(result.get("usage"), dict) else {},
        references_used=[],
        file_context_used={},
        fallback_path="quick_fill_no_references",
        trace=trace,
        success=True,
        error_message="",
    )
    return ComposeDraftResult(
        value=str(result["value"]),
        mode="quick_fill",
        output_class="short",
        model=str(result.get("model", "")),
        usage=result.get("usage") if isinstance(result.get("usage"), dict) else {},
        audit=audit,
        trace=trace,
    )


def compose_placeholder_value(
    *,
    handbook: Handbook,
    handbook_file: HandbookFile,
    placeholder: Placeholder,
    current_value: str | None,
    instruction: str,
    language: str,
    output_style: str,
    reference_scope: str,
    reference_document_ids: list[str] | None,
    use_file_context: bool,
    constraints: dict[str, object] | None,
    mode_hint: str | None = None,
) -> ComposeDraftResult:
    if placeholder.kind != Placeholder.Kind.TEXT:
        raise ComposeValidationError("Compose is only supported for text placeholders", "INVALID_PLACEHOLDER_KIND")

    validated_language = _validate_language(language)
    validated_output_style = _validate_output_style(output_style)
    validated_scope = _validate_scope(reference_scope)
    validated_constraints = _normalize_constraints(constraints)
    selected_reference_ids = [item for item in (reference_document_ids or []) if item]

    placeholder_context = build_placeholder_context(
        handbook=handbook,
        handbook_file=handbook_file,
        placeholder=placeholder,
        current_value=current_value,
        user_context=None,
    )
    output_class = _resolve_output_class(
        output_style=validated_output_style,
        placeholder=placeholder,
        handbook_file=handbook_file,
        constraints=validated_constraints,
    )

    file_context = None
    fallback_path = "compose_default"
    if use_file_context:
        file_context = extract_handbook_file_context(
            handbook_file=handbook_file,
            placeholder=placeholder,
            output_class=output_class,
            instruction=instruction,
        )
        if file_context and file_context.get("strategy") != "not_available":
            fallback_path = str(file_context.get("strategy") or fallback_path)

    selected_references, selection_trace = select_reference_context(
        handbook=handbook,
        handbook_file=handbook_file,
        placeholder=placeholder,
        reference_scope=validated_scope,
        reference_document_ids=selected_reference_ids,
        instruction=instruction,
        output_class=output_class,
    )
    if selection_trace.get("fallback_path"):
        fallback_path = str(selection_trace["fallback_path"])

    system_prompt, user_prompt = build_compose_prompt(
        placeholder_context=placeholder_context,
        file_context=file_context,
        references=selected_references,
        instruction=instruction,
        language=validated_language,
        output_style=validated_output_style,
        output_class=output_class,
        constraints=validated_constraints,
    )

    try:
        response = AiClient().compose_placeholder_value(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
    except AiClientError as exc:
        audit = _create_generation_audit(
            handbook=handbook,
            handbook_file=handbook_file,
            placeholder=placeholder,
            mode=PlaceholderGenerationAudit.Mode.COMPOSE,
            instruction=instruction,
            output_style=validated_output_style,
            language=validated_language,
            model="",
            usage={},
            references_used=_serialize_references_used(selected_references),
            file_context_used=file_context or {},
            fallback_path=fallback_path,
            trace={
                "generation_mode": "compose",
                "selected_references": _serialize_references_used(selected_references),
                "chunk_count": len(selected_references),
                "file_context_used": file_context or {},
                "fallback_path": fallback_path,
                "selection_trace": selection_trace,
            },
            success=False,
            error_message=str(exc),
        )
        raise ComposeValidationError("AI provider error", "AI_PROVIDER_ERROR", 502) from exc

    value = (response.value or "").strip()
    if validated_constraints["required"] and not value:
        raise ComposeValidationError("Generated value is empty", "REQUIRED_EMPTY_VALUE")
    max_length = validated_constraints["max_length"]
    if isinstance(max_length, int) and max_length > 0 and len(value) > max_length:
        raise ComposeValidationError("Generated value exceeds max_length", "MAX_LENGTH_EXCEEDED")

    trace = {
        "generation_mode": "compose",
        "selected_references": _serialize_references_used(selected_references),
        "chunk_count": len(selected_references),
        "file_context_used": file_context or {},
        "fallback_path": fallback_path,
        "selection_trace": selection_trace,
        "mode_hint": mode_hint,
    }
    audit = _create_generation_audit(
        handbook=handbook,
        handbook_file=handbook_file,
        placeholder=placeholder,
        mode=PlaceholderGenerationAudit.Mode.COMPOSE,
        instruction=instruction,
        output_style=validated_output_style,
        language=validated_language,
        model=response.model,
        usage=response.usage,
        references_used=_serialize_references_used(selected_references),
        file_context_used=file_context or {},
        fallback_path=fallback_path,
        trace=trace,
        success=True,
        error_message="",
    )
    return ComposeDraftResult(
        value=value,
        mode="compose",
        output_class=output_class,
        model=response.model,
        usage=response.usage,
        audit=audit,
        trace=trace,
    )


def build_placeholder_context(
    *,
    handbook: Handbook,
    handbook_file: HandbookFile,
    placeholder: Placeholder,
    current_value: str | None,
    user_context: dict[str, object] | None,
) -> dict[str, object]:
    customer = handbook.customer
    base_context = {
        "company": {
            "name": customer.name,
            "address": customer.address,
            "zip_city": customer.zip_city,
            "ceo": customer.ceo,
            "qm_manager": customer.qm_manager,
            "employee_count": customer.employee_count,
            "products": customer.products,
            "services": customer.services,
            "industry": customer.industry,
        },
        "handbook": {
            "id": str(handbook.id),
            "type": handbook.type,
            "status": handbook.status,
        },
        "file": {
            "id": str(handbook_file.id),
            "path": handbook_file.path_in_handbook,
            "file_type": handbook_file.file_type,
            "parse_status": handbook_file.parse_status,
        },
        "placeholder": {
            "id": str(placeholder.id),
            "key": _canonicalize_placeholder_key(placeholder.key),
            "kind": placeholder.kind,
            "required": placeholder.required,
            "occurrences": placeholder.occurrences,
            "meta": placeholder.meta,
            "current_value": current_value or "",
        },
    }
    if user_context:
        base_context["user_context"] = user_context
    return base_context


def extract_handbook_file_context(
    *,
    handbook_file: HandbookFile,
    placeholder: Placeholder,
    output_class: str,
    instruction: str,
) -> dict[str, object] | None:
    normalized = get_handbook_file_text_context(handbook_file)
    if normalized is None:
        return {"strategy": "not_available", "summary": "", "sections": []}

    terms = _build_search_terms(
        placeholder_key=placeholder.key,
        handbook_file=handbook_file,
        instruction=instruction,
    )
    scored = []
    for section in normalized.sections:
        score = _score_text_block(title=section.title, content=section.content, terms=terms)
        scored.append((score, section))
    scored.sort(key=lambda item: item[0], reverse=True)
    max_sections = 1 if output_class == "short" else 2
    selected_sections = []
    for score, section in scored[: max_sections + 2]:
        if score <= 0 and selected_sections:
            continue
        selected_sections.append(
            {
                "id": section.id,
                "title": section.title,
                "locator": section.locator,
                "content": section.content[:900],
                "score": score,
            }
        )
        if len(selected_sections) >= max_sections:
            break
    strategy = "scored_sections" if selected_sections else "summary_only"
    return {
        "strategy": strategy,
        "summary": normalized.document_summary,
        "sections": selected_sections,
    }


def select_reference_context(
    *,
    handbook: Handbook,
    handbook_file: HandbookFile,
    placeholder: Placeholder,
    reference_scope: str,
    reference_document_ids: list[str],
    instruction: str,
    output_class: str,
) -> tuple[list[dict[str, object]], dict[str, object]]:
    docs = list(_resolve_effective_reference_documents(
        handbook=handbook,
        handbook_file=handbook_file,
        placeholder=placeholder,
        reference_scope=reference_scope,
        selected_ids=reference_document_ids,
    ))
    max_docs = int(getattr(settings, "COMPOSE_MAX_REFERENCE_DOCUMENTS", 6))
    docs = docs[:max_docs]
    terms = _build_search_terms(
        placeholder_key=placeholder.key,
        handbook_file=handbook_file,
        instruction=instruction,
    )
    max_chunks = int(getattr(settings, "COMPOSE_MAX_REFERENCE_CHUNKS", 6))
    max_tokens = int(getattr(settings, "COMPOSE_MAX_REFERENCE_TOKENS", 1800))

    candidates: list[tuple[float, ReferenceChunk]] = []
    for document in docs:
        for chunk in document.chunks.all():
            score = _score_text_block(title=chunk.title, content=chunk.content, terms=terms)
            candidates.append((score, chunk))
    candidates.sort(key=lambda item: (item[0], -item[1].estimated_tokens), reverse=True)

    selected: list[dict[str, object]] = []
    total_tokens = 0
    per_doc_counts: dict[str, int] = {}
    for score, chunk in candidates:
        doc_id = str(chunk.reference_document_id)
        if per_doc_counts.get(doc_id, 0) >= 2 and len(per_doc_counts) < len(docs):
            continue
        next_tokens = total_tokens + max(1, int(chunk.estimated_tokens or 0))
        if selected and next_tokens > max_tokens:
            continue
        selected.append(
            {
                "reference_document_id": doc_id,
                "reference_document_title": chunk.reference_document.original_filename,
                "chunk_id": str(chunk.id),
                "title": chunk.title or chunk.reference_document.original_filename,
                "locator": chunk.locator,
                "content": chunk.content,
                "estimated_tokens": chunk.estimated_tokens,
                "score": score,
            }
        )
        per_doc_counts[doc_id] = per_doc_counts.get(doc_id, 0) + 1
        total_tokens = next_tokens
        if len(selected) >= max_chunks:
            break

    fallback_path = "ranked_chunks"
    if not selected and docs:
        fallback_path = "reference_summary_fallback"
        for document in docs[:2]:
            preview_chunk = document.chunks.all()[:1]
            if preview_chunk:
                chunk = preview_chunk[0]
                selected.append(
                    {
                        "reference_document_id": str(document.id),
                        "reference_document_title": document.original_filename,
                        "chunk_id": str(chunk.id),
                        "title": chunk.title or document.original_filename,
                        "locator": chunk.locator,
                        "content": chunk.content,
                        "estimated_tokens": chunk.estimated_tokens,
                        "score": 0,
                    }
                )
            elif document.summary:
                selected.append(
                    {
                        "reference_document_id": str(document.id),
                        "reference_document_title": document.original_filename,
                        "chunk_id": None,
                        "title": document.original_filename,
                        "locator": {"summary": True},
                        "content": document.summary,
                        "estimated_tokens": max(1, len(document.summary) // 4),
                        "score": 0,
                    }
                )

    trace = {
        "reference_scope": reference_scope,
        "selected_document_ids": [str(document.id) for document in docs],
        "terms": terms,
        "fallback_path": fallback_path,
        "chunk_count": len(selected),
        "estimated_reference_tokens": sum(int(item.get("estimated_tokens", 0) or 0) for item in selected),
    }
    return selected, trace


def _resolve_effective_reference_documents(
    *,
    handbook: Handbook,
    handbook_file: HandbookFile,
    placeholder: Placeholder,
    reference_scope: str,
    selected_ids: list[str],
):
    query = ReferenceDocument.objects.filter(
        handbook=handbook,
        parse_status=ReferenceDocument.ParseStatus.PARSED,
    ).prefetch_related("chunks", "links")
    if selected_ids:
        query = query.filter(id__in=selected_ids)

    handbook_q = {ReferenceDocumentLink.Scope.HANDBOOK}
    file_q = handbook_q | {ReferenceDocumentLink.Scope.FILE}
    placeholder_q = file_q | {ReferenceDocumentLink.Scope.PLACEHOLDER}
    allowed_scopes = handbook_q
    if reference_scope == ReferenceDocumentLink.Scope.FILE:
        allowed_scopes = file_q
    elif reference_scope == ReferenceDocumentLink.Scope.PLACEHOLDER:
        allowed_scopes = placeholder_q

    docs = []
    for document in query:
        allowed = False
        for link in document.links.all():
            if link.scope not in allowed_scopes:
                continue
            if link.scope == ReferenceDocumentLink.Scope.HANDBOOK:
                allowed = True
                break
            if link.scope == ReferenceDocumentLink.Scope.FILE and link.handbook_file_id == handbook_file.id:
                allowed = True
                break
            if link.scope == ReferenceDocumentLink.Scope.PLACEHOLDER and link.placeholder_id == placeholder.id:
                allowed = True
                break
        if allowed:
            docs.append(document)
    return docs


def _build_search_terms(*, placeholder_key: str, handbook_file: HandbookFile, instruction: str) -> list[str]:
    raw_terms = re.split(r"[^a-zA-Z0-9äöüÄÖÜß]+", f"{placeholder_key} {handbook_file.path_in_handbook} {instruction}")
    terms = []
    for item in raw_terms:
        cleaned = item.strip().lower()
        if len(cleaned) < 3:
            continue
        if cleaned not in terms:
            terms.append(cleaned)
    return terms[:18]


def _score_text_block(*, title: str, content: str, terms: list[str]) -> float:
    haystack = f"{title} {content}".lower()
    title_lower = title.lower()
    score = 0.0
    for term in terms:
        if term in title_lower:
            score += 3.0
        if term in haystack:
            score += 1.0 + haystack.count(term) * 0.2
    if score == 0 and terms:
        key_terms = [term for term in terms if len(term) >= 6]
        for term in key_terms:
            if term[:5] in haystack:
                score += 0.2
    return score


def _resolve_output_class(*, output_style: str, placeholder: Placeholder, handbook_file: HandbookFile, constraints: dict[str, object]) -> str:
    if output_style in OUTPUT_CLASS_BY_STYLE:
        return OUTPUT_CLASS_BY_STYLE[output_style]
    max_length = constraints.get("max_length")
    if isinstance(max_length, int):
        if max_length <= 120:
            return "short"
        if max_length >= 500:
            return "long"
    return suggested_output_class_for_placeholder(placeholder=placeholder, handbook_file=handbook_file)


def _validate_language(language: str) -> str:
    normalized = (language or "").strip()
    if normalized not in SUPPORTED_LANGUAGES:
        raise ComposeValidationError("language must be one of: de-DE, en-US", "INVALID_LANGUAGE")
    return normalized


def _validate_output_style(output_style: str) -> str:
    normalized = (output_style or "").strip() or "formal"
    allowed = {item["id"] for item in get_output_styles()}
    if normalized not in allowed:
        raise ComposeValidationError("Unsupported output_style", "INVALID_OUTPUT_STYLE")
    return normalized


def _validate_scope(scope: str) -> str:
    normalized = (scope or "handbook").strip().lower()
    if normalized not in REFERENCE_SCOPES:
        raise ComposeValidationError("Unsupported reference_scope", "INVALID_REFERENCE_SCOPE")
    return normalized


def _normalize_constraints(constraints: dict[str, object] | None) -> dict[str, object]:
    payload = constraints or {}
    if not isinstance(payload, dict):
        raise ComposeValidationError("constraints must be an object", "INVALID_CONSTRAINTS")
    max_length = payload.get("max_length")
    normalized_max_length = None
    if isinstance(max_length, int):
        normalized_max_length = max_length
    elif isinstance(max_length, str) and max_length.strip().isdigit():
        normalized_max_length = int(max_length.strip())
    if normalized_max_length is not None and normalized_max_length <= 0:
        raise ComposeValidationError("constraints.max_length must be positive", "INVALID_MAX_LENGTH")
    return {
        "required": bool(payload.get("required", False)),
        "max_length": normalized_max_length,
    }


def _create_generation_audit(
    *,
    handbook: Handbook,
    handbook_file: HandbookFile,
    placeholder: Placeholder,
    mode: str,
    instruction: str,
    output_style: str,
    language: str,
    model: str,
    usage: dict[str, Any],
    references_used: list[dict[str, object]],
    file_context_used: dict[str, object],
    fallback_path: str,
    trace: dict[str, object],
    success: bool,
    error_message: str,
) -> PlaceholderGenerationAudit:
    return PlaceholderGenerationAudit.objects.create(
        handbook=handbook,
        handbook_file=handbook_file,
        placeholder=placeholder,
        mode=mode,
        instruction=(instruction or "").strip(),
        output_style=output_style,
        language=language,
        model=model,
        prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
        completion_tokens=int(usage.get("completion_tokens", 0) or 0),
        total_tokens=int(usage.get("total_tokens", 0) or 0),
        references_used=references_used,
        file_context_used=file_context_used,
        fallback_path=fallback_path,
        trace=trace,
        success=success,
        error_message=error_message,
    )


def _serialize_references_used(references: list[dict[str, object]]) -> list[dict[str, object]]:
    serialized: list[dict[str, object]] = []
    for item in references:
        serialized.append(
            {
                "reference_document_id": item.get("reference_document_id"),
                "reference_document_title": item.get("reference_document_title"),
                "chunk_id": item.get("chunk_id"),
                "title": item.get("title"),
                "locator": item.get("locator"),
                "estimated_tokens": item.get("estimated_tokens"),
            }
        )
    return serialized
