from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Protocol

from django.conf import settings

from documents.models import WorkspaceAsset

from .asset_service import get_active_asset
from .storage import LocalStorage
from .variable_keys import (
    CANONICAL_ASSET_LOGO,
    CANONICAL_ASSET_SIGNATURE,
    canonicalize_variable_key,
)


@dataclass(frozen=True)
class AssetRef:
    id: str
    handbook_id: str
    key: str
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    storage_path: str
    width: int | None = None
    height: int | None = None


class AssetResolverError(ValueError):
    pass


class AssetTooLargeError(AssetResolverError):
    pass


class AssetIntegrityError(AssetResolverError):
    pass


class AssetResolver(Protocol):
    def resolve(self, handbook_id: str, key: str) -> AssetRef | None: ...

    def open_read_stream(self, asset: AssetRef) -> BinaryIO: ...

    def load_buffer(self, asset: AssetRef) -> bytes: ...


class StorageAssetResolver:
    def __init__(self, storage: LocalStorage | None = None) -> None:
        self.storage = storage or LocalStorage()
        self.max_buffer_bytes = int(getattr(settings, "OFFICE_ASSET_MAX_BUFFER_BYTES", 20 * 1024 * 1024))

    def resolve(self, handbook_id: str, key: str) -> AssetRef | None:
        canonical = canonicalize_variable_key(key)
        if canonical == CANONICAL_ASSET_LOGO:
            asset_type = WorkspaceAsset.AssetType.LOGO
        elif canonical == CANONICAL_ASSET_SIGNATURE:
            asset_type = WorkspaceAsset.AssetType.SIGNATURE
        else:
            return None

        asset = get_active_asset(handbook_id=handbook_id, asset_type=asset_type)
        if asset is None:
            return None

        path = Path(asset.file_path)
        size_bytes = path.stat().st_size if path.exists() else 0
        return AssetRef(
            id=str(asset.id),
            handbook_id=asset.handbook_id,
            key=canonical,
            filename=path.name,
            mime_type=asset.mime_type,
            size_bytes=size_bytes,
            sha256=asset.sha256 or "",
            storage_path=asset.file_path,
            width=asset.width,
            height=asset.height,
        )

    def open_read_stream(self, asset: AssetRef) -> BinaryIO:
        return Path(asset.storage_path).open("rb")

    def load_buffer(self, asset: AssetRef) -> bytes:
        path = Path(asset.storage_path)
        hasher = hashlib.sha256()
        total = 0
        chunks: list[bytes] = []
        with self.storage.open_read_stream(path) as stream:
            while True:
                chunk = stream.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > self.max_buffer_bytes:
                    raise AssetTooLargeError(
                        f"Asset '{asset.filename}' exceeds buffer limit ({self.max_buffer_bytes} bytes)"
                    )
                hasher.update(chunk)
                chunks.append(chunk)

        digest = hasher.hexdigest()
        if asset.sha256 and digest != asset.sha256:
            raise AssetIntegrityError(
                f"Asset hash mismatch for '{asset.filename}' ({asset.key})"
            )

        return b"".join(chunks)


def asset_missing_error(
    key: str,
    *,
    start: int | None = None,
    end: int | None = None,
) -> dict[str, object]:
    return {
        "variable": key,
        "error_code": "MISSING_REQUIRED_ASSET",
        "message": f"Missing required asset: {key}",
        "path": key,
        "start": start,
        "end": end,
    }
