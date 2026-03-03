from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from zipfile import BadZipFile

from django.db import transaction
from django.utils import timezone

from documents.models import Document, DocumentVariable, DocumentVersion, WorkspaceAsset

from .asset_service import save_asset_bytes
from .common import SUPPORTED_UPLOAD_EXTS, handbook_root, sanitize_relative_path
from .storage import LocalStorage
from .variable_extraction_service import extract_variable_contract
from .zip_ingestion_service import inspect_zip_payload


class UploadValidationError(ValueError):
    pass


@dataclass(frozen=True)
class UploadResult:
    kind: str
    documents: tuple[Document, ...]
    variables_by_document: dict[str, tuple[DocumentVariable, ...]]
    assets: tuple[WorkspaceAsset, ...]
    warnings: tuple[dict[str, str], ...]


def _validate_extension(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext == ".doc":
        raise UploadValidationError(
            "Legacy .doc is not supported in v1. Please convert to .docx and upload again."
        )
    if ext not in SUPPORTED_UPLOAD_EXTS:
        raise UploadValidationError("Unsupported file format")
    return ext


def _persist_document(
    *,
    handbook_id: str,
    relative_path: str,
    filename: str,
    payload: bytes,
    mime_type: str,
) -> tuple[Document, tuple[DocumentVariable, ...]]:
    safe_rel_path = sanitize_relative_path(relative_path, filename)
    existing = Document.objects.filter(
        handbook_id=handbook_id,
        relative_path=safe_rel_path,
        deleted_at__isnull=True,
    )
    if existing.exists():
        existing.update(deleted_at=timezone.now())

    root = handbook_root(handbook_id)
    destination = (root / "originals" / safe_rel_path).resolve()
    LocalStorage().write_bytes(destination, payload)

    size_bytes = destination.stat().st_size
    document = Document.objects.create(
        handbook_id=handbook_id,
        name=Path(safe_rel_path).name,
        relative_path=safe_rel_path,
        original_file_path=str(destination),
        mime_type=mime_type or "application/octet-stream",
        size_bytes=size_bytes,
    )

    contract = extract_variable_contract(destination, payload)
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
        mime_type=mime_type or "application/octet-stream",
        size_bytes=size_bytes,
        created_by=DocumentVersion.CreatedBy.USER,
        metadata={"kind": "original"},
    )
    return document, tuple(variables)


@transaction.atomic
def upload_document(
    *,
    handbook_id: str,
    uploaded,
    relative_path: str | None = None,
) -> UploadResult:
    ext = _validate_extension(uploaded.name)
    uploaded_bytes = uploaded.read()

    if ext != ".zip":
        safe_rel_path = sanitize_relative_path(relative_path or "", uploaded.name)
        try:
            document, variables = _persist_document(
                handbook_id=handbook_id,
                relative_path=safe_rel_path,
                filename=uploaded.name,
                payload=uploaded_bytes,
                mime_type=uploaded.content_type or "application/octet-stream",
            )
        except BadZipFile:
            raise UploadValidationError(
                "The uploaded file is not a valid OOXML archive (.docx/.pptx). "
                "Please ensure the file is not corrupted and try again."
            )

        return UploadResult(
            kind="file",
            documents=(document,),
            variables_by_document={str(document.id): variables},
            assets=tuple(),
            warnings=tuple(),
        )

    try:
        zip_result = inspect_zip_payload(uploaded.name, uploaded_bytes)
    except BadZipFile:
        raise UploadValidationError("Invalid ZIP archive")
    documents: list[Document] = []
    assets: list[WorkspaceAsset] = []
    variables_by_document: dict[str, tuple[DocumentVariable, ...]] = {}

    for entry in zip_result.templates:
        try:
            document, variables = _persist_document(
                handbook_id=handbook_id,
                relative_path=entry.relative_path,
                filename=entry.filename,
                payload=entry.payload,
                mime_type=entry.mime_type,
            )
        except BadZipFile:
            raise UploadValidationError(
                f"Template '{entry.relative_path}' is not a valid OOXML archive"
            )
        documents.append(document)
        variables_by_document[str(document.id)] = variables

    for asset_entry in zip_result.assets:
        assets.append(
            save_asset_bytes(
                handbook_id=handbook_id,
                asset_type=asset_entry.asset_type,
                filename=asset_entry.filename,
                payload=asset_entry.payload,
                mime_type=asset_entry.mime_type,
            )
        )

    if not documents and not assets:
        raise UploadValidationError(
            "ZIP archive did not contain supported templates or mapped assets."
        )

    return UploadResult(
        kind="zip",
        documents=tuple(documents),
        variables_by_document=variables_by_document,
        assets=tuple(assets),
        warnings=zip_result.warnings,
    )
