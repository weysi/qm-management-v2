from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import mimetypes
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile, ZipFile

from .common import SUPPORTED_IMAGE_EXTS, SUPPORTED_TEMPLATE_EXTS, sanitize_relative_path

MAX_ZIP_ENTRIES = 500
MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_ZIP_ENTRY_BYTES = 25 * 1024 * 1024


@dataclass(frozen=True)
class ZipTemplateEntry:
    relative_path: str
    filename: str
    payload: bytes
    mime_type: str


@dataclass(frozen=True)
class ZipAssetEntry:
    asset_type: str
    filename: str
    payload: bytes
    mime_type: str


@dataclass(frozen=True)
class ZipIngestionResult:
    templates: tuple[ZipTemplateEntry, ...]
    assets: tuple[ZipAssetEntry, ...]
    warnings: tuple[dict[str, str], ...]


def _warning(path: str, code: str, message: str) -> dict[str, str]:
    return {"path": path, "code": code, "message": message}


def _safe_zip_path(name: str) -> str | None:
    posix = PurePosixPath(name.replace("\\", "/"))
    if posix.is_absolute():
        return None
    safe_parts = []
    for part in posix.parts:
        if part in {"", "."}:
            continue
        if part == "..":
            return None
        safe_parts.append(part)
    if not safe_parts:
        return None
    return "/".join(safe_parts)


def _guess_mime_type(filename: str) -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"


def _detect_asset_type(filename: str) -> str | None:
    stem = Path(filename).stem.strip().lower()
    if not stem:
        return None
    if stem.startswith("logo"):
        return "logo"
    if stem.startswith("signature") or stem.startswith("signatur"):
        return "signature"
    return None


def inspect_zip_payload(filename: str, payload: bytes) -> ZipIngestionResult:
    templates: dict[str, ZipTemplateEntry] = {}
    assets: dict[str, ZipAssetEntry] = {}
    warnings: list[dict[str, str]] = []

    try:
        archive = ZipFile(BytesIO(payload), "r")
    except BadZipFile as exc:
        raise BadZipFile(f"Invalid zip file: {filename}") from exc

    with archive:
        infos = archive.infolist()
        if len(infos) > MAX_ZIP_ENTRIES:
            raise BadZipFile("ZIP archive has too many entries")

        total_uncompressed = 0
        for info in infos:
            if info.is_dir():
                continue

            original_name = info.filename
            safe_name = _safe_zip_path(original_name)
            if not safe_name:
                warnings.append(
                    _warning(
                        original_name,
                        "SKIPPED_INVALID_PATH",
                        "Skipped entry with invalid or unsafe path",
                    )
                )
                continue

            total_uncompressed += max(0, int(info.file_size))
            if total_uncompressed > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES:
                raise BadZipFile("ZIP archive exceeds total size limit")
            if info.file_size > MAX_ZIP_ENTRY_BYTES:
                warnings.append(
                    _warning(
                        safe_name,
                        "SKIPPED_ENTRY_TOO_LARGE",
                        "Skipped entry because it exceeds size limit",
                    )
                )
                continue

            entry_payload = archive.read(info)
            ext = Path(safe_name).suffix.lower()
            mime_type = _guess_mime_type(safe_name)

            if ext in SUPPORTED_TEMPLATE_EXTS:
                rel_path = sanitize_relative_path(safe_name, Path(safe_name).name)
                if rel_path in templates:
                    warnings.append(
                        _warning(
                            rel_path,
                            "SKIPPED_DUPLICATE_TEMPLATE",
                            "Skipped duplicate template path in archive",
                        )
                    )
                    continue
                templates[rel_path] = ZipTemplateEntry(
                    relative_path=rel_path,
                    filename=Path(rel_path).name,
                    payload=entry_payload,
                    mime_type=mime_type,
                )
                continue

            if ext in SUPPORTED_IMAGE_EXTS:
                asset_type = _detect_asset_type(safe_name)
                if not asset_type:
                    warnings.append(
                        _warning(
                            safe_name,
                            "SKIPPED_UNMAPPED_IMAGE",
                            "Skipped image because it does not match logo/signature naming",
                        )
                    )
                    continue
                assets[asset_type] = ZipAssetEntry(
                    asset_type=asset_type,
                    filename=Path(safe_name).name,
                    payload=entry_payload,
                    mime_type=mime_type,
                )
                continue

            warnings.append(
                _warning(
                    safe_name,
                    "SKIPPED_UNSUPPORTED_FILE",
                    "Skipped unsupported file inside ZIP",
                )
            )

    return ZipIngestionResult(
        templates=tuple(templates.values()),
        assets=tuple(assets.values()),
        warnings=tuple(warnings),
    )
