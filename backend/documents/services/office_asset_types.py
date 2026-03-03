from __future__ import annotations

from dataclasses import dataclass

from .asset_resolver import AssetRef


@dataclass(frozen=True)
class ResolvedOfficeAsset:
    ref: AssetRef
    payload: bytes
    mime_type: str
    width: int | None
    height: int | None
