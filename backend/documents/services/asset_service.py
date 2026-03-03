from __future__ import annotations

from pathlib import Path

from django.db import transaction
from django.utils import timezone

from documents.models import WorkspaceAsset

from .common import handbook_root, sanitize_relative_path
from .storage import LocalStorage


class AssetValidationError(ValueError):
    pass


def list_assets(handbook_id: str) -> list[WorkspaceAsset]:
    return list(
        WorkspaceAsset.objects.filter(
            handbook_id=handbook_id,
            deleted_at__isnull=True,
        ).order_by("asset_type", "-updated_at")
    )


@transaction.atomic
def upload_asset(*, handbook_id: str, asset_type: str, uploaded) -> WorkspaceAsset:
    if asset_type not in {WorkspaceAsset.AssetType.LOGO, WorkspaceAsset.AssetType.SIGNATURE}:
        raise AssetValidationError("asset_type must be logo or signature")

    filename = sanitize_relative_path(uploaded.name, uploaded.name)
    target = (handbook_root(handbook_id) / "assets" / asset_type / filename).resolve()
    LocalStorage().write_bytes(target, uploaded.read())

    WorkspaceAsset.objects.filter(
        handbook_id=handbook_id,
        asset_type=asset_type,
        deleted_at__isnull=True,
    ).update(deleted_at=timezone.now())

    return WorkspaceAsset.objects.create(
        handbook_id=handbook_id,
        asset_type=asset_type,
        file_path=str(target),
        mime_type=uploaded.content_type or "application/octet-stream",
    )
