from __future__ import annotations

from pathlib import Path

from django.db import transaction

from documents.models import Document, DocumentVariable, DocumentVersion
from template_engine.cache import parse_template_cached
from template_engine.renderer import render

from .asset_service import asset_download_url, get_active_asset
from .generation_policy import RenderGenerationPolicy, should_fail_on_missing_asset
from .office_generation import generate_office_document
from .storage import LocalStorage
from .token_metrics import estimate_token_count_from_bytes, log_token_metrics
from .variable_keys import (
    CANONICAL_ASSET_LOGO,
    CANONICAL_ASSET_SIGNATURE,
    canonicalize_variable_map,
)

ASSET_KEYS = {CANONICAL_ASSET_LOGO, CANONICAL_ASSET_SIGNATURE}


class RenderValidationError(ValueError):
    def __init__(self, errors: list[dict[str, object]]):
        super().__init__("Render validation failed")
        self.errors = errors


def _next_version(document: Document) -> int:
    latest = document.versions.order_by("-version_number").first()
    return (latest.version_number if latest else 0) + 1


def _required_variables(document: Document) -> set[str]:
    return set(
        DocumentVariable.objects.filter(document=document, required=True).values_list(
            "variable_name", flat=True
        )
    )


def _collect_missing_errors(unresolved: list[dict[str, object]], required: set[str]) -> list[dict[str, object]]:
    errors: list[dict[str, object]] = []
    for entry in unresolved:
        variable = str(entry.get("variable", ""))
        if variable not in required:
            continue
        errors.append(
            {
                "variable": variable,
                "error_code": "MISSING_REQUIRED",
                "message": f"Missing required variable '{variable}'",
                "path": variable,
                "start": entry.get("start"),
                "end": entry.get("end"),
            }
        )
    return errors


def _asset_value_for_text_extension(
    *,
    ext: str,
    handbook_id: str,
    asset_type: str,
    override: object | None,
) -> str:
    if isinstance(override, str) and override.strip():
        return override.strip()

    asset = get_active_asset(handbook_id=handbook_id, asset_type=asset_type)
    if asset is None:
        return ""

    download_url = asset_download_url(handbook_id, asset_type)
    if ext in {".html", ".htm"}:
        alt = "logo" if asset_type == "logo" else "signature"
        return f'<img src="{download_url}" alt="{alt}" />'
    if ext == ".md":
        label = "logo" if asset_type == "logo" else "signature"
        return f"![{label}]({download_url})"
    return download_url


@transaction.atomic
def render_document(
    *,
    document_id: str,
    variables: dict[str, object] | None = None,
    asset_overrides: dict[str, object] | None = None,
    generation_policy: RenderGenerationPolicy | None = None,
) -> tuple[DocumentVersion, list[dict[str, object]], list[dict[str, object]]]:
    document = Document.objects.filter(id=document_id, deleted_at__isnull=True).first()
    if document is None:
        raise FileNotFoundError("Document not found")

    policy = generation_policy or RenderGenerationPolicy()
    values = canonicalize_variable_map(variables or {})
    overrides = canonicalize_variable_map(asset_overrides or {})

    original_path = Path(document.original_file_path)
    source_bytes = LocalStorage().read_bytes(original_path)
    ext = original_path.suffix.lower()
    required = _required_variables(document)
    required_for_missing_errors = set(required)

    unresolved: list[dict[str, object]] = []
    warnings: list[dict[str, object]] = []
    errors: list[dict[str, object]] = []
    output_bytes: bytes

    if ext in {".docx", ".pptx", ".xlsx"}:
        required_non_asset = required - ASSET_KEYS
        required_for_missing_errors = required_non_asset
        text_values = {k: v for k, v in values.items() if k not in ASSET_KEYS}
        office_result = generate_office_document(
            source_bytes=source_bytes,
            ext=ext,
            handbook_id=document.handbook_id,
            text_values=text_values,
            required_non_asset_variables=required_non_asset,
            generation_policy=policy,
        )
        output_bytes = office_result.output_bytes
        unresolved = office_result.unresolved
        warnings = office_result.warnings
        errors.extend(office_result.errors)

        if should_fail_on_missing_asset(policy):
            required_for_missing_errors = required_for_missing_errors - ASSET_KEYS
    else:
        values.setdefault(
            CANONICAL_ASSET_LOGO,
            _asset_value_for_text_extension(
                ext=ext,
                handbook_id=document.handbook_id,
                asset_type="logo",
                override=overrides.get(CANONICAL_ASSET_LOGO),
            ),
        )
        values.setdefault(
            CANONICAL_ASSET_SIGNATURE,
            _asset_value_for_text_extension(
                ext=ext,
                handbook_id=document.handbook_id,
                asset_type="signature",
                override=overrides.get(CANONICAL_ASSET_SIGNATURE),
            ),
        )

        text = source_bytes.decode("utf-8", errors="ignore")
        ast = parse_template_cached(text)
        result = render(
            ast,
            values,
            required_variables=required,
            fail_fast_on_required=False,
            preserve_unresolved=True,
        )
        output_bytes = result.output.encode("utf-8")
        unresolved = list(result.unresolved)
        errors.extend(
            [
                {
                    "variable": err.variable,
                    "error_code": err.code,
                    "message": err.message,
                    "path": err.path,
                    "start": err.start,
                    "end": err.end,
                }
                for err in result.errors
            ]
        )

    errors.extend(_collect_missing_errors(unresolved, required_for_missing_errors))
    deduped_errors: list[dict[str, object]] = []
    seen: set[tuple[str, str, object, object]] = set()
    for item in errors:
        key = (
            str(item.get("variable") or ""),
            str(item.get("error_code") or ""),
            item.get("start"),
            item.get("end"),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped_errors.append(item)

    if deduped_errors:
        raise RenderValidationError(deduped_errors)

    version = _next_version(document)
    output_path = original_path.parent.parent / "versions" / document.relative_path
    output_name = f"v{version}-{output_path.name}"
    output_path = output_path.with_name(output_name)
    LocalStorage().write_bytes(output_path, output_bytes)
    log_token_metrics(
        path=output_path,
        estimated_token_count=estimate_token_count_from_bytes(output_bytes),
    )

    doc_version = DocumentVersion.objects.create(
        document=document,
        version_number=version,
        file_path=str(output_path),
        mime_type=document.mime_type,
        size_bytes=output_path.stat().st_size,
        created_by=DocumentVersion.CreatedBy.SYSTEM,
        metadata={
            "operation": "render",
            "unresolved_count": len(unresolved),
            "warning_count": len(warnings),
        },
    )
    return doc_version, unresolved, warnings
