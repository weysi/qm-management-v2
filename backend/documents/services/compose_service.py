from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import logging
import re
from typing import Any

from django.conf import settings

from documents.models import (
    Handbook,
    HandbookFile,
    Placeholder,
    PlaceholderGenerationAudit,
    ReferenceDocument,
    ReferenceDocumentLink,
)

from .ai_client import AiClient, AiClientError
from .compose_capabilities import REFERENCE_SCOPES, SUPPORTED_LANGUAGES, get_capability_registry, get_output_styles
from .compose_prompts import build_compose_prompt
from .placeholder_normalization import canonicalize_placeholder_key
from .reference_service import (
    ReferenceServiceError,
    get_handbook_file_text_context,
    load_normalized_reference_document,
)
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
TARGET_INTENT_PATTERNS: dict[str, tuple[str, ...]] = {
    "instruction": ("anweisung", "instruction", "durchführung", "umsetzung", "arbeitsanweisung"),
    "workflow_description": ("workflow", "prozess", "ablauf", "verfahrensablauf", "prozessbeschreibung"),
    "policy_text": ("politik", "policy", "grundsatz", "leitlinie"),
    "process_explanation": ("beschreibung", "erklärung", "scope", "ziel", "zweck"),
    "risk_opportunity": ("risiko", "risiken", "chance", "chancen", "bewertung"),
    "record_control": ("aufzeichnung", "lenkung", "dokument", "aufbewahrung", "nachweis", "revision"),
}
INTENT_STYLE_GUIDANCE = {
    "instruction": "Use directive, operational wording with clear responsibilities and execution steps.",
    "workflow_description": "Describe the sequence of activities, interfaces, and outcomes in a process-oriented style.",
    "policy_text": "Write in a normative, high-level policy tone suitable for compliance documentation.",
    "process_explanation": "Write structured explanatory prose that clarifies purpose, scope, and practical implementation.",
    "risk_opportunity": "Use preventive, risk-aware language and include evaluation or mitigation framing where appropriate.",
    "record_control": "Use documentation control terminology covering creation, review, storage, retention, and traceability.",
}
STOPWORDS = {
    "and",
    "der",
    "die",
    "das",
    "dem",
    "den",
    "des",
    "ein",
    "eine",
    "einer",
    "einem",
    "for",
    "from",
    "ist",
    "mit",
    "oder",
    "the",
    "und",
    "von",
    "with",
}

logger = logging.getLogger(__name__)


def _canonicalize_placeholder_key(raw: str) -> str:
    return canonicalize_placeholder_key(raw)


@dataclass(frozen=True)
class ComposeDraftResult:
    value: str
    mode: str
    output_class: str
    model: str
    usage: dict[str, int]
    audit: PlaceholderGenerationAudit
    trace: dict[str, object]


@dataclass(frozen=True)
class TenantContext:
    company_name: str
    industry: str
    products: str
    services: str
    employee_count: int
    leadership: dict[str, str]
    handbook_type: str
    summary: str
    adaptation_hints: list[str]


@dataclass(frozen=True)
class TargetContext:
    placeholder_key: str
    placeholder_label: str
    file_id: str
    file_path: str
    file_type: str
    document_type: str
    output_style: str
    output_class: str
    target_intent: str
    intent_guidance: str
    current_value: str


@dataclass(frozen=True)
class GenerationContract:
    language: str
    output_style: str
    output_class: str
    required: bool
    max_length: int | None


@dataclass(frozen=True)
class GenerationContext:
    tenant_context: TenantContext
    target_context: TargetContext
    generation_contract: GenerationContract


@dataclass(frozen=True)
class ReferenceSummaryContext:
    reference_document_id: str
    reference_document_title: str
    summary: str
    dominant_themes: list[str]
    domain_terms: list[str]
    document_patterns: list[str]
    score: float


@dataclass(frozen=True)
class ReferenceSnippetContext:
    reference_document_id: str
    reference_document_title: str
    chunk_id: str | None
    title: str
    locator: dict[str, object]
    content: str
    estimated_tokens: int
    score: float
    use_reason: str


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
    generation_context = _build_generation_context(
        handbook=handbook,
        handbook_file=handbook_file,
        placeholder=placeholder,
        current_value=current_value,
        validated_language=validated_language,
        validated_output_style=validated_output_style,
        output_class=output_class,
        validated_constraints=validated_constraints,
        instruction=instruction,
        mode_hint=mode_hint,
    )

    file_context = None
    fallback_path = "compose_default"
    if use_file_context:
        file_context = extract_handbook_file_context(
            handbook_file=handbook_file,
            placeholder=placeholder,
            output_class=output_class,
            instruction=instruction,
            target_intent=generation_context.target_context.target_intent,
            tenant_context=generation_context.tenant_context,
        )
        if file_context and file_context.get("strategy") != "not_available":
            fallback_path = str(file_context.get("strategy") or fallback_path)

    reference_summaries, selected_references, selection_trace = select_reference_context(
        handbook=handbook,
        handbook_file=handbook_file,
        placeholder=placeholder,
        reference_scope=validated_scope,
        reference_document_ids=selected_reference_ids,
        instruction=instruction,
        generation_context=generation_context,
    )
    if selection_trace.get("fallback_path"):
        fallback_path = str(selection_trace["fallback_path"])

    system_prompt, user_prompt = build_compose_prompt(
        tenant_context=asdict(generation_context.tenant_context),
        target_context=asdict(generation_context.target_context),
        generation_contract=asdict(generation_context.generation_contract),
        placeholder_context=placeholder_context,
        file_context=file_context,
        reference_summaries=[asdict(item) for item in reference_summaries],
        reference_snippets=[asdict(item) for item in selected_references],
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
                "requested_reference_ids": selected_reference_ids,
                "skipped_references": selection_trace.get("skipped_references", []),
                "chunk_count": len(selected_references),
                "target_intent": generation_context.target_context.target_intent,
                "tenant_context_summary": generation_context.tenant_context.summary,
                "token_budget": selection_trace.get("token_budget", {}),
                "file_context_used": file_context or {},
                "fallback_path": fallback_path,
                "selection_trace": selection_trace,
                "mode_hint": mode_hint,
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
        "requested_reference_ids": selected_reference_ids,
        "used_reference_ids": [item.reference_document_id for item in selected_references],
        "skipped_references": selection_trace.get("skipped_references", []),
        "chunk_count": len(selected_references),
        "target_intent": generation_context.target_context.target_intent,
        "tenant_context_summary": generation_context.tenant_context.summary,
        "token_budget": selection_trace.get("token_budget", {}),
        "file_context_used": file_context or {},
        "fallback_path": fallback_path,
        "selection_trace": selection_trace,
        "mode_hint": mode_hint,
    }
    logger.info(
        "COMPOSE_PLACEHOLDER handbook=%s file=%s placeholder=%s intent=%s requested_refs=%s used_refs=%s skipped_refs=%s tokens=%s",
        handbook.id,
        handbook_file.id,
        placeholder.id,
        generation_context.target_context.target_intent,
        selected_reference_ids,
        [item.reference_document_id for item in selected_references],
        selection_trace.get("skipped_references", []),
        selection_trace.get("token_budget", {}),
    )
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


def _humanize_placeholder_label(raw: str) -> str:
    normalized = _canonicalize_placeholder_key(raw) or raw
    return (
        normalized.replace("assets.", "")
        .replace(".", " ")
        .replace("_", " ")
        .replace("-", " ")
        .strip()
        .title()
    )


def _tokenize_terms(text: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9_-]{2,}", text.lower())
        if token not in STOPWORDS
    ]


def _infer_document_type(handbook_file: HandbookFile) -> str:
    path = handbook_file.path_in_handbook.lower()
    if handbook_file.file_type == HandbookFile.FileType.PPTX:
        return "presentation"
    if handbook_file.file_type == HandbookFile.FileType.XLSX:
        return "spreadsheet"
    if "prozess" in path or "process" in path:
        return "process_document"
    if "anweisung" in path or "instruction" in path:
        return "instruction_document"
    if "risik" in path:
        return "risk_document"
    return "document"


def _infer_target_intent(
    *,
    placeholder: Placeholder,
    handbook_file: HandbookFile,
    instruction: str,
    output_style: str,
    mode_hint: str | None,
) -> str:
    haystack = " ".join(
        [
            _canonicalize_placeholder_key(placeholder.key),
            handbook_file.path_in_handbook,
            instruction,
            output_style,
            mode_hint or "",
        ]
    ).lower()
    scores: dict[str, float] = {}
    for intent, patterns in TARGET_INTENT_PATTERNS.items():
        score = 0.0
        for pattern in patterns:
            occurrences = haystack.count(pattern)
            if occurrences:
                score += 1.0 + occurrences * 0.3
        if score > 0:
            scores[intent] = score

    if output_style in {"procedure_style", "process_oriented"}:
        scores["workflow_description"] = scores.get("workflow_description", 0.0) + 2.0
    if output_style == "audit_ready":
        scores["policy_text"] = scores.get("policy_text", 0.0) + 1.0
        scores["record_control"] = scores.get("record_control", 0.0) + 1.0
    if mode_hint == "compose" and suggested_output_class_for_placeholder(
        placeholder=placeholder,
        handbook_file=handbook_file,
    ) == "long":
        scores["process_explanation"] = scores.get("process_explanation", 0.0) + 0.5

    if not scores:
        return "process_explanation"
    return max(scores.items(), key=lambda item: item[1])[0]


def _build_tenant_context(*, handbook: Handbook) -> TenantContext:
    customer = handbook.customer
    adaptation_hints = [
        f"Adapt the text to the {customer.industry or 'customer'} operational context.",
    ]
    if customer.products:
        adaptation_hints.append("Reflect the documented products and product-related processes.")
    if customer.services:
        adaptation_hints.append("Reflect the documented service scope and delivery activities.")
    if customer.employee_count:
        adaptation_hints.append(
            f"Assume an organisation size of about {customer.employee_count} employees when assigning responsibilities."
        )

    summary_parts = [customer.name]
    if customer.industry:
        summary_parts.append(f"industry: {customer.industry}")
    if customer.products:
        summary_parts.append(f"products: {customer.products}")
    if customer.services:
        summary_parts.append(f"services: {customer.services}")

    return TenantContext(
        company_name=customer.name,
        industry=customer.industry,
        products=customer.products,
        services=customer.services,
        employee_count=customer.employee_count,
        leadership={
            "ceo": customer.ceo,
            "qm_manager": customer.qm_manager,
        },
        handbook_type=handbook.type,
        summary="; ".join(part for part in summary_parts if part).strip(),
        adaptation_hints=adaptation_hints,
    )


def _build_generation_context(
    *,
    handbook: Handbook,
    handbook_file: HandbookFile,
    placeholder: Placeholder,
    current_value: str | None,
    validated_language: str,
    validated_output_style: str,
    output_class: str,
    validated_constraints: dict[str, object],
    instruction: str,
    mode_hint: str | None,
) -> GenerationContext:
    target_intent = _infer_target_intent(
        placeholder=placeholder,
        handbook_file=handbook_file,
        instruction=instruction,
        output_style=validated_output_style,
        mode_hint=mode_hint,
    )
    tenant_context = _build_tenant_context(handbook=handbook)
    target_context = TargetContext(
        placeholder_key=_canonicalize_placeholder_key(placeholder.key),
        placeholder_label=_humanize_placeholder_label(placeholder.key),
        file_id=str(handbook_file.id),
        file_path=handbook_file.path_in_handbook,
        file_type=handbook_file.file_type,
        document_type=_infer_document_type(handbook_file),
        output_style=validated_output_style,
        output_class=output_class,
        target_intent=target_intent,
        intent_guidance=INTENT_STYLE_GUIDANCE.get(
            target_intent,
            INTENT_STYLE_GUIDANCE["process_explanation"],
        ),
        current_value=(current_value or "").strip(),
    )
    generation_contract = GenerationContract(
        language=validated_language,
        output_style=validated_output_style,
        output_class=output_class,
        required=bool(validated_constraints["required"]),
        max_length=validated_constraints["max_length"],
    )
    return GenerationContext(
        tenant_context=tenant_context,
        target_context=target_context,
        generation_contract=generation_contract,
    )


def extract_handbook_file_context(
    *,
    handbook_file: HandbookFile,
    placeholder: Placeholder,
    output_class: str,
    instruction: str,
    target_intent: str,
    tenant_context: TenantContext,
) -> dict[str, object] | None:
    normalized = get_handbook_file_text_context(handbook_file)
    if normalized is None:
        return {"strategy": "not_available", "summary": "", "sections": []}

    terms = _build_search_terms(
        placeholder_key=placeholder.key,
        handbook_file=handbook_file,
        instruction=instruction,
        target_intent=target_intent,
        tenant_context=tenant_context,
    )
    scored = []
    for section in normalized.sections:
        score = _score_text_block(
            title=section.title,
            content=section.content,
            terms=terms,
            themes=section.themes,
            target_intent=target_intent,
            section_kind=section.section_kind,
        )
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
                "section_kind": section.section_kind,
                "themes": section.themes,
                "keywords": section.keywords,
            }
        )
        if len(selected_sections) >= max_sections:
            break
    strategy = "scored_sections" if selected_sections else "summary_only"
    return {
        "strategy": strategy,
        "summary": normalized.document_summary,
        "analysis": asdict(normalized.analysis),
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
    generation_context: GenerationContext,
) -> tuple[list[ReferenceSummaryContext], list[ReferenceSnippetContext], dict[str, object]]:
    docs, skipped_references = _resolve_effective_reference_documents(
        handbook=handbook,
        handbook_file=handbook_file,
        placeholder=placeholder,
        reference_scope=reference_scope,
        selected_ids=reference_document_ids,
    )
    if not docs:
        return [], [], {
            "reference_scope": reference_scope,
            "requested_reference_ids": reference_document_ids,
            "selected_document_ids": [],
            "skipped_references": skipped_references,
            "document_scores": [],
            "fallback_path": "tenant_context_only" if not reference_document_ids else "selected_references_skipped",
            "chunk_count": 0,
            "estimated_reference_tokens": 0,
            "token_budget": {
                "max_reference_documents": int(getattr(settings, "COMPOSE_MAX_REFERENCE_DOCUMENTS", 6)),
                "max_reference_chunks": int(getattr(settings, "COMPOSE_MAX_REFERENCE_CHUNKS", 6)),
                "max_reference_tokens": int(getattr(settings, "COMPOSE_MAX_REFERENCE_TOKENS", 1800)),
                "selected_reference_tokens": 0,
            },
        }

    max_docs = int(getattr(settings, "COMPOSE_MAX_REFERENCE_DOCUMENTS", 6))
    docs = docs[:max_docs]
    terms = _build_search_terms(
        placeholder_key=placeholder.key,
        handbook_file=handbook_file,
        instruction=instruction,
        target_intent=generation_context.target_context.target_intent,
        tenant_context=generation_context.tenant_context,
    )
    max_chunks = int(getattr(settings, "COMPOSE_MAX_REFERENCE_CHUNKS", 6))
    max_tokens = int(getattr(settings, "COMPOSE_MAX_REFERENCE_TOKENS", 1800))

    document_scores: list[dict[str, object]] = []
    summary_contexts: list[ReferenceSummaryContext] = []
    candidate_snippets: list[ReferenceSnippetContext] = []
    for document in docs:
        try:
            normalized = load_normalized_reference_document(document)
        except ReferenceServiceError as exc:
            skipped_references.append(
                {
                    "reference_document_id": str(document.id),
                    "reference_document_title": document.original_filename,
                    "reason": "normalized_content_missing",
                    "detail": str(exc),
                }
            )
            continue

        document_score = _score_reference_document(
            document=document,
            normalized=normalized,
            generation_context=generation_context,
            terms=terms,
        )
        document_scores.append(
            {
                "reference_document_id": str(document.id),
                "reference_document_title": document.original_filename,
                "score": round(document_score, 3),
                "dominant_themes": normalized.analysis.dominant_themes,
                "low_signal": normalized.analysis.low_signal,
            }
        )
        summary_contexts.append(
            ReferenceSummaryContext(
                reference_document_id=str(document.id),
                reference_document_title=document.original_filename,
                summary=normalized.analysis.summary or document.summary or normalized.document_summary,
                dominant_themes=normalized.analysis.dominant_themes,
                domain_terms=normalized.analysis.domain_terms,
                document_patterns=normalized.analysis.document_patterns,
                score=round(document_score, 3),
            )
        )

        chunk_id_by_ordinal = {
            item.ordinal: str(item.id)
            for item in document.chunks.all()
        }
        for section in normalized.sections:
            section_score = _score_text_block(
                title=section.title,
                content=section.content,
                terms=terms,
                themes=section.themes,
                target_intent=generation_context.target_context.target_intent,
                section_kind=section.section_kind,
            ) + document_score * 0.15
            if section.themes and generation_context.target_context.target_intent in section.themes:
                section_score += 2.0
            if section.section_kind == "procedure" and generation_context.target_context.target_intent in {
                "instruction",
                "workflow_description",
            }:
                section_score += 1.5
            ordinal = _ordinal_from_section_id(section.id)
            candidate_snippets.append(
                ReferenceSnippetContext(
                    reference_document_id=str(document.id),
                    reference_document_title=document.original_filename,
                    chunk_id=chunk_id_by_ordinal.get(ordinal),
                    title=section.title or document.original_filename,
                    locator=section.locator,
                    content=section.content,
                    estimated_tokens=max(1, int(section.estimated_tokens or 0)),
                    score=round(section_score, 3),
                    use_reason=_build_use_reason(
                        target_intent=generation_context.target_context.target_intent,
                        themes=section.themes,
                    ),
                )
            )

    candidate_snippets.sort(key=lambda item: (item.score, item.estimated_tokens), reverse=True)
    selected: list[ReferenceSnippetContext] = []
    total_tokens = 0
    per_doc_counts: dict[str, int] = {}
    seen_hashes: set[str] = set()
    for snippet in candidate_snippets:
        doc_id = snippet.reference_document_id
        if per_doc_counts.get(doc_id, 0) >= 2 and len(per_doc_counts) < len(docs):
            continue
        content_hash = hashlib.sha256(snippet.content.encode("utf-8")).hexdigest()
        if content_hash in seen_hashes:
            continue
        next_tokens = total_tokens + max(1, int(snippet.estimated_tokens or 0))
        if selected and next_tokens > max_tokens:
            continue
        selected.append(snippet)
        per_doc_counts[doc_id] = per_doc_counts.get(doc_id, 0) + 1
        seen_hashes.add(content_hash)
        total_tokens = next_tokens
        if len(selected) >= max_chunks:
            break

    fallback_path = "ranked_chunks"
    if not selected and summary_contexts:
        fallback_path = "reference_summary_fallback"
        for summary in summary_contexts[:2]:
            selected.append(
                ReferenceSnippetContext(
                    reference_document_id=summary.reference_document_id,
                    reference_document_title=summary.reference_document_title,
                    chunk_id=None,
                    title=summary.reference_document_title,
                    locator={"summary": True},
                    content=summary.summary,
                    estimated_tokens=max(1, len(summary.summary) // 4),
                    score=0.0,
                    use_reason="summary fallback because no high-relevance snippet fit the prompt budget",
                )
            )

    trace = {
        "reference_scope": reference_scope,
        "requested_reference_ids": reference_document_ids,
        "selected_document_ids": [str(document.id) for document in docs],
        "skipped_references": skipped_references,
        "document_scores": document_scores,
        "terms": terms,
        "fallback_path": fallback_path,
        "chunk_count": len(selected),
        "estimated_reference_tokens": sum(item.estimated_tokens for item in selected),
        "token_budget": {
            "max_reference_documents": max_docs,
            "max_reference_chunks": max_chunks,
            "max_reference_tokens": max_tokens,
            "selected_reference_tokens": sum(item.estimated_tokens for item in selected),
        },
    }
    return summary_contexts[:max_docs], selected, trace


def _resolve_effective_reference_documents(
    *,
    handbook: Handbook,
    handbook_file: HandbookFile,
    placeholder: Placeholder,
    reference_scope: str,
    selected_ids: list[str],
):
    if not selected_ids:
        return [], []

    query = ReferenceDocument.objects.filter(
        handbook=handbook,
        id__in=selected_ids,
    ).prefetch_related("chunks", "links")

    handbook_q = {ReferenceDocumentLink.Scope.HANDBOOK}
    file_q = handbook_q | {ReferenceDocumentLink.Scope.FILE}
    placeholder_q = file_q | {ReferenceDocumentLink.Scope.PLACEHOLDER}
    allowed_scopes = handbook_q
    if reference_scope == ReferenceDocumentLink.Scope.FILE:
        allowed_scopes = file_q
    elif reference_scope == ReferenceDocumentLink.Scope.PLACEHOLDER:
        allowed_scopes = placeholder_q

    docs_by_id = {str(document.id): document for document in query}
    docs = []
    skipped = []
    for selected_id in selected_ids:
        document = docs_by_id.get(str(selected_id))
        if document is None:
            skipped.append(
                {
                    "reference_document_id": str(selected_id),
                    "reference_document_title": None,
                    "reason": "not_found",
                }
            )
            continue
        if document.parse_status != ReferenceDocument.ParseStatus.PARSED:
            skipped.append(
                {
                    "reference_document_id": str(document.id),
                    "reference_document_title": document.original_filename,
                    "reason": f"parse_status_{document.parse_status.lower()}",
                    "detail": document.parse_error,
                }
            )
            continue
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
        if not allowed:
            skipped.append(
                {
                    "reference_document_id": str(document.id),
                    "reference_document_title": document.original_filename,
                    "reason": "scope_mismatch",
                }
            )
            continue
        docs.append(document)
    return docs, skipped


def _build_search_terms(
    *,
    placeholder_key: str,
    handbook_file: HandbookFile,
    instruction: str,
    target_intent: str | None = None,
    tenant_context: TenantContext | None = None,
) -> list[str]:
    raw_terms = re.split(
        r"[^a-zA-Z0-9äöüÄÖÜß]+",
        " ".join(
            [
                placeholder_key,
                handbook_file.path_in_handbook,
                instruction,
                target_intent or "",
                tenant_context.industry if tenant_context else "",
                tenant_context.products if tenant_context else "",
                tenant_context.services if tenant_context else "",
            ]
        ),
    )
    terms = []
    for item in raw_terms:
        cleaned = item.strip().lower()
        if len(cleaned) < 3:
            continue
        if cleaned not in terms:
            terms.append(cleaned)
    return terms[:24]


def _score_text_block(
    *,
    title: str,
    content: str,
    terms: list[str],
    themes: list[str] | None = None,
    target_intent: str | None = None,
    section_kind: str | None = None,
) -> float:
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
    if target_intent and themes and target_intent in themes:
        score += 4.0
    if section_kind == "procedure" and target_intent in {"instruction", "workflow_description"}:
        score += 1.5
    return score


def _score_reference_document(
    *,
    document: ReferenceDocument,
    normalized,
    generation_context: GenerationContext,
    terms: list[str],
) -> float:
    score = 0.0
    if generation_context.target_context.target_intent in normalized.analysis.document_patterns:
        score += 6.0
    if generation_context.target_context.target_intent in normalized.analysis.dominant_themes:
        score += 4.0

    domain_terms = {term.lower() for term in normalized.analysis.domain_terms}
    for token in _tokenize_terms(
        " ".join(
            [
                generation_context.tenant_context.industry,
                generation_context.tenant_context.products,
                generation_context.tenant_context.services,
            ]
        )
    ):
        if token in domain_terms:
            score += 0.8

    for term in terms:
        if term in document.original_filename.lower():
            score += 1.5
        if term in normalized.document_summary.lower():
            score += 0.6

    if not normalized.analysis.low_signal:
        score += 0.5
    return score


def _ordinal_from_section_id(section_id: str) -> int:
    match = re.search(r"(\d+)$", section_id)
    if not match:
        return 0
    return int(match.group(1))


def _build_use_reason(*, target_intent: str, themes: list[str]) -> str:
    if target_intent in themes:
        return f"matched target intent '{target_intent}'"
    if themes:
        return f"matched themes: {', '.join(themes[:2])}"
    return "matched placeholder and template terminology"


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


def _serialize_references_used(
    references: list[ReferenceSnippetContext] | list[dict[str, object]],
) -> list[dict[str, object]]:
    serialized: list[dict[str, object]] = []
    for item in references:
        if isinstance(item, ReferenceSnippetContext):
            serialized.append(
                {
                    "reference_document_id": item.reference_document_id,
                    "reference_document_title": item.reference_document_title,
                    "chunk_id": item.chunk_id,
                    "title": item.title,
                    "locator": item.locator,
                    "estimated_tokens": item.estimated_tokens,
                    "score": item.score,
                    "use_reason": item.use_reason,
                }
            )
            continue
        serialized.append(
            {
                "reference_document_id": item.get("reference_document_id"),
                "reference_document_title": item.get("reference_document_title"),
                "chunk_id": item.get("chunk_id"),
                "title": item.get("title"),
                "locator": item.get("locator"),
                "estimated_tokens": item.get("estimated_tokens"),
                "score": item.get("score"),
                "use_reason": item.get("use_reason"),
            }
        )
    return serialized
