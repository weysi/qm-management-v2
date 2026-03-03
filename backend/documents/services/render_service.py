from __future__ import annotations

from pathlib import Path

from django.db import transaction

from documents.models import Document, DocumentVariable, DocumentVersion, WorkspaceAsset
from template_engine.cache import parse_template_cached
from template_engine.renderer import render
from template_engine.ooxml import apply_placeholders_to_ooxml_bytes

from .storage import LocalStorage
from .token_metrics import estimate_token_count_from_bytes, log_token_metrics


class RenderValidationError(ValueError):
    def __init__(self, errors: list[dict[str, object]]):
        super().__init__("Render validation failed")
        self.errors = errors


def _next_version(document: Document) -> int:
    latest = document.versions.order_by("-version_number").first()
    return (latest.version_number if latest else 0) + 1


def _resolve_asset_placeholder_value(
    *,
    handbook_id: str,
    asset_type: str,
    override: object | None,
) -> str:
    if isinstance(override, str) and override.strip():
        return override.strip()

    asset = (
        WorkspaceAsset.objects.filter(
            handbook_id=handbook_id,
            asset_type=asset_type,
            deleted_at__isnull=True,
        )
        .order_by("-updated_at")
        .first()
    )
    if asset is None:
        return ""

    if asset_type == WorkspaceAsset.AssetType.LOGO:
        return "[LOGO]"
    return "[SIGNATURE]"


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


@transaction.atomic
def render_document(
    *,
    document_id: str,
    variables: dict[str, object] | None = None,
    asset_overrides: dict[str, object] | None = None,
) -> tuple[DocumentVersion, list[dict[str, object]], list[dict[str, object]]]:
    document = Document.objects.filter(id=document_id, deleted_at__isnull=True).first()
    if document is None:
        raise FileNotFoundError("Document not found")

    values = dict(variables or {})
    overrides = asset_overrides or {}

    values.setdefault(
        "assets.logo",
        _resolve_asset_placeholder_value(
            handbook_id=document.handbook_id,
            asset_type=WorkspaceAsset.AssetType.LOGO,
            override=overrides.get("assets.logo"),
        ),
    )
    values.setdefault(
        "assets.signature",
        _resolve_asset_placeholder_value(
            handbook_id=document.handbook_id,
            asset_type=WorkspaceAsset.AssetType.SIGNATURE,
            override=overrides.get("assets.signature"),
        ),
    )

    original_path = Path(document.original_file_path)
    source_bytes = LocalStorage().read_bytes(original_path)
    ext = original_path.suffix.lower()
    required = _required_variables(document)

    unresolved: list[dict[str, object]] = []
    errors: list[dict[str, object]] = []

    if ext == ".docx":
        output_bytes, unresolved, ooxml_errors = apply_placeholders_to_ooxml_bytes(
            source_bytes,
            ext,
            values,
            required_variables=required,
        )
        errors.extend(
            [
                {
                    "variable": item.get("variable"),
                    "error_code": item.get("error_code"),
                    "message": item.get("message"),
                    "path": item.get("path"),
                    "start": item.get("start"),
                    "end": item.get("end"),
                }
                for item in ooxml_errors
            ]
        )
    else:
        text = source_bytes.decode("utf-8", errors="ignore")
        ast = parse_template_cached(text)
        result = render(
            ast,
            values,
            required_variables=required,
            fail_fast_on_required=False,
            preserve_unresolved=True,
        )
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
        output_bytes = result.output.encode("utf-8")

    errors.extend(_collect_missing_errors(unresolved, required))
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
    output_path = (
        original_path.parent.parent / "versions" / document.relative_path
    )
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
        },
    )

    return doc_version, unresolved, []
