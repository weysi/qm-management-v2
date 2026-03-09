from __future__ import annotations

from dataclasses import dataclass
import hashlib
from io import BytesIO
import json
import logging
import mimetypes
from pathlib import Path, PurePosixPath
import re
import shutil
from typing import Callable
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from django.conf import settings
from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone

from clients.models import Client
from documents.models import (
    Handbook,
    HandbookFile,
    Placeholder,
    PlaceholderGenerationAudit,
    PlaceholderParseCache,
    PlaceholderValue,
    VersionSnapshot,
)

from .compose_service import (
    quick_fill_placeholder_value,
    serialize_audit_summary,
    suggested_mode_for_placeholder,
    suggested_output_class_for_placeholder,
    supported_capabilities_for_placeholder,
)
from .asset_resolver import StorageAssetResolver
from .asset_service import (
    AssetValidationError,
    decode_image_data_url,
    extension_for_mime,
    get_active_asset,
    save_asset_bytes,
)
from .asset_metadata import detect_image_dimensions
from .inject_docx import inject_docx_assets
from .inject_pptx import inject_pptx_assets
from .inject_xlsx import inject_xlsx_assets
from .office_asset_types import ResolvedOfficeAsset
from .placeholder_normalization import (
    canonicalize_placeholder_key as normalize_placeholder_key,
    is_current_date_placeholder,
)
from .storage import LocalFilesystemStorage
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

PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")
LEGACY_ASSET_PATTERN = re.compile(
    r"(?<!\\)(\[(LOGO|SIGNATURE)\]|__ASSET_(LOGO|SIGNATURE)__)",
    re.IGNORECASE,
)

OOXML_PART_PREFIXES = {
    ".docx": ("word/",),
    ".pptx": ("ppt/",),
    ".xlsx": ("xl/",),
}

CLIENT_TEXT_VALUE_GETTERS: dict[str, Callable[[Client], str]] = {
    "client.name": lambda customer: customer.name,
    "company.name": lambda customer: customer.name,
    "company_name": lambda customer: customer.name,
    "client.address": lambda customer: customer.address,
    "company.address": lambda customer: customer.address,
    "company_address": lambda customer: customer.address,
    "client.zip_city": lambda customer: customer.zip_city,
    "client.zipcity": lambda customer: customer.zip_city,
    "company.zip_city": lambda customer: customer.zip_city,
    "company.zipcity": lambda customer: customer.zip_city,
    "company_zip_city": lambda customer: customer.zip_city,
    "people.ceo": lambda customer: customer.ceo,
    "ceo_name": lambda customer: customer.ceo,
    "gf_name": lambda customer: customer.ceo,
    "people.qm_manager": lambda customer: customer.qm_manager,
    "people.qmmanager": lambda customer: customer.qm_manager,
    "qm_manager_name": lambda customer: customer.qm_manager,
    "employee_count": lambda customer: str(customer.employee_count),
    "company.employee_count": lambda customer: str(customer.employee_count),
    "products": lambda customer: customer.products,
    "company.products": lambda customer: customer.products,
    "services": lambda customer: customer.services,
    "company.services": lambda customer: customer.services,
    "industry": lambda customer: customer.industry,
    "company.industry": lambda customer: customer.industry,
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
    return normalize_placeholder_key(raw)


def _decode_zip_entry_filename(info) -> str:
    """Correctly decode a ZIP entry filename.

    Handles non-UTF-8 Windows encodings for ZIP archives with German filenames.
    Python's ZipFile decodes filenames as UTF-8 when the language encoding flag
    (bit 11) is set, and as CP437 otherwise. ZIP files created by German
    Windows tools often encode filenames in CP1252 without setting that flag,
    causing CP437 decoding to produce garbled characters.

    This function re-encodes the CP437-decoded string back to raw bytes,
    then attempts UTF-8 before falling back to CP1252.
    """
    if info.flag_bits & 0x800:
        # Python already decoded this correctly as UTF-8.
        return info.filename

    try:
        raw = info.filename.encode("cp437")
    except (UnicodeEncodeError, LookupError):
        return info.filename

    # Try UTF-8 first – some modern tools write UTF-8 without the flag.
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        pass

    # Fall back to CP1252 (Windows-1252), the dominant encoding for Western
    # European (including German) Windows ZIP tools that don't use UTF-8.
    try:
        return raw.decode("cp1252")
    except (UnicodeDecodeError, LookupError):
        pass

    return info.filename


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


def _update_file_completion(
    handbook: Handbook,
    handbook_file: HandbookFile,
    *,
    resolved_keys: set[str] | None = None,
) -> None:
    placeholders = list(Placeholder.objects.filter(handbook_file=handbook_file).only("key"))
    resolved = resolved_keys if resolved_keys is not None else _resolved_keys(handbook)
    total = len(placeholders)
    resolved_count = sum(1 for item in placeholders if canonicalize_placeholder_key(item.key) in resolved)

    if (
        handbook_file.placeholder_total == total
        and handbook_file.placeholder_resolved == resolved_count
    ):
        return

    handbook_file.placeholder_total = total
    handbook_file.placeholder_resolved = resolved_count
    handbook_file.save(update_fields=["placeholder_total", "placeholder_resolved", "updated_at"])


def _update_handbook_status(handbook: Handbook, *, resolved_keys: set[str] | None = None) -> None:
    files_count = HandbookFile.objects.filter(handbook=handbook).count()
    if files_count == 0:
        if handbook.status != Handbook.Status.DRAFT:
            handbook.status = Handbook.Status.DRAFT
            handbook.save(update_fields=["status", "updated_at"])
        return

    resolved = resolved_keys if resolved_keys is not None else _resolved_keys(handbook)
    required = list(
        Placeholder.objects.filter(handbook_file__handbook=handbook, required=True).only("key")
    )
    required_total = len(required)
    required_resolved = sum(1 for item in required if canonicalize_placeholder_key(item.key) in resolved)

    current = handbook.status
    next_status = (
        Handbook.Status.READY
        if required_total == required_resolved
        else Handbook.Status.IN_PROGRESS
    )
    if next_status != current:
        handbook.status = next_status
        handbook.save(update_fields=["status", "updated_at"])


def refresh_handbook_completion(*, handbook: Handbook) -> None:
    resolved = _resolved_keys(handbook)
    for handbook_file in HandbookFile.objects.filter(handbook=handbook).order_by("path_in_handbook"):
        _update_file_completion(handbook, handbook_file, resolved_keys=resolved)
    _update_handbook_status(handbook, resolved_keys=resolved)


def list_handbook_file_groups_for_client(*, customer_id: str) -> list[dict[str, object]]:
    handbooks = list(
        Handbook.objects.filter(customer_id=customer_id)
        .order_by("-created_at")
        .prefetch_related(
            Prefetch(
                "files",
                queryset=HandbookFile.objects.order_by("path_in_handbook"),
            )
        )
    )

    groups: list[dict[str, object]] = []
    for handbook in handbooks:
        files = list(handbook.files.all())
        if not files:
            continue

        groups.append(
            {
                "handbook_id": str(handbook.id),
                "handbook_type": handbook.type,
                "handbook_status": handbook.status,
                "handbook_created_at": handbook.created_at.isoformat(),
                "handbook_updated_at": handbook.updated_at.isoformat(),
                "file_count": len(files),
                "files": [
                    {
                        "id": str(item.id),
                        "path_in_handbook": item.path_in_handbook,
                        "file_type": item.file_type,
                        "parse_status": item.parse_status,
                        "placeholder_total": item.placeholder_total,
                        "placeholder_resolved": item.placeholder_resolved,
                        "size": item.size,
                        "mime": item.mime,
                        "created_at": item.created_at.isoformat(),
                        "updated_at": item.updated_at.isoformat(),
                        "deletable": True,
                    }
                    for item in files
                ],
            }
        )

    return groups


def _cleanup_orphan_placeholder_values(*, handbook: Handbook) -> None:
    remaining_keys = {
        canonicalize_placeholder_key(item.key)
        for item in Placeholder.objects.filter(handbook_file__handbook=handbook).only("key")
    }
    orphan_value_ids = [
        item.id
        for item in PlaceholderValue.objects.filter(handbook=handbook).only("id", "key")
        if canonicalize_placeholder_key(item.key) not in remaining_keys
    ]
    if orphan_value_ids:
        PlaceholderValue.objects.filter(id__in=orphan_value_ids).delete()


def _delete_file_from_storage(*, root: Path, path_value: str) -> None:
    cleaned = str(path_value or "").strip()
    if not cleaned:
        return

    path = Path(cleaned)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        return

    for parent in path.parents:
        if parent == root:
            break
        try:
            parent.rmdir()
        except OSError:
            break


@transaction.atomic
def delete_handbook_file(*, handbook: Handbook, handbook_file_id: str) -> HandbookFile:
    handbook_file = HandbookFile.objects.filter(id=handbook_file_id, handbook=handbook).first()
    if handbook_file is None:
        raise HandbookServiceError("Handbook file not found")

    root = Path(handbook.root_storage_path or "")
    original_blob_ref = handbook_file.original_blob_ref
    working_blob_ref = handbook_file.working_blob_ref
    deleted_file = handbook_file
    handbook_file.delete()

    _cleanup_orphan_placeholder_values(handbook=handbook)
    refresh_handbook_completion(handbook=handbook)

    if root.exists():
        _delete_file_from_storage(root=root, path_value=original_blob_ref)
        if working_blob_ref and working_blob_ref != original_blob_ref:
            _delete_file_from_storage(root=root, path_value=working_blob_ref)

    return deleted_file


@transaction.atomic
def delete_handbook(*, handbook: Handbook) -> Handbook:
    deleted = handbook
    root_path = Path(handbook.root_storage_path or "")
    handbook.delete()

    if root_path.exists():
        try:
            shutil.rmtree(root_path)
        except OSError:
            logger.warning(
                "Failed to remove handbook storage directory %s",
                root_path,
                exc_info=True,
            )

    return deleted


def _stable_sha256(value: str) -> str:
    if value == "":
        return ""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _build_completion_state(
    handbook: Handbook,
) -> tuple[dict[str, object], str]:
    required_placeholders = list(
        Placeholder.objects.filter(handbook_file__handbook=handbook, required=True)
        .select_related("handbook_file")
        .order_by("handbook_file__path_in_handbook", "key")
    )
    value_map = {
        canonicalize_placeholder_key(item.key): item
        for item in PlaceholderValue.objects.filter(handbook=handbook)
    }
    active_assets = {
        CANONICAL_ASSET_LOGO: get_active_asset(handbook_id=str(handbook.id), asset_type="logo"),
        CANONICAL_ASSET_SIGNATURE: get_active_asset(handbook_id=str(handbook.id), asset_type="signature"),
    }

    files_completion: dict[str, dict[str, object]] = {}
    placeholder_fingerprints: list[dict[str, object]] = []

    required_total = 0
    required_resolved = 0

    for placeholder in required_placeholders:
        required_total += 1
        file_id = str(placeholder.handbook_file_id)
        file_state = files_completion.get(file_id)
        if file_state is None:
            file_state = {
                "file_id": file_id,
                "path": placeholder.handbook_file.path_in_handbook,
                "required_total": 0,
                "required_resolved": 0,
            }
            files_completion[file_id] = file_state
        file_state["required_total"] = int(file_state["required_total"]) + 1

        key = canonicalize_placeholder_key(placeholder.key)
        value_hash = ""
        asset_id: str | None = None
        is_resolved = False

        if placeholder.kind == Placeholder.Kind.ASSET:
            asset = active_assets.get(key)
            if asset is not None:
                is_resolved = True
                value_hash = asset.sha256 or str(asset.id)
                asset_id = str(asset.id)
        else:
            value = value_map.get(key)
            text = ""
            if value is not None and isinstance(value.value_text, str):
                text = value.value_text.strip()
            if text:
                is_resolved = True
                value_hash = _stable_sha256(text)

        if is_resolved:
            required_resolved += 1
            file_state["required_resolved"] = int(file_state["required_resolved"]) + 1

        placeholder_fingerprints.append(
            {
                "file_id": file_id,
                "key": key,
                "kind": placeholder.kind,
                "required": True,
                "resolved": is_resolved,
                "value_hash": value_hash,
                "asset_id": asset_id,
            }
        )

    files = list(HandbookFile.objects.filter(handbook=handbook).order_by("path_in_handbook"))
    file_checksums = [
        {
            "file_id": str(item.id),
            "path": item.path_in_handbook,
            "checksum": item.checksum,
            "file_type": item.file_type,
        }
        for item in files
    ]

    completion_files: list[dict[str, object]] = []
    for item in files:
        base = files_completion.get(str(item.id))
        if base is None:
            completion_files.append(
                {
                    "file_id": str(item.id),
                    "path": item.path_in_handbook,
                    "required_total": 0,
                    "required_resolved": 0,
                    "is_complete_required": True,
                }
            )
            continue
        required_file_total = int(base["required_total"])
        required_file_resolved = int(base["required_resolved"])
        completion_files.append(
            {
                "file_id": str(item.id),
                "path": item.path_in_handbook,
                "required_total": required_file_total,
                "required_resolved": required_file_resolved,
                "is_complete_required": required_file_total == required_file_resolved,
            }
        )

    hash_payload = {
        "required_total": required_total,
        "required_resolved": required_resolved,
        "placeholders": [
            {
                "file_id": item["file_id"],
                "key": item["key"],
                "kind": item["kind"],
                "value_hash": item["value_hash"],
                "asset_id": item["asset_id"],
            }
            for item in placeholder_fingerprints
        ],
        "files": [
            {"path": item["path"], "checksum": item["checksum"]}
            for item in file_checksums
        ],
    }
    digest = hashlib.sha256(
        json.dumps(hash_payload, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    summary = {
        "handbook_id": str(handbook.id),
        "required_total": required_total,
        "required_resolved": required_resolved,
        "is_complete_required": required_total == required_resolved,
        "files": completion_files,
        "placeholders": placeholder_fingerprints,
        "file_checksums": file_checksums,
        "completion_hash": digest,
    }
    return summary, digest


def get_handbook_completion_summary(*, handbook: Handbook) -> dict[str, object]:
    summary, _digest = _build_completion_state(handbook)
    return summary


@transaction.atomic
def create_snapshot_from_current_state(
    *,
    handbook: Handbook,
    created_by: str = "user",
    reason: str = "manual_completion",
) -> tuple[VersionSnapshot, bool]:
    Handbook.objects.select_for_update().filter(id=handbook.id).exists()
    completion, digest = _build_completion_state(handbook)
    if not bool(completion["is_complete_required"]):
        raise HandbookServiceError("Cannot create version: required placeholders are not complete")

    latest = handbook.snapshots.order_by("-version_number").first()
    latest_manifest = latest.manifest if latest and isinstance(latest.manifest, dict) else {}
    if latest and latest_manifest.get("completion_hash") == digest:
        return latest, False

    snapshot = _create_snapshot(
        handbook,
        reason=reason,
        extra_manifest={
            "created_by": created_by,
            "created_at": timezone.now().isoformat(),
            "completion_hash": digest,
            "required_total": completion["required_total"],
            "required_resolved": completion["required_resolved"],
            "is_complete_required": completion["is_complete_required"],
            "completion_files": completion["files"],
            "required_placeholders": completion["placeholders"],
            "file_checksums": completion["file_checksums"],
        },
    )
    return snapshot, True


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


def _build_client_text_values(customer: Client) -> dict[str, str]:
    values: dict[str, str] = {}
    for alias, getter in CLIENT_TEXT_VALUE_GETTERS.items():
        try:
            raw = getter(customer)
        except Exception:  # noqa: BLE001
            continue
        if raw is None:
            continue
        cleaned = str(raw).strip()
        if not cleaned:
            continue
        values[canonicalize_placeholder_key(alias)] = cleaned
    return values


def _placeholder_keys_for_handbook(handbook: Handbook) -> set[str]:
    return {
        canonicalize_placeholder_key(item)
        for item in Placeholder.objects.filter(handbook_file__handbook=handbook).values_list("key", flat=True)
    }


def _existing_placeholder_values(handbook: Handbook) -> dict[str, PlaceholderValue]:
    return {
        canonicalize_placeholder_key(item.key): item
        for item in PlaceholderValue.objects.filter(handbook=handbook)
    }


def _import_asset_from_client_data_url(
    *,
    handbook: Handbook,
    asset_type: str,
    data_url: str,
    decode_cache: dict[str, tuple[bytes, str, str]],
):
    if asset_type in decode_cache:
        payload, mime_type, ext = decode_cache[asset_type]
    else:
        max_inline_bytes = int(getattr(settings, "CLIENT_ASSET_MAX_INLINE_BYTES", 2 * 1024 * 1024))
        payload, mime_type = decode_image_data_url(
            data_url=data_url,
            max_bytes=max_inline_bytes,
        )
        ext = extension_for_mime(mime_type)
        decode_cache[asset_type] = (payload, mime_type, ext)

    filename = f"client-{asset_type}-import{ext}"
    return save_asset_bytes(
        handbook_id=str(handbook.id),
        asset_type=asset_type,
        filename=filename,
        payload=payload,
        mime_type=mime_type,
    )


def _current_date_value() -> str:
    return timezone.localdate().strftime("%d.%m.%Y")


def _build_system_default_values(*, handbook: Handbook) -> dict[str, str]:
    values: dict[str, str] = {}
    placeholders = Placeholder.objects.filter(handbook_file__handbook=handbook).only("key", "meta")

    for placeholder in placeholders:
        key = canonicalize_placeholder_key(placeholder.key)
        if key in ASSET_KEYS or not key:
            continue

        raw_locations = []
        if isinstance(placeholder.meta, dict):
            locations = placeholder.meta.get("locations", [])
            if isinstance(locations, list):
                raw_locations = [
                    str(item.get("raw", "")).strip()
                    for item in locations
                    if isinstance(item, dict)
                ]

        if is_current_date_placeholder(
            raw=raw_locations[0] if raw_locations else None,
            canonical_key=key,
        ):
            values[key] = _current_date_value()

    return values


def sync_asset_placeholder_value(
    *,
    handbook: Handbook,
    asset_type: str,
    source: str = PlaceholderValue.Source.MANUAL,
) -> None:
    if asset_type == "logo":
        key = CANONICAL_ASSET_LOGO
    elif asset_type == "signature":
        key = CANONICAL_ASSET_SIGNATURE
    else:
        raise HandbookServiceError(f"Unsupported asset_type '{asset_type}'")

    placeholder_exists = Placeholder.objects.filter(
        handbook_file__handbook=handbook,
        key=key,
    ).exists()
    existing = PlaceholderValue.objects.filter(handbook=handbook, key=key).first()
    asset = get_active_asset(handbook_id=str(handbook.id), asset_type=asset_type)

    if not placeholder_exists and existing is None:
        return

    if asset is None:
        if existing is None:
            return
        existing.value_text = None
        existing.asset_id = None
        existing.source = source
        existing.last_generation_audit = None
        existing.save(
            update_fields=[
                "value_text",
                "asset_id",
                "source",
                "last_generation_audit",
                "updated_at",
            ]
        )
        return

    defaults = {
        "value_text": None,
        "asset_id": asset.id,
        "source": source,
        "last_generation_audit": None,
    }
    if existing is None:
        PlaceholderValue.objects.create(
            handbook=handbook,
            key=key,
            **defaults,
        )
        return

    existing.value_text = None
    existing.asset_id = asset.id
    existing.source = source
    existing.last_generation_audit = None
    existing.save(
        update_fields=[
            "value_text",
            "asset_id",
            "source",
            "last_generation_audit",
            "updated_at",
        ]
    )


def autofill_placeholders_from_client(*, handbook: Handbook) -> None:
    customer = handbook.customer
    placeholder_keys = _placeholder_keys_for_handbook(handbook)
    if not placeholder_keys:
        return

    existing_values = _existing_placeholder_values(handbook)
    client_text_values = _build_client_text_values(customer)
    default_values = {
        **client_text_values,
        **_build_system_default_values(handbook=handbook),
    }

    for key in sorted(placeholder_keys):
        if key in ASSET_KEYS:
            continue

        imported_value = default_values.get(key)
        if imported_value is None:
            continue

        existing = existing_values.get(key)
        if existing is not None and isinstance(existing.value_text, str) and existing.value_text.strip():
            if existing.source == PlaceholderValue.Source.MANUAL:
                continue
            if (
                existing.source == PlaceholderValue.Source.IMPORTED
                and existing.value_text.strip() == imported_value
            ):
                continue

        if existing is None:
            created = PlaceholderValue.objects.create(
                handbook=handbook,
                key=key,
                value_text=imported_value,
                asset_id=None,
                source=PlaceholderValue.Source.IMPORTED,
            )
            existing_values[key] = created
            continue

        existing.value_text = imported_value
        existing.asset_id = None
        existing.source = PlaceholderValue.Source.IMPORTED
        existing.save(update_fields=["value_text", "asset_id", "source", "updated_at"])

    decode_cache: dict[str, tuple[bytes, str, str]] = {}
    asset_inputs = {
        CANONICAL_ASSET_LOGO: ("logo", customer.logo_url),
        CANONICAL_ASSET_SIGNATURE: ("signature", customer.signature_url),
    }
    for key, (asset_type, data_url) in asset_inputs.items():
        if key not in placeholder_keys:
            continue

        existing = existing_values.get(key)
        if existing is not None and existing.asset_id is not None:
            continue

        asset = get_active_asset(handbook_id=str(handbook.id), asset_type=asset_type)
        if asset is None and isinstance(data_url, str) and data_url.strip():
            try:
                asset = _import_asset_from_client_data_url(
                    handbook=handbook,
                    asset_type=asset_type,
                    data_url=data_url,
                    decode_cache=decode_cache,
                )
            except AssetValidationError as exc:
                logger.warning(
                    "Skipping invalid client %s asset for handbook %s: %s",
                    asset_type,
                    handbook.id,
                    exc,
                )
                continue

        if asset is None:
            continue

        sync_asset_placeholder_value(
            handbook=handbook,
            asset_type=asset_type,
            source=PlaceholderValue.Source.IMPORTED,
        )


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

            decoded_name = _decode_zip_entry_filename(info)
            safe_path = _safe_zip_path(decoded_name)
            if not safe_path:
                warnings.append(
                    {
                        "path": decoded_name,
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
                    cache_entry = PlaceholderParseCache.objects.filter(
                        checksum=hasher.hexdigest(),
                        file_type=file_type,
                    ).first()
                    extracted: dict[str, list[dict[str, object]]]
                    if cache_entry and isinstance(cache_entry.placeholders, dict):
                        extracted = {
                            str(key): list(value) if isinstance(value, list) else []
                            for key, value in cache_entry.placeholders.items()
                        }
                    else:
                        payload = dest_path.read_bytes()
                        extracted = extract_placeholders_from_ooxml_bytes(payload, ext)
                        PlaceholderParseCache.objects.update_or_create(
                            checksum=hasher.hexdigest(),
                            file_type=file_type,
                            defaults={"placeholders": extracted},
                        )
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
        autofill_placeholders_from_client(handbook=handbook)
        refresh_handbook_completion(handbook=handbook)

    files = list(HandbookFile.objects.filter(handbook=handbook).order_by("path_in_handbook"))
    tree = build_handbook_tree(handbook=handbook)
    return UploadZipResult(tree=tree, files=files, warnings=warnings)


def get_file_placeholders(*, handbook: Handbook, handbook_file: HandbookFile) -> dict[str, object]:
    placeholders = list(
        Placeholder.objects.filter(handbook_file=handbook_file).order_by("key")
    )
    value_map = {
        canonicalize_placeholder_key(item.key): item
        for item in PlaceholderValue.objects.filter(handbook=handbook).select_related("last_generation_audit")
    }
    latest_audits: dict[str, PlaceholderGenerationAudit] = {}
    for audit in (
        PlaceholderGenerationAudit.objects.filter(placeholder__in=placeholders)
        .select_related("placeholder")
        .order_by("placeholder_id", "-created_at")
    ):
        latest_audits.setdefault(str(audit.placeholder_id), audit)
    asset_keys = _resolved_asset_keys(handbook)

    payload: list[dict[str, object]] = []
    resolved_count = 0
    for item in placeholders:
        canonical_key = canonicalize_placeholder_key(item.key)
        value = value_map.get(canonical_key)
        value_text = value.value_text if value else None
        asset_id = value.asset_id if value else None
        latest_audit = None
        if value and value.last_generation_audit_id and value.last_generation_audit and value.last_generation_audit.placeholder_id == item.id:
            latest_audit = value.last_generation_audit
        if latest_audit is None:
            latest_audit = latest_audits.get(str(item.id))

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
                "source": value.source if value else None,
                "resolved": resolved,
                "latest_audit": serialize_audit_summary(latest_audit),
                "suggested_mode": suggested_mode_for_placeholder(placeholder=item, handbook_file=handbook_file),
                "suggested_output_class": suggested_output_class_for_placeholder(
                    placeholder=item,
                    handbook_file=handbook_file,
                ),
                "supported_capabilities": supported_capabilities_for_placeholder(
                    placeholder=item,
                    handbook_file=handbook_file,
                ),
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
    source_choices = {choice for choice, _label in PlaceholderValue.Source.choices}
    valid_placeholders = {
        canonicalize_placeholder_key(item.key): item
        for item in Placeholder.objects.filter(handbook_file=handbook_file)
    }
    requested_audit_ids = {
        str(entry.get("audit_id", "") or "").strip()
        for entry in values
        if str(entry.get("audit_id", "") or "").strip()
    }
    audits_by_id = {
        str(item.id): item
        for item in PlaceholderGenerationAudit.objects.filter(
            id__in=requested_audit_ids,
            handbook=handbook,
        )
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

        asset_id_raw = entry.get("asset_id") or None
        audit_id_raw = str(entry.get("audit_id", "") or "").strip()
        entry_source = str(entry.get("source", source)).strip().upper() or source
        if entry_source not in source_choices:
            raise HandbookServiceError(f"Unsupported placeholder source '{entry_source}'")
        audit = audits_by_id.get(audit_id_raw) if audit_id_raw else None
        if audit is not None and audit.placeholder_id != placeholder.id:
            raise HandbookServiceError("audit_id does not belong to the provided placeholder")

        defaults = {
            "source": entry_source,
            "value_text": value_text,
            "asset_id": asset_id_raw,
            "last_generation_audit": audit,
        }

        if placeholder.kind == Placeholder.Kind.ASSET:
            defaults["value_text"] = None

        PlaceholderValue.objects.update_or_create(
            handbook=handbook,
            key=key,
            defaults=defaults,
        )

    resolved = _resolved_keys(handbook)
    _update_file_completion(handbook, handbook_file, resolved_keys=resolved)
    _update_handbook_status(handbook, resolved_keys=resolved)
    completion_summary = get_handbook_completion_summary(handbook=handbook)

    return {
        "snapshot": None,
        "handbook_completion": completion_summary,
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
    placeholder = Placeholder.objects.filter(handbook_file=handbook_file, key=canonical_key).first()
    if placeholder is None:
        raise HandbookServiceError(f"Placeholder '{canonical_key}' is not part of this file")

    result = quick_fill_placeholder_value(
        handbook=handbook,
        handbook_file=handbook_file,
        placeholder=placeholder,
        current_value=current_value,
        instruction=instruction,
        language=language,
        user_context=context or {},
        constraints=constraints or {},
    )
    return {
        "value": result.value,
        "mode": result.mode,
        "output_class": result.output_class,
        "usage": result.usage,
        "model": result.model,
        "audit": serialize_audit_summary(result.audit),
        "trace": result.trace,
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

    completion_summary, completion_hash = _build_completion_state(handbook)
    handbook.status = Handbook.Status.EXPORTED
    handbook.save(update_fields=["status", "updated_at"])
    snapshot = _create_snapshot(
        handbook,
        reason="export",
        extra_manifest={
            "export_zip_path": str(zip_path),
            "export_filename": zip_path.name,
            "downloadable": True,
            "completion_hash": completion_hash,
            "required_total": completion_summary["required_total"],
            "required_resolved": completion_summary["required_resolved"],
            "is_complete_required": completion_summary["is_complete_required"],
            "completion_files": completion_summary["files"],
            "file_checksums": completion_summary["file_checksums"],
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
