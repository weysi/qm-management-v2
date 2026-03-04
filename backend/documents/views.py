from __future__ import annotations

import logging
from pathlib import Path
from zipfile import BadZipFile

from django.conf import settings
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Document, DocumentVersion, Handbook, HandbookFile, VersionSnapshot
from .serializers import (
    DocumentSerializer,
    DocumentVersionSerializer,
    HandbookFileSerializer,
    HandbookSerializer,
    VersionSnapshotSerializer,
    WorkspaceAssetSerializer,
)
from .services.asset_service import (
    AssetValidationError,
    get_active_asset,
    list_assets,
    save_signature_data_url,
    soft_delete_asset,
    upload_asset,
)
from .services.file_tree_service import build_tree, soft_delete_path
from .services.generation_policy import GenerationPolicyValidationError, parse_generation_policy
from .services.handbook_service import (
    ExportValidationError,
    HandbookServiceError,
    ai_fill_single_placeholder,
    build_handbook_tree,
    create_snapshot_from_current_state,
    create_handbook,
    delete_snapshot,
    export_handbook,
    get_file_placeholders,
    get_handbook_completion_summary,
    list_snapshots,
    refresh_handbook_completion,
    resolve_snapshot_export_path,
    save_placeholder_values,
    upload_handbook_zip,
)
from .services.render_service import RenderValidationError, render_document
from .services.rewrite_service import RewriteValidationError, rewrite_document
from .services.token_metrics import estimate_token_count_from_bytes, log_token_metrics
from .services.upload_service import UploadValidationError, upload_document
from .services.variable_fill_service import VariableFillError, fill_variable_value

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
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is not None:
        refresh_handbook_completion(handbook=handbook)

    return Response({"asset": WorkspaceAssetSerializer(asset).data}, status=status.HTTP_201_CREATED)


@api_view(["POST", "DELETE"])
def handbook_signature_asset_view(request, handbook_id: str):
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        try:
            asset = soft_delete_asset(handbook_id=handbook_id, asset_type="signature")
        except AssetValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if asset is None:
            return Response({"error": "Asset not found"}, status=status.HTTP_404_NOT_FOUND)
        _dev_log(
            "ASSET_DELETE",
            handbook_id=handbook_id,
            asset_type="signature",
            asset_id=str(asset.id),
        )
        refresh_handbook_completion(handbook=handbook)
        return Response({"status": "deleted", "asset_type": "signature"}, status=status.HTTP_200_OK)

    uploaded = request.FILES.get("file")
    data_url_raw = request.data.get("data_url")
    filename = str(request.data.get("filename", "signature-canvas.png")).strip() or "signature-canvas.png"

    try:
        if isinstance(data_url_raw, str) and data_url_raw.strip():
            asset = save_signature_data_url(
                handbook_id=handbook_id,
                data_url=data_url_raw,
                filename=filename,
            )
        elif uploaded is not None:
            asset = upload_asset(
                handbook_id=handbook_id,
                asset_type="signature",
                uploaded=uploaded,
            )
        else:
            return Response(
                {"error": "data_url or file is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
    except AssetValidationError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    refresh_handbook_completion(handbook=handbook)
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
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is not None:
        refresh_handbook_completion(handbook=handbook)
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
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response


def _get_handbook_or_404(handbook_id: str) -> Handbook | None:
    handbook = Handbook.objects.filter(id=handbook_id).first()
    if handbook is None:
        return None
    return handbook


@api_view(["GET", "POST"])
def handbooks_view(request):
    if request.method == "GET":
        customer_id = str(request.query_params.get("customer_id", "")).strip()
        query = Handbook.objects.all().order_by("-created_at")
        if customer_id:
            query = query.filter(customer_id=customer_id)
        return Response({"handbooks": HandbookSerializer(query, many=True).data}, status=status.HTTP_200_OK)

    customer_id = str(request.data.get("customer_id", "")).strip()
    handbook_type = str(request.data.get("type", "")).strip()
    if not customer_id:
        return Response({"error": "customer_id is required"}, status=status.HTTP_400_BAD_REQUEST)
    if not handbook_type:
        return Response({"error": "type is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        handbook = create_handbook(customer_id=customer_id, handbook_type=handbook_type)
    except Exception as exc:  # noqa: BLE001
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(HandbookSerializer(handbook).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def handbook_detail_view(request, handbook_id: str):
    del request
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)
    return Response(HandbookSerializer(handbook).data, status=status.HTTP_200_OK)


@api_view(["POST"])
def handbook_upload_zip_view(request, handbook_id: str):
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)

    uploaded = request.FILES.get("file")
    if uploaded is None:
        return Response({"error": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        result = upload_handbook_zip(handbook=handbook, uploaded=uploaded)
    except HandbookServiceError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except BadZipFile:
        return Response({"error": "Invalid ZIP archive"}, status=status.HTTP_400_BAD_REQUEST)

    files_payload = HandbookFileSerializer(result.files, many=True).data
    return Response(
        {
            "handbook": HandbookSerializer(handbook).data,
            "tree": result.tree,
            "files": files_payload,
            "warnings": result.warnings,
            "summary": {
                "files_total": len(result.files),
                "parse_failed": sum(1 for item in result.files if item.parse_status == HandbookFile.ParseStatus.FAILED),
                "placeholders_total": sum(item.placeholder_total for item in result.files),
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
def handbook_tree_view(request, handbook_id: str):
    del request
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)
    tree = build_handbook_tree(handbook=handbook)
    return Response({"tree": tree}, status=status.HTTP_200_OK)


@api_view(["GET"])
def handbook_file_placeholders_view(request, handbook_id: str, file_id: str):
    del request
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)

    handbook_file = HandbookFile.objects.filter(id=file_id, handbook=handbook).first()
    if handbook_file is None:
        return Response({"error": "Handbook file not found"}, status=status.HTTP_404_NOT_FOUND)

    payload = get_file_placeholders(handbook=handbook, handbook_file=handbook_file)
    return Response(
        {
            "file": HandbookFileSerializer(handbook_file).data,
            "placeholders": payload["placeholders"],
            "completion": payload["completion"],
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def handbook_save_placeholders_view(request, handbook_id: str):
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)

    file_id = str(request.data.get("file_id", "")).strip()
    if not file_id:
        return Response({"error": "file_id is required"}, status=status.HTTP_400_BAD_REQUEST)
    handbook_file = HandbookFile.objects.filter(id=file_id, handbook=handbook).first()
    if handbook_file is None:
        return Response({"error": "Handbook file not found"}, status=status.HTTP_404_NOT_FOUND)

    values_raw = request.data.get("values")
    if isinstance(values_raw, dict):
        values = [{"key": key, "value_text": value} for key, value in values_raw.items()]
    elif isinstance(values_raw, list):
        values = values_raw
    else:
        return Response({"error": "values must be an object or array"}, status=status.HTTP_400_BAD_REQUEST)

    source = str(request.data.get("source", "MANUAL")).strip().upper() or "MANUAL"
    try:
        payload = save_placeholder_values(
            handbook=handbook,
            handbook_file=handbook_file,
            values=values,
            source=source,
        )
    except HandbookServiceError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    snapshot = payload.get("snapshot")
    return Response(
        {
            "file": HandbookFileSerializer(payload["file"]).data,
            "placeholders": payload["placeholders"],
            "completion": payload["completion"],
            "snapshot": VersionSnapshotSerializer(snapshot).data if snapshot is not None else None,
            "handbook_completion": payload.get("handbook_completion"),
            "handbook": HandbookSerializer(handbook).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def handbook_placeholder_ai_fill_view(request, handbook_id: str):
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)

    file_id = str(request.data.get("file_id", "")).strip()
    placeholder_key = str(request.data.get("placeholder_key", "")).strip()
    if not file_id or not placeholder_key:
        return Response(
            {"error": "file_id and placeholder_key are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    handbook_file = HandbookFile.objects.filter(id=file_id, handbook=handbook).first()
    if handbook_file is None:
        return Response({"error": "Handbook file not found"}, status=status.HTTP_404_NOT_FOUND)

    current_value_raw = request.data.get("current_value")
    current_value = None if current_value_raw is None else str(current_value_raw)
    instruction = str(request.data.get("instruction", "")).strip()
    language = str(request.data.get("language", "de-DE")).strip()
    context = request.data.get("context", {})
    constraints = request.data.get("constraints", {})

    try:
        payload = ai_fill_single_placeholder(
            handbook=handbook,
            handbook_file=handbook_file,
            placeholder_key=placeholder_key,
            current_value=current_value,
            instruction=instruction,
            language=language,
            context=context if isinstance(context, dict) else {},
            constraints=constraints if isinstance(constraints, dict) else {},
        )
    except VariableFillError as exc:
        return Response(
            {"error": str(exc), "error_code": exc.error_code},
            status=exc.status_code,
        )
    except HandbookServiceError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(payload, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
def handbook_versions_view(request, handbook_id: str):
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "POST":
        created_by = str(request.data.get("created_by", "user")).strip() or "user"
        reason = str(request.data.get("reason", "manual_completion")).strip() or "manual_completion"
        try:
            snapshot, created = create_snapshot_from_current_state(
                handbook=handbook,
                created_by=created_by,
                reason=reason,
            )
        except HandbookServiceError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "created": created,
                "snapshot": VersionSnapshotSerializer(snapshot).data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    versions = list_snapshots(handbook=handbook)
    return Response({"versions": VersionSnapshotSerializer(versions, many=True).data}, status=status.HTTP_200_OK)


@api_view(["GET"])
def handbook_completion_view(request, handbook_id: str):
    del request
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)
    summary = get_handbook_completion_summary(handbook=handbook)
    return Response(summary, status=status.HTTP_200_OK)


@api_view(["DELETE"])
def handbook_version_detail_view(request, handbook_id: str, version_number: int):
    del request
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)

    deleted = delete_snapshot(handbook=handbook, version_number=version_number)
    if not deleted:
        return Response({"error": "Version not found"}, status=status.HTTP_404_NOT_FOUND)
    return Response({"status": "deleted", "version_number": version_number}, status=status.HTTP_200_OK)


@api_view(["GET"])
def handbook_version_download_view(request, handbook_id: str, version_number: int):
    del request
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)

    export_path = resolve_snapshot_export_path(handbook=handbook, version_number=version_number)
    if export_path is None:
        exists = VersionSnapshot.objects.filter(
            handbook=handbook,
            version_number=version_number,
        ).exists()
        if not exists:
            return Response({"error": "Version not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"error": "Version is not downloadable"}, status=status.HTTP_400_BAD_REQUEST)

    response = FileResponse(export_path.open("rb"), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{export_path.name}"'
    response["Content-Length"] = str(export_path.stat().st_size)
    return response


@api_view(["POST"])
def handbook_export_view(request, handbook_id: str):
    del request
    handbook = _get_handbook_or_404(handbook_id)
    if handbook is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)

    try:
        zip_path, snapshot = export_handbook(handbook=handbook)
    except ExportValidationError as exc:
        return Response(
            {
                "error": "Validation failed",
                "errors": exc.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    except HandbookServiceError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    response = FileResponse(zip_path.open("rb"), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename=\"{zip_path.name}\"'
    response["Content-Length"] = str(zip_path.stat().st_size)
    response["X-Snapshot-Version"] = str(snapshot.version_number)
    return response


@api_view(["POST"])
def handbook_variable_ai_fill_view(request, handbook_id: str):
    variable_name = str(request.data.get("variable_name", "")).strip()
    current_value_raw = request.data.get("current_value")
    current_value = None if current_value_raw is None else str(current_value_raw)
    instruction = str(request.data.get("instruction", "")).strip()
    language = str(request.data.get("language", "de-DE")).strip()
    client_context = request.data.get("client_context", {})
    constraints = request.data.get("constraints", {})
    variable_description_raw = request.data.get("variable_description")
    variable_description = (
        None if variable_description_raw is None else str(variable_description_raw)
    )

    try:
        payload = fill_variable_value(
            handbook_id=handbook_id,
            variable_name=variable_name,
            current_value=current_value,
            instruction=instruction,
            language=language,
            client_context=client_context,
            constraints=constraints,
            variable_description=variable_description,
        )
    except VariableFillError as exc:
        return Response(
            {
                "error": str(exc),
                "error_code": exc.error_code,
            },
            status=exc.status_code,
        )

    return Response(payload, status=status.HTTP_200_OK)
