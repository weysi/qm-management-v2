from __future__ import annotations

import base64
import binascii
from pathlib import Path
import re

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from documents.models import WorkspaceAsset

from .common import handbook_root, sanitize_relative_path
from .asset_metadata import compute_sha256, detect_image_dimensions
from .storage import LocalStorage


class AssetValidationError(ValueError):
    pass


ALLOWED_ASSET_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".gif"}
ALLOWED_ASSET_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/bmp",
    "image/gif",
}
DATA_URL_PATTERN = re.compile(r"^data:(?P<mime>[-a-zA-Z0-9.+/]+);base64,(?P<data>.+)$")

MIME_EXTENSION_MAP = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/bmp": ".bmp",
    "image/gif": ".gif",
}


def _validate_asset_type(asset_type: str) -> str:
    value = asset_type.strip().lower()
    if value not in {WorkspaceAsset.AssetType.LOGO, WorkspaceAsset.AssetType.SIGNATURE}:
        raise AssetValidationError("asset_type must be logo or signature")
    return value


def _validate_asset_format(*, filename: str, mime_type: str) -> tuple[str, str]:
    ext = Path(filename).suffix.lower()
    if ext == ".svg" or mime_type.lower() == "image/svg+xml":
        raise AssetValidationError(
            "SVG assets are not supported in v1. Please upload PNG/JPG/BMP/GIF."
        )
    if ext not in ALLOWED_ASSET_EXTS:
        raise AssetValidationError("Unsupported asset file type")

    normalized_mime = (mime_type or "").lower().strip() or "application/octet-stream"
    if normalized_mime not in ALLOWED_ASSET_MIME_TYPES:
        raise AssetValidationError("Unsupported asset mime type")
    return ext, normalized_mime


def extension_for_mime(mime_type: str) -> str:
    normalized = (mime_type or "").lower().strip()
    return MIME_EXTENSION_MAP.get(normalized, ".png")


def decode_image_data_url(
    *,
    data_url: str,
    max_bytes: int | None = None,
) -> tuple[bytes, str]:
    raw = (data_url or "").strip()
    if not raw:
        raise AssetValidationError("data_url is required")
    if not raw.startswith("data:"):
        raise AssetValidationError("Expected data URL image payload")

    match = DATA_URL_PATTERN.match(raw)
    if not match:
        raise AssetValidationError("Invalid data_url format")

    mime_type = str(match.group("mime") or "").strip().lower()
    if mime_type not in ALLOWED_ASSET_MIME_TYPES:
        raise AssetValidationError("Unsupported asset mime type")

    encoded = str(match.group("data") or "")
    try:
        payload = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise AssetValidationError("Invalid base64 image payload") from exc

    if not payload:
        raise AssetValidationError("Image payload is empty")

    if max_bytes is not None and len(payload) > max_bytes:
        raise AssetValidationError(
            f"Image payload exceeds configured size limit ({max_bytes} bytes)"
        )

    return payload, mime_type


def asset_download_url(handbook_id: str, asset_type: str) -> str:
    return f"/api/v1/handbooks/{handbook_id}/assets/{asset_type}/download"


def asset_filename(asset: WorkspaceAsset) -> str:
    return Path(asset.file_path).name


def asset_size_bytes(asset: WorkspaceAsset) -> int:
    path = Path(asset.file_path)
    if not path.exists():
        return 0
    return path.stat().st_size


def asset_status(asset: WorkspaceAsset) -> str:
    path = Path(asset.file_path)
    return "READY" if path.exists() else "FAILED"


def is_previewable_image(asset: WorkspaceAsset) -> bool:
    return asset.mime_type.lower().startswith("image/")


def list_assets(handbook_id: str) -> list[WorkspaceAsset]:
    return list(
        WorkspaceAsset.objects.filter(
            handbook_id=handbook_id,
            deleted_at__isnull=True,
        ).order_by("asset_type", "-updated_at")
    )


def get_active_asset(*, handbook_id: str, asset_type: str) -> WorkspaceAsset | None:
    return (
        WorkspaceAsset.objects.filter(
            handbook_id=handbook_id,
            asset_type=_validate_asset_type(asset_type),
            deleted_at__isnull=True,
        )
        .order_by("-updated_at")
        .first()
    )


@transaction.atomic
def save_asset_bytes(
    *,
    handbook_id: str,
    asset_type: str,
    filename: str,
    payload: bytes,
    mime_type: str,
) -> WorkspaceAsset:
    normalized_type = _validate_asset_type(asset_type)
    _ext, normalized_mime = _validate_asset_format(filename=filename, mime_type=mime_type)
    max_bytes = int(getattr(settings, "ASSET_MAX_UPLOAD_BYTES", getattr(settings, "OFFICE_ASSET_MAX_BUFFER_BYTES", 20 * 1024 * 1024)))
    if len(payload) > max_bytes:
        raise AssetValidationError(
            f"Asset exceeds configured size limit ({max_bytes} bytes)"
        )

    safe_name = sanitize_relative_path(filename, filename)
    target = (handbook_root(handbook_id) / "assets" / normalized_type / safe_name).resolve()
    LocalStorage().write_bytes(target, payload)
    sha256 = compute_sha256(payload)
    dimensions = detect_image_dimensions(payload, normalized_mime)
    width, height = dimensions if dimensions else (None, None)

    WorkspaceAsset.objects.filter(
        handbook_id=handbook_id,
        asset_type=normalized_type,
        deleted_at__isnull=True,
    ).update(deleted_at=timezone.now())

    return WorkspaceAsset.objects.create(
        handbook_id=handbook_id,
        asset_type=normalized_type,
        file_path=str(target),
        mime_type=normalized_mime,
        sha256=sha256,
        width=width,
        height=height,
    )


@transaction.atomic
def upload_asset(*, handbook_id: str, asset_type: str, uploaded) -> WorkspaceAsset:
    return save_asset_bytes(
        handbook_id=handbook_id,
        asset_type=asset_type,
        filename=uploaded.name,
        payload=uploaded.read(),
        mime_type=uploaded.content_type or "application/octet-stream",
    )


def save_signature_data_url(
    *,
    handbook_id: str,
    data_url: str,
    filename: str = "signature-canvas.png",
) -> WorkspaceAsset:
    payload, mime_type = decode_image_data_url(
        data_url=data_url,
        max_bytes=int(
            getattr(
                settings,
                "ASSET_MAX_UPLOAD_BYTES",
                getattr(settings, "OFFICE_ASSET_MAX_BUFFER_BYTES", 20 * 1024 * 1024),
            )
        ),
    )
    if mime_type != "image/png":
        raise AssetValidationError("Signature canvas must be exported as PNG")

    return save_asset_bytes(
        handbook_id=handbook_id,
        asset_type=WorkspaceAsset.AssetType.SIGNATURE,
        filename=filename,
        payload=payload,
        mime_type=mime_type,
    )


@transaction.atomic
def soft_delete_asset(*, handbook_id: str, asset_type: str) -> WorkspaceAsset | None:
    asset = get_active_asset(handbook_id=handbook_id, asset_type=asset_type)
    if asset is None:
        return None
    asset.deleted_at = timezone.now()
    asset.save(update_fields=["deleted_at", "updated_at"])
    return asset
