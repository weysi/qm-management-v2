from __future__ import annotations

import hashlib
import json
import mimetypes
from pathlib import Path

from django.conf import settings
from django.db import transaction

from documents.models import (
    DocumentTextExtractionCache,
    Handbook,
    HandbookFile,
    Placeholder,
    ReferenceChunk,
    ReferenceDocument,
    ReferenceDocumentLink,
)

from .common import handbook_root, sanitize_relative_path
from .reference_extraction import (
    ReferenceExtractionError,
    deserialize_normalized_document,
    extract_reference_document,
    infer_reference_file_type,
    serialize_normalized_document,
)


class ReferenceServiceError(ValueError):
    pass


def _reference_dirs(handbook: Handbook) -> tuple[Path, Path]:
    root = Path(handbook.root_storage_path or handbook_root(str(handbook.id)))
    originals = root / "reference-files" / "originals"
    normalized = root / "reference-files" / "normalized"
    originals.mkdir(parents=True, exist_ok=True)
    normalized.mkdir(parents=True, exist_ok=True)
    return originals, normalized


def _max_reference_size() -> int:
    return int(getattr(settings, "REFERENCE_MAX_UPLOAD_BYTES", 25 * 1024 * 1024))


def _normalized_path_for(reference_document: ReferenceDocument) -> Path:
    _originals, normalized = _reference_dirs(reference_document.handbook)
    return normalized / f"{reference_document.id}.json"


@transaction.atomic
def upload_reference_document(*, handbook: Handbook, uploaded) -> ReferenceDocument:
    filename = sanitize_relative_path(str(getattr(uploaded, "name", "reference")), "reference")
    max_size = _max_reference_size()
    originals_dir, _normalized_dir = _reference_dirs(handbook)

    checksum = hashlib.sha256()
    size_bytes = 0
    storage_path = (originals_dir / filename).resolve()
    storage_path.parent.mkdir(parents=True, exist_ok=True)

    with storage_path.open("wb") as handle:
        if hasattr(uploaded, "chunks"):
            for chunk in uploaded.chunks():
                size_bytes += len(chunk)
                if size_bytes > max_size:
                    raise ReferenceServiceError("Reference file exceeds configured size limit")
                checksum.update(chunk)
                handle.write(chunk)
        else:
            payload = uploaded.read()
            size_bytes = len(payload)
            if size_bytes > max_size:
                raise ReferenceServiceError("Reference file exceeds configured size limit")
            checksum.update(payload)
            handle.write(payload)

    mime_type = getattr(uploaded, "content_type", "") or (mimetypes.guess_type(filename)[0] or "application/octet-stream")
    file_type = infer_reference_file_type(filename)

    reference_document = ReferenceDocument.objects.create(
        handbook=handbook,
        original_filename=Path(filename).name,
        file_type=file_type,
        mime_type=mime_type,
        storage_path=str(storage_path),
        checksum=checksum.hexdigest(),
        size_bytes=size_bytes,
        parse_status=ReferenceDocument.ParseStatus.PENDING,
    )

    _populate_reference_document(reference_document=reference_document)
    ReferenceDocumentLink.objects.get_or_create(
        reference_document=reference_document,
        scope=ReferenceDocumentLink.Scope.HANDBOOK,
        handbook_file=None,
        placeholder=None,
    )
    return reference_document


@transaction.atomic
def reprocess_reference_document(*, handbook: Handbook, reference_document_id: str) -> ReferenceDocument:
    reference_document = ReferenceDocument.objects.filter(id=reference_document_id, handbook=handbook).first()
    if reference_document is None:
        raise ReferenceServiceError("Reference document not found")
    _populate_reference_document(reference_document=reference_document)
    return reference_document


@transaction.atomic
def delete_reference_document(*, handbook: Handbook, reference_document_id: str) -> bool:
    reference_document = ReferenceDocument.objects.filter(id=reference_document_id, handbook=handbook).first()
    if reference_document is None:
        return False
    Path(reference_document.storage_path).unlink(missing_ok=True)
    if reference_document.normalized_storage_path:
        Path(reference_document.normalized_storage_path).unlink(missing_ok=True)
    reference_document.delete()
    return True


@transaction.atomic
def create_reference_link(
    *,
    handbook: Handbook,
    reference_document_id: str,
    scope: str,
    handbook_file_id: str | None = None,
    placeholder_id: str | None = None,
) -> ReferenceDocumentLink:
    reference_document = ReferenceDocument.objects.filter(id=reference_document_id, handbook=handbook).first()
    if reference_document is None:
        raise ReferenceServiceError("Reference document not found")

    normalized_scope = (scope or "").strip().lower()
    if normalized_scope not in {item for item, _ in ReferenceDocumentLink.Scope.choices}:
        raise ReferenceServiceError("scope must be one of handbook, file, placeholder")

    handbook_file = None
    placeholder = None
    if normalized_scope == ReferenceDocumentLink.Scope.FILE:
        if not handbook_file_id:
            raise ReferenceServiceError("handbook_file_id is required for file scope")
        handbook_file = HandbookFile.objects.filter(id=handbook_file_id, handbook=handbook).first()
        if handbook_file is None:
            raise ReferenceServiceError("Handbook file not found")
    elif normalized_scope == ReferenceDocumentLink.Scope.PLACEHOLDER:
        if not placeholder_id:
            raise ReferenceServiceError("placeholder_id is required for placeholder scope")
        placeholder = Placeholder.objects.filter(
            id=placeholder_id,
            handbook_file__handbook=handbook,
        ).select_related("handbook_file").first()
        if placeholder is None:
            raise ReferenceServiceError("Placeholder not found")
        handbook_file = placeholder.handbook_file

    link, _created = ReferenceDocumentLink.objects.get_or_create(
        reference_document=reference_document,
        scope=normalized_scope,
        handbook_file=handbook_file,
        placeholder=placeholder,
    )
    return link


@transaction.atomic
def delete_reference_link(*, handbook: Handbook, reference_document_id: str, link_id: str) -> bool:
    deleted, _ = ReferenceDocumentLink.objects.filter(
        id=link_id,
        reference_document_id=reference_document_id,
        reference_document__handbook=handbook,
    ).delete()
    return bool(deleted)


def list_reference_documents(*, handbook: Handbook) -> list[ReferenceDocument]:
    return list(
        ReferenceDocument.objects.filter(handbook=handbook)
        .prefetch_related("links")
        .order_by("-created_at")
    )


def get_reference_document_preview(*, handbook: Handbook, reference_document_id: str, limit: int = 8) -> dict[str, object]:
    reference_document = ReferenceDocument.objects.filter(id=reference_document_id, handbook=handbook).first()
    if reference_document is None:
        raise ReferenceServiceError("Reference document not found")

    normalized = _load_normalized_document(reference_document)
    preview_sections = [
        {
            "id": section.id,
            "type": section.type,
            "title": section.title,
            "locator": section.locator,
            "content": section.content,
            "estimated_tokens": section.estimated_tokens,
        }
        for section in normalized.sections[: max(1, limit)]
    ]
    return {
        "reference_document": reference_document,
        "summary": normalized.document_summary,
        "sections": preview_sections,
        "links": [_serialize_reference_link(link) for link in reference_document.links.all().order_by("created_at")],
    }


def _load_normalized_document(reference_document: ReferenceDocument):
    normalized_path = Path(reference_document.normalized_storage_path)
    if not normalized_path.exists():
        raise ReferenceServiceError("Normalized reference content not found")
    payload = json.loads(normalized_path.read_text(encoding="utf-8"))
    return deserialize_normalized_document(payload)


def _populate_reference_document(*, reference_document: ReferenceDocument) -> None:
    if reference_document.file_type == ReferenceDocument.FileType.OTHER:
        reference_document.parse_status = ReferenceDocument.ParseStatus.UNSUPPORTED
        reference_document.parse_error = "Unsupported reference file type"
        reference_document.summary = ""
        reference_document.section_count = 0
        reference_document.save(
            update_fields=["parse_status", "parse_error", "summary", "section_count", "updated_at"]
        )
        ReferenceChunk.objects.filter(reference_document=reference_document).delete()
        return

    source_path = Path(reference_document.storage_path)
    if not source_path.exists():
        raise ReferenceServiceError("Reference document file is missing")

    payload = source_path.read_bytes()
    normalized_path = _normalized_path_for(reference_document)

    try:
        normalized = _get_or_extract_cached(
            checksum=reference_document.checksum,
            file_type=reference_document.file_type,
            payload=payload,
        )
    except ReferenceExtractionError as exc:
        message = str(exc)
        reference_document.parse_status = (
            ReferenceDocument.ParseStatus.UNSUPPORTED
            if "Unsupported" in message or "no extractable text" in message.lower()
            else ReferenceDocument.ParseStatus.FAILED
        )
        reference_document.parse_error = message
        reference_document.summary = ""
        reference_document.section_count = 0
        reference_document.normalized_storage_path = ""
        reference_document.save(
            update_fields=[
                "parse_status",
                "parse_error",
                "summary",
                "section_count",
                "normalized_storage_path",
                "updated_at",
            ]
        )
        ReferenceChunk.objects.filter(reference_document=reference_document).delete()
        return

    normalized_path.write_text(
        json.dumps(serialize_normalized_document(normalized), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    ReferenceChunk.objects.filter(reference_document=reference_document).delete()
    ReferenceChunk.objects.bulk_create(
        [
            ReferenceChunk(
                reference_document=reference_document,
                ordinal=index,
                chunk_type=section.type,
                title=section.title,
                locator=section.locator,
                content=section.content,
                content_hash=hashlib.sha256(section.content.encode("utf-8")).hexdigest(),
                estimated_tokens=section.estimated_tokens,
            )
            for index, section in enumerate(normalized.sections, start=1)
        ]
    )

    reference_document.parse_status = ReferenceDocument.ParseStatus.PARSED
    reference_document.parse_error = ""
    reference_document.summary = normalized.document_summary
    reference_document.section_count = len(normalized.sections)
    reference_document.normalized_storage_path = str(normalized_path)
    reference_document.save(
        update_fields=[
            "parse_status",
            "parse_error",
            "summary",
            "section_count",
            "normalized_storage_path",
            "updated_at",
        ]
    )


def _get_or_extract_cached(*, checksum: str, file_type: str, payload: bytes):
    cache_entry = DocumentTextExtractionCache.objects.filter(checksum=checksum, file_type=file_type).first()
    if cache_entry and isinstance(cache_entry.normalized_data, dict) and cache_entry.normalized_data:
        return deserialize_normalized_document(cache_entry.normalized_data)

    normalized = extract_reference_document(payload=payload, file_type=file_type)
    DocumentTextExtractionCache.objects.update_or_create(
        checksum=checksum,
        file_type=file_type,
        defaults={"normalized_data": serialize_normalized_document(normalized)},
    )
    return normalized


def get_handbook_file_text_context(handbook_file: HandbookFile):
    file_type_map = {
        HandbookFile.FileType.DOCX: ReferenceDocument.FileType.DOCX,
        HandbookFile.FileType.PPTX: ReferenceDocument.FileType.PPTX,
        HandbookFile.FileType.XLSX: ReferenceDocument.FileType.XLSX,
    }
    reference_type = file_type_map.get(handbook_file.file_type)
    if reference_type is None:
        return None
    source_path = Path(handbook_file.original_blob_ref)
    if not source_path.exists():
        return None
    try:
        return _get_or_extract_cached(
            checksum=handbook_file.checksum,
            file_type=reference_type,
            payload=source_path.read_bytes(),
        )
    except ReferenceExtractionError:
        return None


def _serialize_reference_link(link: ReferenceDocumentLink) -> dict[str, object]:
    return {
        "id": str(link.id),
        "scope": link.scope,
        "handbook_file_id": str(link.handbook_file_id) if link.handbook_file_id else None,
        "placeholder_id": str(link.placeholder_id) if link.placeholder_id else None,
        "created_at": link.created_at.isoformat(),
    }
