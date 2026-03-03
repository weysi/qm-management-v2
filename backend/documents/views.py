from __future__ import annotations

import logging
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Document, DocumentVersion
from .serializers import DocumentSerializer, DocumentVersionSerializer, WorkspaceAssetSerializer
from .services.asset_service import (
    AssetValidationError,
    get_active_asset,
    list_assets,
    soft_delete_asset,
    upload_asset,
)
from .services.file_tree_service import build_tree, soft_delete_path
from .services.generation_policy import GenerationPolicyValidationError, parse_generation_policy
from .services.render_service import RenderValidationError, render_document
from .services.rewrite_service import RewriteValidationError, rewrite_document
from .services.token_metrics import estimate_token_count_from_bytes, log_token_metrics
from .services.upload_service import UploadValidationError, upload_document

logger = logging.getLogger(__name__)


def _dev_log(event: str, **payload: object) -> None:
    if settings.DEBUG:
        logger.info("%s %s", event, payload)


@api_view(["POST"])
def upload_document_view(request):
    uploaded = request.FILES.get("file")
    handbook_id = str(request.data.get("handbook_id", "")).strip()
    relative_path = str(request.data.get("path", "")).strip() or None

    if not handbook_id:
        return Response({"error": "handbook_id is required"}, status=status.HTTP_400_BAD_REQUEST)
    if uploaded is None:
        return Response({"error": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        result = upload_document(
            handbook_id=handbook_id,
            uploaded=uploaded,
            relative_path=relative_path,
        )
    except UploadValidationError as exc:
        message = str(exc)
        code = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE if ".doc" in message else status.HTTP_400_BAD_REQUEST
        return Response({"error": message}, status=code)

    _dev_log(
        "DOCUMENT_UPLOAD",
        kind=result.kind,
        handbook_id=handbook_id,
        path=relative_path or uploaded.name,
        filename=uploaded.name,
        documents_created=len(result.documents),
        assets_bound=len(result.assets),
        warning_count=len(result.warnings),
    )

    if result.kind == "file":
        document = result.documents[0]
        variables = list(result.variables_by_document.get(str(document.id), ()))
        return Response(
            {
                "kind": "file",
                "document": DocumentSerializer(document).data,
                "variables": [
                    {
                        "id": str(item.id),
                        "variable_name": item.variable_name,
                        "required": item.required,
                        "source": item.source,
                        "type": item.type,
                        "metadata": item.metadata,
                    }
                    for item in variables
                ],
                "summary": {
                    "documents_created": 1,
                    "assets_bound": 0,
                    "warnings": 0,
                },
            },
            status=status.HTTP_201_CREATED,
        )

    return Response(
        {
            "kind": "zip",
            "documents": DocumentSerializer(list(result.documents), many=True).data,
            "assets": WorkspaceAssetSerializer(list(result.assets), many=True).data,
            "warnings": list(result.warnings),
            "summary": {
                "documents_created": len(result.documents),
                "assets_bound": len(result.assets),
                "warnings": len(result.warnings),
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
def list_documents_view(request):
    handbook_id = str(request.query_params.get("handbook_id", "")).strip()
    include_deleted = str(request.query_params.get("include_deleted", "false")).lower() == "true"
    if not handbook_id:
        return Response({"error": "handbook_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    query = Document.objects.filter(handbook_id=handbook_id)
    if not include_deleted:
        query = query.filter(deleted_at__isnull=True)

    payload = DocumentSerializer(query.order_by("relative_path"), many=True).data
    _dev_log(
        "DOCUMENT_LIST",
        handbook_id=handbook_id,
        include_deleted=include_deleted,
        count=len(payload),
    )
    return Response({"documents": payload}, status=status.HTTP_200_OK)


@api_view(["GET", "DELETE"])
def document_detail_view(request, document_id: str):
    document = Document.objects.filter(id=document_id).first()
    if document is None:
        return Response({"error": "Document not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        if document.deleted_at is None:
            document.deleted_at = timezone.now()
            document.save(update_fields=["deleted_at", "updated_at"])
        return Response({"status": "deleted", "document_id": str(document.id)}, status=status.HTTP_200_OK)

    return Response(DocumentSerializer(document).data, status=status.HTTP_200_OK)


@api_view(["POST"])
def render_document_view(request, document_id: str):
    variables = request.data.get("variables", {})
    asset_overrides = request.data.get("asset_overrides", {})
    generation_policy_payload = request.data.get("generation_policy")

    if variables is not None and not isinstance(variables, dict):
        return Response({"error": "variables must be an object"}, status=status.HTTP_400_BAD_REQUEST)
    if asset_overrides is not None and not isinstance(asset_overrides, dict):
        return Response({"error": "asset_overrides must be an object"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        generation_policy = parse_generation_policy(generation_policy_payload)
    except GenerationPolicyValidationError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    try:
        version, unresolved, warnings = render_document(
            document_id=document_id,
            variables=variables or {},
            asset_overrides=asset_overrides or {},
            generation_policy=generation_policy,
        )
    except FileNotFoundError:
        return Response({"error": "Document not found"}, status=status.HTTP_404_NOT_FOUND)
    except RenderValidationError as exc:
        return Response(
            {"error": "Validation failed", "errors": exc.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(
        {
            "version": DocumentVersionSerializer(version).data,
            "unresolved": unresolved,
            "warnings": warnings,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def rewrite_document_view(request, document_id: str):
    instruction = str(request.data.get("instruction", "")).strip()
    target_version_raw = request.data.get("targetVersion")
    target_version = None
    if target_version_raw is not None:
        try:
            target_version = int(target_version_raw)
        except (TypeError, ValueError):
            return Response({"error": "targetVersion must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        version = rewrite_document(
            document_id=document_id,
            instruction=instruction,
            target_version=target_version,
        )
    except FileNotFoundError:
        return Response({"error": "Document not found"}, status=status.HTTP_404_NOT_FOUND)
    except RewriteValidationError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response({"version": DocumentVersionSerializer(version).data}, status=status.HTTP_200_OK)


@api_view(["GET"])
def download_document_view(request, document_id: str):
    document = Document.objects.filter(id=document_id, deleted_at__isnull=True).first()
    if document is None:
        return Response({"error": "Document not found"}, status=status.HTTP_404_NOT_FOUND)

    version_selector = str(request.query_params.get("version", "latest")).strip().lower()
    if version_selector == "latest":
        version = document.versions.order_by("-version_number").first()
    else:
        try:
            version_number = int(version_selector)
        except ValueError:
            return Response({"error": "version must be an integer or 'latest'"}, status=status.HTTP_400_BAD_REQUEST)
        version = document.versions.filter(version_number=version_number).first()

    if version is None:
        return Response({"error": "Version not found"}, status=status.HTTP_404_NOT_FOUND)

    path = Path(version.file_path)
    if not path.exists():
        raise Http404("Version binary not found")

    payload = path.read_bytes()
    log_token_metrics(
        path=path,
        estimated_token_count=estimate_token_count_from_bytes(payload),
    )

    response = FileResponse(path.open("rb"), content_type=version.mime_type)
    response["Content-Disposition"] = f'attachment; filename="{path.name}"'
    response["Content-Length"] = str(path.stat().st_size)
    return response


@api_view(["GET"])
def files_tree_view(request):
    handbook_id = str(request.query_params.get("handbook_id", "")).strip()
    include_deleted = str(request.query_params.get("include_deleted", "false")).lower() == "true"
    if not handbook_id:
        return Response({"error": "handbook_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    tree = build_tree(handbook_id=handbook_id, include_deleted=include_deleted)
    _dev_log(
        "FILES_TREE",
        handbook_id=handbook_id,
        include_deleted=include_deleted,
        node_count=len(tree),
    )
    return Response({"tree": tree}, status=status.HTTP_200_OK)


@api_view(["DELETE"])
def files_delete_view(request):
    handbook_id = str(request.data.get("handbook_id", "")).strip()
    path = str(request.data.get("path", "")).strip()
    recursive = bool(request.data.get("recursive", False))

    if not handbook_id or not path:
        return Response(
            {"error": "handbook_id and path are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = soft_delete_path(handbook_id=handbook_id, path=path, recursive=recursive)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        {
            "deleted_count": result.deleted_count,
            "deleted_paths": result.deleted_paths,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "POST"])
def handbook_assets_view(request, handbook_id: str):
    if request.method == "GET":
        assets = list_assets(handbook_id)
        _dev_log("ASSET_LIST", handbook_id=handbook_id, count=len(assets))
        return Response({"assets": WorkspaceAssetSerializer(assets, many=True).data}, status=status.HTTP_200_OK)

    uploaded = request.FILES.get("file")
    asset_type = str(request.data.get("asset_type", "")).strip()
    if uploaded is None:
        return Response({"error": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        asset = upload_asset(handbook_id=handbook_id, asset_type=asset_type, uploaded=uploaded)
    except AssetValidationError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    _dev_log(
        "ASSET_UPLOAD",
        handbook_id=handbook_id,
        asset_type=asset_type,
        asset_id=str(asset.id),
    )

    return Response({"asset": WorkspaceAssetSerializer(asset).data}, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
def handbook_asset_detail_view(request, handbook_id: str, asset_type: str):
    try:
        asset = soft_delete_asset(handbook_id=handbook_id, asset_type=asset_type)
    except AssetValidationError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if asset is None:
        return Response({"error": "Asset not found"}, status=status.HTTP_404_NOT_FOUND)
    _dev_log(
        "ASSET_DELETE",
        handbook_id=handbook_id,
        asset_type=asset_type,
        asset_id=str(asset.id),
    )
    return Response({"status": "deleted", "asset_type": asset_type}, status=status.HTTP_200_OK)


@api_view(["GET"])
def handbook_asset_download_view(request, handbook_id: str, asset_type: str):
    try:
        asset = get_active_asset(handbook_id=handbook_id, asset_type=asset_type)
    except AssetValidationError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if asset is None:
        return Response({"error": "Asset not found"}, status=status.HTTP_404_NOT_FOUND)

    path = Path(asset.file_path)
    if not path.exists():
        return Response({"error": "Asset binary not found"}, status=status.HTTP_404_NOT_FOUND)

    _dev_log(
        "ASSET_DOWNLOAD",
        handbook_id=handbook_id,
        asset_type=asset_type,
        asset_id=str(asset.id),
    )

    response = FileResponse(path.open("rb"), content_type=asset.mime_type or "application/octet-stream")
    response["Content-Disposition"] = f'attachment; filename="{path.name}"'
    response["Content-Length"] = str(path.stat().st_size)
    return response
