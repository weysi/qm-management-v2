from __future__ import annotations

from pathlib import Path
from zipfile import BadZipFile

from django.db import transaction
from django.utils import timezone

from documents.models import Document, DocumentVariable, DocumentVersion

from .common import SUPPORTED_UPLOAD_EXTS, handbook_root, sanitize_relative_path
from .storage import LocalStorage
from .variable_extraction_service import extract_variable_contract


class UploadValidationError(ValueError):
    pass


def _validate_extension(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext == ".doc":
        raise UploadValidationError(
            "Legacy .doc is not supported in v1. Please convert to .docx and upload again."
        )
    if ext not in SUPPORTED_UPLOAD_EXTS:
        raise UploadValidationError("Unsupported file format")
    return ext


@transaction.atomic
def upload_document(
    *,
    handbook_id: str,
    uploaded,
    relative_path: str | None = None,
) -> tuple[Document, list[DocumentVariable]]:
    _validate_extension(uploaded.name)

    safe_rel_path = sanitize_relative_path(relative_path or "", uploaded.name)
    existing = Document.objects.filter(
        handbook_id=handbook_id,
        relative_path=safe_rel_path,
        deleted_at__isnull=True,
    )
    if existing.exists():
        existing.update(deleted_at=timezone.now())

    root = handbook_root(handbook_id)
    destination = (root / "originals" / safe_rel_path).resolve()
    LocalStorage().write_bytes(destination, uploaded.read())

    size_bytes = destination.stat().st_size
    mime_type = uploaded.content_type or "application/octet-stream"
    source_bytes = destination.read_bytes()

    document = Document.objects.create(
        handbook_id=handbook_id,
        name=Path(safe_rel_path).name,
        relative_path=safe_rel_path,
        original_file_path=str(destination),
        mime_type=mime_type,
        size_bytes=size_bytes,
    )

    try:
        contract = extract_variable_contract(destination, source_bytes)
    except BadZipFile:
        raise UploadValidationError(
            "The uploaded file is not a valid OOXML archive (.docx/.pptx). "
            "Please ensure the file is not corrupted and try again."
        )
    variables: list[DocumentVariable] = []
    for name, config in sorted(contract.items(), key=lambda item: item[0]):
        variable = DocumentVariable.objects.create(
            document=document,
            variable_name=name,
            required=bool(config.get("required", False)),
            source=str(config.get("source", DocumentVariable.Source.USER_INPUT)),
            type=str(config.get("type", "string")),
            metadata=config.get("metadata") or {},
        )
        variables.append(variable)

    DocumentVersion.objects.create(
        document=document,
        version_number=1,
        file_path=str(destination),
        mime_type=mime_type,
        size_bytes=size_bytes,
        created_by=DocumentVersion.CreatedBy.USER,
        metadata={"kind": "original"},
    )

    return document, variables
