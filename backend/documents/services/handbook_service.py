from __future__ import annotations

from dataclasses import dataclass
import hashlib
from io import BytesIO
import logging
import mimetypes
from pathlib import Path, PurePosixPath
import re
import shutil
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from django.conf import settings
from django.db import transaction

from clients.models import Client
from documents.models import (
    Handbook,
    HandbookFile,
    Placeholder,
    PlaceholderValue,
    VersionSnapshot,
)

from .asset_resolver import StorageAssetResolver
from .asset_service import get_active_asset
from .asset_metadata import detect_image_dimensions
from .inject_docx import inject_docx_assets
from .inject_pptx import inject_pptx_assets
from .inject_xlsx import inject_xlsx_assets
from .office_asset_types import ResolvedOfficeAsset
from .storage import LocalFilesystemStorage
from .variable_fill_service import fill_variable_value
from .variable_keys import (
    CANONICAL_ASSET_LOGO,
    CANONICAL_ASSET_SIGNATURE,
    aliases_for_canonical,
)
from template_engine.ooxml_normalizer import normalize_ooxml_xml


logger = logging.getLogger(__name__)

MAX_ZIP_ENTRIES = 3000
MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 400 * 1024 * 1024
MAX_ZIP_ENTRY_BYTES = 100 * 1024 * 1024

ASSET_KEYS = {CANONICAL_ASSET_LOGO, CANONICAL_ASSET_SIGNATURE}
PARSEABLE_EXTS = {".docx", ".pptx", ".xlsx"}

PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*([A-Za-z0-9_.-]+)(?:\s*\|[^{}]+)?\s*\}\}")
LEGACY_ASSET_PATTERN = re.compile(
    r"(?<!\\)(\[(LOGO|SIGNATURE)\]|__ASSET_(LOGO|SIGNATURE)__)",
    re.IGNORECASE,
)

OOXML_PART_PREFIXES = {
    ".docx": ("word/",),
    ".pptx": ("ppt/",),
    ".xlsx": ("xl/",),
}


class HandbookServiceError(ValueError):
    pass


class ExportValidationError(HandbookServiceError):
    def __init__(self, errors: list[dict[str, object]]):
        super().__init__("Export validation failed")
        self.errors = errors


@dataclass(frozen=True)
class UploadZipResult:
    tree: list[dict[str, object]]
    files: list[HandbookFile]
    warnings: list[dict[str, str]]


def canonicalize_placeholder_key(raw: str) -> str:
    token = (raw or "").strip()
    if not token:
        return ""

    if token.startswith("{{") and token.endswith("}}"):
        token = token[2:-2].strip()
    if "|" in token:
        token = token.split("|", 1)[0].strip()

    lowered = re.sub(r"\s+", "", token).lower()
    if not lowered:
        return ""

    aliases = {
        "assets.logo": CANONICAL_ASSET_LOGO,
        "asset_logo": CANONICAL_ASSET_LOGO,
        "assets_logo": CANONICAL_ASSET_LOGO,
        "logo": CANONICAL_ASSET_LOGO,
        "company_logo": CANONICAL_ASSET_LOGO,
        "[logo]": CANONICAL_ASSET_LOGO,
        "__asset_logo__": CANONICAL_ASSET_LOGO,
        "company.logo": CANONICAL_ASSET_LOGO,
        "assets.signature": CANONICAL_ASSET_SIGNATURE,
        "asset_signature": CANONICAL_ASSET_SIGNATURE,
        "assets_signature": CANONICAL_ASSET_SIGNATURE,
        "signature": CANONICAL_ASSET_SIGNATURE,
        "company_signature": CANONICAL_ASSET_SIGNATURE,
        "[signature]": CANONICAL_ASSET_SIGNATURE,
        "__asset_signature__": CANONICAL_ASSET_SIGNATURE,
        "company.signature": CANONICAL_ASSET_SIGNATURE,
    }

    return aliases.get(lowered, lowered)


def _safe_zip_path(name: str) -> str | None:
    posix = PurePosixPath(name.replace("\\", "/"))
    if posix.is_absolute():
        return None

    safe_parts: list[str] = []
    for part in posix.parts:
        if part in {"", "."}:
            continue
        if part == "..":
            return None
        safe_parts.append(part)

    if not safe_parts:
        return None
    return "/".join(safe_parts)


def _is_junk_entry(safe_path: str) -> bool:
    parts = [part for part in safe_path.split("/") if part]
    if not parts:
        return True
    if parts[0] == "__MACOSX":
        return True

    basename = parts[-1]
    if basename in {".DS_Store", "Thumbs.db"}:
        return True
    if basename.startswith("._"):
        return True
    return False


def _file_type_from_ext(ext: str) -> str:
    lowered = ext.lower()
    if lowered == ".docx":
        return HandbookFile.FileType.DOCX
    if lowered == ".pptx":
        return HandbookFile.FileType.PPTX
    if lowered == ".xlsx":
        return HandbookFile.FileType.XLSX
    return HandbookFile.FileType.OTHER


def _is_target_xml(ext: str, name: str) -> bool:
    if not name.endswith(".xml"):
        return False
    prefixes = OOXML_PART_PREFIXES.get(ext)
    if not prefixes:
        return False
    return any(name.startswith(prefix) for prefix in prefixes)


def _extract_placeholders_from_text(
    text: str,
    *,
    source: str,
) -> dict[str, list[dict[str, object]]]:
    collected: dict[str, list[dict[str, object]]] = {}

    for match in PLACEHOLDER_PATTERN.finditer(text):
        key = canonicalize_placeholder_key(match.group(1) or "")
        if not key:
            continue
        collected.setdefault(key, []).append(
            {
                "source": source,
                "start": match.start(),
                "end": match.end(),
                "raw": match.group(0),
            }
        )

    for match in LEGACY_ASSET_PATTERN.finditer(text):
        key = canonicalize_placeholder_key(match.group(0) or "")
        if not key:
            continue
        collected.setdefault(key, []).append(
            {
                "source": source,
                "start": match.start(),
                "end": match.end(),
                "raw": match.group(0),
            }
        )

    return collected


def extract_placeholders_from_ooxml_bytes(payload: bytes, ext: str) -> dict[str, list[dict[str, object]]]:
    collected: dict[str, list[dict[str, object]]] = {}

    with ZipFile(BytesIO(payload), "r") as archive:
        for name in sorted(archive.namelist()):
            if not _is_target_xml(ext, name):
                continue

            xml = archive.read(name).decode("utf-8", errors="ignore")
            if ext in {".docx", ".pptx"}:
                xml = normalize_ooxml_xml(xml, ext.lstrip("."))

            extracted = _extract_placeholders_from_text(xml, source=name)
            for key, locations in extracted.items():
                collected.setdefault(key, []).extend(locations)

    return collected


def _replace_placeholders_in_text(text: str, values: dict[str, str]) -> str:
    def _replacement(match: re.Match[str]) -> str:
        key = canonicalize_placeholder_key(match.group(1) or "")
        if not key or key in ASSET_KEYS:
            return match.group(0)
        value = values.get(key)
        if value is None:
            return match.group(0)
        cleaned = str(value).strip()
        if cleaned == "":
            return match.group(0)
        return cleaned

    return PLACEHOLDER_PATTERN.sub(_replacement, text)


def replace_text_placeholders_in_ooxml_bytes(
    payload: bytes,
    ext: str,
    values: dict[str, str],
) -> bytes:
    ext = ext.lower()
    if ext not in PARSEABLE_EXTS:
        return payload

    output = BytesIO()
    try:
        archive_in = ZipFile(BytesIO(payload), "r")
    except BadZipFile:
        # Source file has the right extension but is not a valid ZIP/OOXML.
        # Return the original bytes untouched instead of crashing the export.
        logger.warning("replace_text_placeholders: payload is not a valid ZIP (%s), skipping", ext)
        return payload

    with archive_in:
        with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive_out:
            for info in archive_in.infolist():
                raw = archive_in.read(info.filename)
                if _is_target_xml(ext, info.filename):
                    xml = raw.decode("utf-8", errors="ignore")
                    if ext in {".docx", ".pptx"}:
                        xml = normalize_ooxml_xml(xml, ext.lstrip("."))
                    xml = _replace_placeholders_in_text(xml, values)
                    raw = xml.encode("utf-8")
                archive_out.writestr(info, raw)
    return output.getvalue()


def _resolved_text_keys(handbook: Handbook) -> set[str]:
    values = PlaceholderValue.objects.filter(handbook=handbook)
    return {
        canonicalize_placeholder_key(item.key)
        for item in values
        if isinstance(item.value_text, str) and item.value_text.strip()
    }


def _resolved_asset_keys(handbook: Handbook) -> set[str]:
    resolved: set[str] = set()
    if get_active_asset(handbook_id=str(handbook.id), asset_type="logo") is not None:
        resolved.add(CANONICAL_ASSET_LOGO)
    if get_active_asset(handbook_id=str(handbook.id), asset_type="signature") is not None:
        resolved.add(CANONICAL_ASSET_SIGNATURE)
    return resolved


def _resolved_keys(handbook: Handbook) -> set[str]:
    return _resolved_text_keys(handbook) | _resolved_asset_keys(handbook)


def _update_file_completion(handbook: Handbook, handbook_file: HandbookFile) -> None:
    placeholders = list(Placeholder.objects.filter(handbook_file=handbook_file).only("key"))
    resolved = _resolved_keys(handbook)
    total = len(placeholders)
    resolved_count = sum(1 for item in placeholders if canonicalize_placeholder_key(item.key) in resolved)

    handbook_file.placeholder_total = total
    handbook_file.placeholder_resolved = resolved_count
    handbook_file.save(update_fields=["placeholder_total", "placeholder_resolved", "updated_at"])


def _update_handbook_status(handbook: Handbook) -> None:
    files_count = HandbookFile.objects.filter(handbook=handbook).count()
    if files_count == 0:
        handbook.status = Handbook.Status.DRAFT
        handbook.save(update_fields=["status", "updated_at"])
        return

    resolved = _resolved_keys(handbook)
    required = list(
        Placeholder.objects.filter(handbook_file__handbook=handbook, required=True).only("key")
    )
    required_total = len(required)
    required_resolved = sum(1 for item in required if canonicalize_placeholder_key(item.key) in resolved)

    handbook.status = (
        Handbook.Status.READY
        if required_total == required_resolved
        else Handbook.Status.IN_PROGRESS
    )
    handbook.save(update_fields=["status", "updated_at"])


def refresh_handbook_completion(*, handbook: Handbook) -> None:
    for handbook_file in HandbookFile.objects.filter(handbook=handbook).order_by("path_in_handbook"):
        _update_file_completion(handbook, handbook_file)
    _update_handbook_status(handbook)


def _create_snapshot(
    handbook: Handbook,
    *,
    reason: str,
    extra_manifest: dict[str, object] | None = None,
) -> VersionSnapshot:
    latest = handbook.snapshots.order_by("-version_number").first()
    next_version = (latest.version_number if latest else 0) + 1

    files_manifest = [
        {
            "id": str(item.id),
            "path": item.path_in_handbook,
            "checksum": item.checksum,
            "parse_status": item.parse_status,
            "placeholder_total": item.placeholder_total,
            "placeholder_resolved": item.placeholder_resolved,
        }
        for item in HandbookFile.objects.filter(handbook=handbook).order_by("path_in_handbook")
    ]
    values_manifest = [
        {
            "key": item.key,
            "value_text": item.value_text,
            "asset_id": str(item.asset_id) if item.asset_id else None,
            "source": item.source,
            "updated_at": item.updated_at.isoformat(),
        }
        for item in PlaceholderValue.objects.filter(handbook=handbook).order_by("key")
    ]

    manifest = {
        "reason": reason,
        "handbook_status": handbook.status,
        "files": files_manifest,
        "placeholder_values": values_manifest,
    }
    if extra_manifest:
        manifest.update(extra_manifest)

    return VersionSnapshot.objects.create(
        handbook=handbook,
        version_number=next_version,
        manifest=manifest,
    )


def build_handbook_tree(*, handbook: Handbook) -> list[dict[str, object]]:
    rows = list(
        HandbookFile.objects.filter(handbook=handbook)
        .order_by("path_in_handbook")
        .values(
            "id",
            "path_in_handbook",
            "file_type",
            "parse_status",
            "placeholder_total",
            "placeholder_resolved",
        )
    )

    root: dict[str, object] = {"name": "", "path": "", "kind": "folder", "children": []}

    def get_child(parent: dict[str, object], name: str, path: str, kind: str) -> dict[str, object]:
        children = parent["children"]
        for child in children:
            if child["name"] == name and child["kind"] == kind:
                return child
        created: dict[str, object] = {"name": name, "path": path, "kind": kind}
        if kind == "folder":
            created["children"] = []
        children.append(created)
        return created

    for row in rows:
        rel = str(row["path_in_handbook"])
        parts = [part for part in rel.split("/") if part]
        current = root
        for idx, part in enumerate(parts):
            current_path = "/".join(parts[: idx + 1])
            is_file = idx == len(parts) - 1
            if is_file:
                file_node = get_child(current, part, current_path, "file")
                total = int(row["placeholder_total"])
                resolved = int(row["placeholder_resolved"])
                file_node.update(
                    {
                        "id": str(row["id"]),
                        "file_type": row["file_type"],
                        "parse_status": row["parse_status"],
                        "placeholder_total": total,
                        "placeholder_resolved": resolved,
                        "is_complete": total == resolved,
                    }
                )
            else:
                current = get_child(current, part, current_path, "folder")

    def sort_node(node: dict[str, object]) -> None:
        children = node.get("children") or []
        children.sort(key=lambda item: (item["kind"] != "folder", item["name"]))
        for child in children:
            if child["kind"] == "folder":
                sort_node(child)

    sort_node(root)
    return root["children"]


def create_handbook(*, customer_id: str, handbook_type: str) -> Handbook:
    allowed_types = {choice for choice, _label in Handbook.HandbookType.choices}
    if handbook_type not in allowed_types:
        raise HandbookServiceError("Unsupported handbook type")

    if not Client.objects.filter(id=customer_id).exists():
        raise HandbookServiceError("Customer not found")

    handbook = Handbook.objects.create(
        customer_id=customer_id,
        type=handbook_type,
        status=Handbook.Status.DRAFT,
        root_storage_path="",
    )

    root = Path(settings.DOCUMENTS_DATA_ROOT) / "handbooks" / str(handbook.id)
    root.mkdir(parents=True, exist_ok=True)
    handbook.root_storage_path = str(root.resolve())
    handbook.save(update_fields=["root_storage_path", "updated_at"])
    return handbook


@transaction.atomic
def upload_handbook_zip(*, handbook: Handbook, uploaded) -> UploadZipResult:
    filename = str(getattr(uploaded, "name", "")).strip()
    if not filename.lower().endswith(".zip"):
        raise HandbookServiceError("Only .zip uploads are supported")

    root = Path(handbook.root_storage_path)
    root.mkdir(parents=True, exist_ok=True)

    uploads_dir = root / "uploads"
    originals_dir = root / "originals"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    originals_dir.mkdir(parents=True, exist_ok=True)

    uploaded_zip_path = uploads_dir / "original-upload.zip"
    with uploaded_zip_path.open("wb") as handle:
        if hasattr(uploaded, "chunks"):
            for chunk in uploaded.chunks():
                handle.write(chunk)
        else:
            handle.write(uploaded.read())

    HandbookFile.objects.filter(handbook=handbook).delete()
    PlaceholderValue.objects.filter(handbook=handbook).delete()
    VersionSnapshot.objects.filter(handbook=handbook).delete()

    files: list[HandbookFile] = []
    warnings: list[dict[str, str]] = []

    with ZipFile(uploaded_zip_path, "r") as archive:
        infos = archive.infolist()
        if len(infos) > MAX_ZIP_ENTRIES:
            raise HandbookServiceError("ZIP archive has too many entries")

        total_uncompressed = 0

        for info in infos:
            if info.is_dir():
                continue

            safe_path = _safe_zip_path(info.filename)
            if not safe_path:
                warnings.append(
                    {
                        "path": info.filename,
                        "code": "SKIPPED_INVALID_PATH",
                        "message": "Skipped entry with unsafe path",
                    }
                )
                continue

            if _is_junk_entry(safe_path):
                continue

            total_uncompressed += max(0, int(info.file_size))
            if total_uncompressed > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES:
                raise HandbookServiceError("ZIP archive exceeds configured size limit")

            if info.file_size > MAX_ZIP_ENTRY_BYTES:
                warnings.append(
                    {
                        "path": safe_path,
                        "code": "SKIPPED_ENTRY_TOO_LARGE",
                        "message": "Skipped entry because it exceeds size limit",
                    }
                )
                continue

            dest_path = (originals_dir / safe_path).resolve()
            originals_root = originals_dir.resolve()
            if originals_root not in dest_path.parents and dest_path != originals_root:
                warnings.append(
                    {
                        "path": safe_path,
                        "code": "SKIPPED_INVALID_PATH",
                        "message": "Skipped entry with unsafe target path",
                    }
                )
                continue

            dest_path.parent.mkdir(parents=True, exist_ok=True)
            hasher = hashlib.sha256()
            size = 0
            with archive.open(info, "r") as source, dest_path.open("wb") as target:
                while True:
                    chunk = source.read(64 * 1024)
                    if not chunk:
                        break
                    target.write(chunk)
                    hasher.update(chunk)
                    size += len(chunk)

            ext = Path(safe_path).suffix.lower()
            file_type = _file_type_from_ext(ext)
            mime_type = mimetypes.guess_type(safe_path)[0] or "application/octet-stream"

            handbook_file = HandbookFile.objects.create(
                handbook=handbook,
                path_in_handbook=safe_path,
                file_type=file_type,
                original_blob_ref=str(dest_path),
                working_blob_ref="",
                parse_status=HandbookFile.ParseStatus.PENDING,
                checksum=hasher.hexdigest(),
                size=size,
                mime=mime_type,
            )

            if ext in PARSEABLE_EXTS:
                try:
                    payload = dest_path.read_bytes()
                    extracted = extract_placeholders_from_ooxml_bytes(payload, ext)
                    placeholders = [
                        Placeholder(
                            handbook_file=handbook_file,
                            key=key,
                            kind=(Placeholder.Kind.ASSET if key in ASSET_KEYS else Placeholder.Kind.TEXT),
                            required=True,
                            occurrences=len(locations),
                            meta={"locations": locations[:1000]},
                        )
                        for key, locations in sorted(extracted.items())
                    ]
                    if placeholders:
                        Placeholder.objects.bulk_create(placeholders)

                    handbook_file.parse_status = HandbookFile.ParseStatus.PARSED
                    handbook_file.placeholder_total = len(placeholders)
                    handbook_file.placeholder_resolved = 0
                    handbook_file.save(
                        update_fields=[
                            "parse_status",
                            "placeholder_total",
                            "placeholder_resolved",
                            "updated_at",
                        ]
                    )
                except (BadZipFile, ValueError, RuntimeError) as exc:
                    handbook_file.parse_status = HandbookFile.ParseStatus.FAILED
                    handbook_file.parse_error = str(exc)
                    handbook_file.save(update_fields=["parse_status", "parse_error", "updated_at"])
            else:
                handbook_file.parse_status = HandbookFile.ParseStatus.PARSED
                handbook_file.save(update_fields=["parse_status", "updated_at"])

            files.append(handbook_file)

    if files:
        handbook.status = Handbook.Status.IN_PROGRESS
        handbook.save(update_fields=["status", "updated_at"])

    tree = build_handbook_tree(handbook=handbook)
    return UploadZipResult(tree=tree, files=files, warnings=warnings)


def get_file_placeholders(*, handbook: Handbook, handbook_file: HandbookFile) -> dict[str, object]:
    placeholders = list(
        Placeholder.objects.filter(handbook_file=handbook_file).order_by("key")
    )
    value_map = {
        canonicalize_placeholder_key(item.key): item
        for item in PlaceholderValue.objects.filter(handbook=handbook)
    }
    asset_keys = _resolved_asset_keys(handbook)

    payload: list[dict[str, object]] = []
    resolved_count = 0
    for item in placeholders:
        canonical_key = canonicalize_placeholder_key(item.key)
        value = value_map.get(canonical_key)
        value_text = value.value_text if value else None
        asset_id = value.asset_id if value else None

        if item.kind == Placeholder.Kind.ASSET:
            resolved = canonical_key in asset_keys
        else:
            resolved = isinstance(value_text, str) and value_text.strip() != ""
        if resolved:
            resolved_count += 1

        payload.append(
            {
                "id": str(item.id),
                "key": canonical_key,
                "kind": item.kind,
                "required": item.required,
                "occurrences": item.occurrences,
                "meta": item.meta,
                "value_text": value_text,
                "asset_id": str(asset_id) if asset_id else None,
                "resolved": resolved,
            }
        )

    return {
        "file": handbook_file,
        "placeholders": payload,
        "completion": {
            "total": len(placeholders),
            "resolved": resolved_count,
            "is_complete": len(placeholders) == resolved_count,
        },
    }


@transaction.atomic
def save_placeholder_values(
    *,
    handbook: Handbook,
    handbook_file: HandbookFile,
    values: list[dict[str, object]],
    source: str = PlaceholderValue.Source.MANUAL,
) -> dict[str, object]:
    valid_placeholders = {
        canonicalize_placeholder_key(item.key): item
        for item in Placeholder.objects.filter(handbook_file=handbook_file)
    }

    for entry in values:
        key = canonicalize_placeholder_key(str(entry.get("key", "")).strip())
        if not key:
            continue
        if key not in valid_placeholders:
            raise HandbookServiceError(f"Placeholder '{key}' is not part of this file")

        placeholder = valid_placeholders[key]
        value_text_raw = entry.get("value_text")
        if value_text_raw is None:
            value_text_raw = entry.get("value")
        value_text = None if value_text_raw is None else str(value_text_raw)

        asset_id_raw = entry.get("asset_id")

        defaults = {
            "source": source,
            "value_text": value_text,
            "asset_id": asset_id_raw,
        }

        if placeholder.kind == Placeholder.Kind.ASSET:
            defaults["value_text"] = None

        PlaceholderValue.objects.update_or_create(
            handbook=handbook,
            key=key,
            defaults=defaults,
        )

    _update_file_completion(handbook, handbook_file)
    _update_handbook_status(handbook)
    snapshot = _create_snapshot(handbook, reason="save_placeholders")

    return {
        "snapshot": snapshot,
        **get_file_placeholders(handbook=handbook, handbook_file=handbook_file),
    }


def ai_fill_single_placeholder(
    *,
    handbook: Handbook,
    handbook_file: HandbookFile,
    placeholder_key: str,
    current_value: str | None,
    instruction: str,
    language: str,
    context: dict[str, object] | None,
    constraints: dict[str, object] | None,
) -> dict[str, object]:
    canonical_key = canonicalize_placeholder_key(placeholder_key)
    if not Placeholder.objects.filter(handbook_file=handbook_file, key=canonical_key).exists():
        raise HandbookServiceError(f"Placeholder '{canonical_key}' is not part of this file")

    result = fill_variable_value(
        handbook_id=str(handbook.id),
        variable_name=canonical_key,
        current_value=current_value,
        instruction=instruction,
        language=language,
        client_context=context or {},
        constraints=constraints or {},
        variable_description=None,
    )
    return {
        "value": result["value"],
        "usage": result["usage"],
    }


def _load_assets_for_injection(handbook: Handbook) -> dict[str, ResolvedOfficeAsset | None]:
    resolver = StorageAssetResolver()
    assets: dict[str, ResolvedOfficeAsset | None] = {
        CANONICAL_ASSET_LOGO: None,
        CANONICAL_ASSET_SIGNATURE: None,
    }

    for key in [CANONICAL_ASSET_LOGO, CANONICAL_ASSET_SIGNATURE]:
        ref = resolver.resolve(str(handbook.id), key)
        if ref is None:
            continue

        mime_type = (ref.mime_type or "").lower()
        if mime_type == "image/svg+xml":
            # SVG is intentionally unsupported for v1 quality guarantees.
            continue

        payload = resolver.load_buffer(ref)
        size = detect_image_dimensions(payload, mime_type)
        width = size[0] if size else ref.width
        height = size[1] if size else ref.height
        assets[key] = ResolvedOfficeAsset(
            ref=ref,
            payload=payload,
            mime_type=mime_type,
            width=width,
            height=height,
        )

    return assets


def _inject_assets(ext: str, payload: bytes, assets: dict[str, ResolvedOfficeAsset | None]) -> bytes:
    aliases_by_key = {
        CANONICAL_ASSET_LOGO: aliases_for_canonical(CANONICAL_ASSET_LOGO),
        CANONICAL_ASSET_SIGNATURE: aliases_for_canonical(CANONICAL_ASSET_SIGNATURE),
    }

    try:
        if ext == ".docx":
            output, _errors, _occurrences = inject_docx_assets(
                payload=payload,
                aliases_by_key=aliases_by_key,
                assets_by_key=assets,
                fail_on_missing_asset=False,
            )
            return output
        if ext == ".pptx":
            output, _errors, _occurrences = inject_pptx_assets(
                payload=payload,
                aliases_by_key=aliases_by_key,
                assets_by_key=assets,
                fail_on_missing_asset=False,
            )
            return output
        if ext == ".xlsx":
            output, _errors, _occurrences = inject_xlsx_assets(
                payload=payload,
                aliases_by_key=aliases_by_key,
                assets_by_key=assets,
                fail_on_missing_asset=False,
            )
            return output
    except BadZipFile:
        # Payload has the right extension but is not a valid ZIP/OOXML.
        # Return unchanged bytes so the rest of the export can continue.
        logger.warning("_inject_assets: payload is not a valid ZIP (%s), skipping asset injection", ext)
    return payload


def _validate_export_completion(handbook: Handbook) -> None:
    resolved = _resolved_keys(handbook)
    errors: list[dict[str, object]] = []

    for item in (
        Placeholder.objects.filter(handbook_file__handbook=handbook, required=True)
        .select_related("handbook_file")
        .order_by("handbook_file__path_in_handbook", "key")
    ):
        key = canonicalize_placeholder_key(item.key)
        if key in resolved:
            continue
        errors.append(
            {
                "file_id": str(item.handbook_file_id),
                "file_path": item.handbook_file.path_in_handbook,
                "key": key,
                "kind": item.kind,
                "message": f"Missing required placeholder value: {key}",
            }
        )

    if errors:
        raise ExportValidationError(errors)


def _text_values_by_key(handbook: Handbook) -> dict[str, str]:
    values = {}
    for item in PlaceholderValue.objects.filter(handbook=handbook):
        if not isinstance(item.value_text, str):
            continue
        cleaned = item.value_text.strip()
        if cleaned == "":
            continue
        key = canonicalize_placeholder_key(item.key)
        if key in ASSET_KEYS:
            continue
        values[key] = cleaned
    return values


@transaction.atomic
def export_handbook(*, handbook: Handbook) -> tuple[Path, VersionSnapshot]:
    _validate_export_completion(handbook)

    files = list(HandbookFile.objects.filter(handbook=handbook).order_by("path_in_handbook"))
    if not files:
        raise HandbookServiceError("Handbook has no files")

    root = Path(handbook.root_storage_path)
    output_root = root / "output"
    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    text_values = _text_values_by_key(handbook)
    assets = _load_assets_for_injection(handbook)

    for item in files:
        source = Path(item.original_blob_ref)
        if not source.exists():
            raise HandbookServiceError(f"Source file not found: {item.path_in_handbook}")

        target = (output_root / item.path_in_handbook).resolve()
        output_root_resolved = output_root.resolve()
        if output_root_resolved not in target.parents and target != output_root_resolved:
            raise HandbookServiceError(f"Invalid output path: {item.path_in_handbook}")

        target.parent.mkdir(parents=True, exist_ok=True)
        ext = source.suffix.lower()

        if ext not in PARSEABLE_EXTS:
            shutil.copy2(source, target)
            item.working_blob_ref = str(target)
            item.save(update_fields=["working_blob_ref", "updated_at"])
            continue

        payload = source.read_bytes()
        payload = replace_text_placeholders_in_ooxml_bytes(payload, ext, text_values)
        payload = _inject_assets(ext, payload, assets)
        target.write_bytes(payload)

        item.working_blob_ref = str(target)
        item.save(update_fields=["working_blob_ref", "updated_at"])

    exports_dir = root / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)

    latest = handbook.snapshots.order_by("-version_number").first()
    version_hint = (latest.version_number if latest else 0) + 1
    zip_path = exports_dir / f"handbook-{handbook.id}-v{version_hint}.zip"

    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as archive:
        for file_path in sorted(output_root.rglob("*")):
            if file_path.is_dir():
                continue
            arcname = str(file_path.relative_to(output_root))
            archive.write(file_path, arcname)

    handbook.status = Handbook.Status.EXPORTED
    handbook.save(update_fields=["status", "updated_at"])
    snapshot = _create_snapshot(
        handbook,
        reason="export",
        extra_manifest={
            "export_zip_path": str(zip_path),
            "export_filename": zip_path.name,
            "downloadable": True,
        },
    )
    return zip_path, snapshot


def list_snapshots(*, handbook: Handbook) -> list[VersionSnapshot]:
    return list(handbook.snapshots.select_related("handbook").order_by("-version_number"))


def resolve_snapshot_export_path(*, handbook: Handbook, version_number: int) -> Path | None:
    snapshot = VersionSnapshot.objects.filter(
        handbook=handbook,
        version_number=version_number,
    ).first()
    if snapshot is None:
        return None

    root = Path(handbook.root_storage_path).resolve()
    exports_root = (root / "exports").resolve()

    manifest = snapshot.manifest if isinstance(snapshot.manifest, dict) else {}
    export_path_raw = manifest.get("export_zip_path")
    if isinstance(export_path_raw, str) and export_path_raw.strip():
        candidate = Path(export_path_raw.strip())
        if not candidate.is_absolute():
            candidate = (root / candidate).resolve()
        else:
            candidate = candidate.resolve()
        if exports_root in candidate.parents and candidate.exists() and candidate.is_file():
            return candidate

    fallback = exports_root / f"handbook-{handbook.id}-v{snapshot.version_number}.zip"
    if fallback.exists() and fallback.is_file():
        return fallback

    return None


@transaction.atomic
def delete_snapshot(*, handbook: Handbook, version_number: int) -> bool:
    deleted, _ = VersionSnapshot.objects.filter(
        handbook=handbook,
        version_number=version_number,
    ).delete()
    return deleted > 0
