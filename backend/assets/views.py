from __future__ import annotations

from io import BytesIO
from pathlib import Path, PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from assets.services.storage import LocalStorage
from common.hashing import file_sha256
from generation.services.manuals import ensure_manual
from indexing.services.ingestion import ingest_single_asset
from rag.models import (
    RagAsset,
    RagManual,
    RagRun,
    RagTemplatePlaceholder,
    RagVariableValue,
)
from runs.services.run_logger import create_run, mark_run_failed, mark_run_started, mark_run_succeeded


def _sanitize_rel_path(path_value: str, fallback: str) -> str:
    raw = (path_value or "").replace("\\", "/").strip()
    if not raw:
        raw = fallback
    posix = PurePosixPath(raw)
    safe_parts = [part for part in posix.parts if part not in {"", ".", ".."}]
    return "/".join(safe_parts) or fallback


def _role_folder(role: str) -> str:
    if role == RagAsset.Role.TEMPLATE:
        return "templates"
    if role == RagAsset.Role.CUSTOMER_REFERENCE:
        return "customer"
    if role == RagAsset.Role.GENERATED_OUTPUT:
        return "outputs"
    return "references"


def _asset_payload(asset: RagAsset, resolved_tokens: set[str]) -> dict:
    placeholders = list(
        RagTemplatePlaceholder.objects.filter(asset=asset)
        .order_by("token")
        .values_list("token", flat=True)
    )
    unresolved = [token for token in placeholders if token not in resolved_tokens]
    generated = (
        RagAsset.objects.filter(source_asset=asset, role=RagAsset.Role.GENERATED_OUTPUT)
        .order_by("-created_at")
        .first()
    )
    size = 0
    try:
        size = Path(asset.local_path).stat().st_size
    except OSError:
        size = 0

    return {
        "id": str(asset.id),
        "manual_id": str(asset.manual_id),
        "tenant_id": asset.tenant_id,
        "path": asset.package_rel_path,
        "name": Path(asset.package_rel_path).name,
        "ext": asset.file_ext,
        "mime_type": asset.mime,
        "size": size,
        "role": asset.role,
        "source": asset.source,
        "created_at": asset.created_at.isoformat(),
        "placeholders": placeholders,
        "unresolved_placeholders": unresolved,
        "has_generated_version": generated is not None,
        "last_generated_at": generated.created_at.isoformat() if generated else None,
        "generated_asset_id": str(generated.id) if generated else None,
    }


@api_view(["GET"])
def list_manual_assets(request, manual_id: str):
    role = request.query_params.get("role")
    manual = RagManual.objects.filter(id=manual_id).first()
    if manual is None:
        return Response({"assets": []}, status=status.HTTP_200_OK)

    query = RagAsset.objects.filter(manual=manual).order_by("package_rel_path")
    if role:
        query = query.filter(role=role)

    resolved_tokens = set(
        RagVariableValue.objects.filter(manual=manual).values_list("token", flat=True)
    )
    assets = [_asset_payload(asset, resolved_tokens) for asset in query]
    return Response({"assets": assets}, status=status.HTTP_200_OK)


@api_view(["GET"])
def get_asset_binary(request, asset_id: str):
    asset = get_object_or_404(RagAsset, id=asset_id)
    version = (request.query_params.get("version") or "original").lower()

    target = asset
    if version == "generated":
        if asset.role == RagAsset.Role.GENERATED_OUTPUT:
            target = asset
        else:
            generated = (
                RagAsset.objects.filter(
                    source_asset=asset,
                    role=RagAsset.Role.GENERATED_OUTPUT,
                )
                .order_by("-created_at")
                .first()
            )
            if generated is None:
                raise Http404("Generated version not found")
            target = generated
    elif version == "original":
        if asset.role == RagAsset.Role.GENERATED_OUTPUT and asset.source_asset_id:
            target = asset.source_asset
    else:
        return Response(
            {"error": "Invalid version. Use original or generated."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    file_path = Path(target.local_path)
    if not file_path.exists():
        raise Http404("Asset binary not found")

    response = FileResponse(file_path.open("rb"), content_type=target.mime)
    response["Content-Disposition"] = f'inline; filename="{file_path.name}"'
    response["Content-Length"] = str(file_path.stat().st_size)
    return response


@api_view(["POST"])
def local_upload(request):
    uploaded = request.FILES.get("file")
    manual_id = str(request.data.get("manual_id", "")).strip()
    tenant_id = str(request.data.get("tenant_id", "default-tenant")).strip() or "default-tenant"
    package_code = str(request.data.get("package_code", "ISO9001")).strip() or "ISO9001"
    package_version = str(request.data.get("package_version", "v1")).strip() or "v1"
    role = str(request.data.get("role", RagAsset.Role.TEMPLATE)).strip()
    rel_path_input = str(request.data.get("path", "")).strip()

    if uploaded is None:
        return Response({"error": "Missing file"}, status=status.HTTP_400_BAD_REQUEST)
    if not manual_id:
        return Response({"error": "Missing manual_id"}, status=status.HTTP_400_BAD_REQUEST)

    allowed_roles = {
        RagAsset.Role.TEMPLATE,
        RagAsset.Role.REFERENCE,
        RagAsset.Role.CUSTOMER_REFERENCE,
    }
    if role not in allowed_roles:
        return Response({"error": "Invalid role"}, status=status.HTTP_400_BAD_REQUEST)

    manual = ensure_manual(
        manual_id=manual_id,
        tenant_id=tenant_id,
        package_code=package_code,
        package_version=package_version,
    )

    storage = LocalStorage()
    safe_rel_path = _sanitize_rel_path(rel_path_input, uploaded.name)
    destination = (
        settings.RAG_TENANT_ROOT
        / manual.tenant_id
        / "manuals"
        / str(manual.id)
        / _role_folder(role)
        / safe_rel_path
    )
    storage.write_bytes(destination, uploaded.read())

    sha = file_sha256(destination)
    ext = destination.suffix.lower().lstrip(".")
    mime = uploaded.content_type or "application/octet-stream"

    asset, _created = RagAsset.objects.get_or_create(
        manual=manual,
        package_rel_path=safe_rel_path,
        sha256=sha,
        defaults={
            "tenant": manual.tenant,
            "role": role,
            "source": RagAsset.Source.CUSTOMER_UPLOAD,
            "local_path": str(destination),
            "mime": mime,
            "file_ext": ext,
        },
    )

    if asset.local_path != str(destination):
        asset.local_path = str(destination)
        asset.save(update_fields=["local_path"])

    run = create_run(manual, RagRun.Kind.INGEST)
    mark_run_started(run)
    try:
        ingest_single_asset(manual, run, asset, force=True)
        mark_run_succeeded(
            run,
            metrics={"asset_id": str(asset.id), "path": asset.package_rel_path},
        )
    except Exception as exc:  # noqa: BLE001
        mark_run_failed(run, metrics={"error": str(exc), "asset_id": str(asset.id)})
        return Response(
            {"error": f"Asset uploaded but indexing failed: {exc}", "asset_id": str(asset.id)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    resolved_tokens = set(
        RagVariableValue.objects.filter(manual=manual).values_list("token", flat=True)
    )
    return Response(
        {
            "asset": _asset_payload(asset, resolved_tokens),
            "run_id": str(run.id),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
def presign_upload_stub(_request):
    return Response(
        {
            "error": "S3 presign upload is not enabled in local-first mode.",
            "todo": "Implement S3Storage and presign upload endpoints.",
        },
        status=status.HTTP_501_NOT_IMPLEMENTED,
    )


@api_view(["POST"])
def presign_download_stub(_request):
    return Response(
        {
            "error": "S3 presign download is not enabled in local-first mode.",
            "todo": "Implement S3Storage and presign download endpoints.",
        },
        status=status.HTTP_501_NOT_IMPLEMENTED,
    )


def _resolve_download_target(template_asset: RagAsset, generated_only: bool) -> tuple[Path, str] | None:
    generated = (
        RagAsset.objects.filter(
            source_asset=template_asset,
            role=RagAsset.Role.GENERATED_OUTPUT,
        )
        .order_by("-created_at")
        .first()
    )
    if generated:
        return Path(generated.local_path), template_asset.package_rel_path
    if generated_only:
        return None
    return Path(template_asset.local_path), template_asset.package_rel_path


@api_view(["POST"])
def download_manual_outputs(request, manual_id: str):
    manual = get_object_or_404(RagManual, id=manual_id)
    file_ids = request.data.get("file_ids", [])
    generated_only = bool(request.data.get("generated_only", False))

    if not isinstance(file_ids, list) or not file_ids:
        return Response(
            {"error": "file_ids must be a non-empty array"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    assets = list(RagAsset.objects.filter(manual=manual, id__in=file_ids))
    if not assets:
        return Response(
            {"error": "No matching assets for selection"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    archive = BytesIO()
    added = 0
    with ZipFile(archive, "w", compression=ZIP_DEFLATED) as zip_file:
        for asset in assets:
            if asset.role == RagAsset.Role.GENERATED_OUTPUT:
                path = Path(asset.local_path)
                zip_path = (
                    asset.source_asset.package_rel_path
                    if asset.source_asset_id
                    else asset.package_rel_path
                )
                if path.exists():
                    zip_file.writestr(zip_path, path.read_bytes())
                    added += 1
                continue

            if asset.role != RagAsset.Role.TEMPLATE:
                continue

            target = _resolve_download_target(asset, generated_only)
            if target is None:
                continue
            path, zip_path = target
            if not path.exists():
                continue
            zip_file.writestr(zip_path, path.read_bytes())
            added += 1

    if added == 0:
        return Response(
            {"error": "No files available for download with selected options"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    body = archive.getvalue()
    response = HttpResponse(body, content_type="application/zip")
    response["Content-Disposition"] = (
        f'attachment; filename="manual-{manual_id}-templates.zip"'
    )
    response["Content-Length"] = str(len(body))
    return response
