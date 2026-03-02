from __future__ import annotations

from typing import Any

from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    inline_serializer,
)
from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from generation.services.handbooks import ensure_handbook
from generation.tasks import generate_manual_task, plan_manual_task
from indexing.tasks import ingest_manual_task
from packages.catalog import PackageCatalogError, get_package_config
from rag.models import RagManual, RagRun
from runs.services.run_logger import create_run


def _serialize_run(run: RagRun) -> dict[str, Any]:
    return {
        "id": str(run.id),
        "manual_id": str(run.manual_id),
        "kind": run.kind,
        "status": run.status,
        "prompt_version": run.prompt_version,
        "model": run.model,
        "metrics": run.metrics,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
    }


def _run_task(task, *, sync: bool, args: list, kwargs: dict | None = None):
    kwargs = kwargs or {}
    if sync:
        return task.apply(args=args, kwargs=kwargs).get()
    task.delay(*args, **kwargs)
    return None


_RunSerializer = inline_serializer(
    name="RunPayload",
    fields={
        "id": serializers.UUIDField(help_text="Run UUID"),
        "manual_id": serializers.CharField(help_text="Manual ID"),
        "kind": serializers.ChoiceField(
            choices=["INGEST", "PLAN", "GENERATE", "CHAT"],
            help_text="Pipeline step type",
        ),
        "status": serializers.ChoiceField(
            choices=["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"],
            help_text="Current run status",
        ),
        "prompt_version": serializers.CharField(help_text="AI prompt version used"),
        "model": serializers.CharField(help_text="AI model used"),
        "metrics": serializers.DictField(help_text="Run metrics and result data (JSON)"),
        "started_at": serializers.DateTimeField(allow_null=True, help_text="When the run started"),
        "finished_at": serializers.DateTimeField(allow_null=True, help_text="When the run completed"),
    },
)


@extend_schema(
    tags=["Generation"],
    summary="Initialize a package for a manual",
    description=(
        "Seeds variable keys from the package schema, copies package source files "
        "(templates + references) into the manual's tenant directory, and triggers "
        "full indexing (text extraction, chunking, embedding, FTS, placeholder detection).\n\n"
        "This is the **first step** in the pipeline. It creates the tenant and manual "
        "records if they don't exist, then runs the INGEST pipeline.\n\n"
        "**Sync mode:** If `sync=true`, the request blocks until indexing completes and "
        "returns the final run status. Otherwise returns 202 immediately with a QUEUED run."
    ),
    parameters=[
        OpenApiParameter(name="manual_id", location=OpenApiParameter.PATH, type=str, required=True,
                         description="Manual ID to create/initialize"),
    ],
    request=inline_serializer(
        name="StartPackageRequest",
        fields={
            "package_code": serializers.ChoiceField(
                choices=["ISO9001", "SSCP", "ISO14007"],
                help_text="Package standard code",
            ),
            "package_version": serializers.CharField(help_text="Package version (e.g. 'v1')"),
            "tenant_id": serializers.CharField(help_text="Tenant identifier"),
            "sync": serializers.BooleanField(
                required=False, default=False,
                help_text="If true, block until indexing completes",
            ),
            "force": serializers.BooleanField(
                required=False, default=False,
                help_text="If true, re-index even if files already exist",
            ),
        },
    ),
    responses={
        202: inline_serializer(
            name="StartPackageResponse",
            fields={
                "run": serializers.DictField(help_text="Run object with status tracking"),
                "manual_id": serializers.CharField(help_text="Created/existing manual ID"),
                "tenant_id": serializers.CharField(help_text="Tenant ID"),
            },
        ),
        400: inline_serializer(name="StartPackageBadRequest", fields={"error": serializers.CharField()}),
    },
)
@api_view(["POST"])
def start_package(request, handbook_id: str):
    package_code = str(request.data.get("package_code", "")).strip()
    package_version = str(request.data.get("package_version", "")).strip()
    tenant_id = str(request.data.get("tenant_id", "")).strip()
    sync = bool(request.data.get("sync", False))
    force = bool(request.data.get("force", False))

    if not package_code or not package_version or not tenant_id:
        return Response(
            {"error": "package_code, package_version and tenant_id are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        get_package_config(package_code, package_version)
    except PackageCatalogError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    manual = ensure_handbook(
        handbook_id=handbook_id,
        tenant_id=tenant_id,
        package_code=package_code,
        package_version=package_version,
    )
    run = create_run(manual, RagRun.Kind.INGEST)
    _run_task(
        ingest_manual_task,
        sync=sync,
        args=[str(manual.id), str(run.id)],
        kwargs={"force": force},
    )
    run.refresh_from_db()

    return Response(
        {
            "run": _serialize_run(run),
            "manual_id": str(manual.id),
            "tenant_id": manual.tenant_id,
        },
        status=status.HTTP_202_ACCEPTED,
    )


@extend_schema(
    tags=["Generation"],
    summary="Re-index manual assets",
    description=(
        "Triggers re-indexing of all assets in a manual.\n\n"
        "If `force=false` (default) and a previous INGEST run succeeded, the existing run is "
        "returned with `reused: true` and no work is done. Set `force=true` to re-index regardless.\n\n"
        "Indexing includes: text extraction from DOCX/PPTX/XLSX/PDF, paragraph-boundary chunking, "
        "OpenAI embedding generation, PostgreSQL FTS vector updates, and placeholder detection."
    ),
    parameters=[
        OpenApiParameter(name="manual_id", location=OpenApiParameter.PATH, type=str, required=True,
                         description="Manual ID"),
    ],
    request=inline_serializer(
        name="IngestRequest",
        fields={
            "force": serializers.BooleanField(
                required=False, default=False,
                help_text="If true, re-index even if a previous ingest succeeded",
            ),
            "sync": serializers.BooleanField(
                required=False, default=False,
                help_text="If true, block until indexing completes",
            ),
        },
    ),
    responses={
        200: inline_serializer(
            name="IngestReusedResponse",
            fields={
                "run": serializers.DictField(help_text="Previously succeeded run"),
                "reused": serializers.BooleanField(help_text="True when returning a cached run"),
            },
        ),
        202: inline_serializer(
            name="IngestAcceptedResponse",
            fields={"run": serializers.DictField(help_text="Newly created INGEST run")},
        ),
        404: inline_serializer(name="ManualNotFoundError", fields={"error": serializers.CharField()}),
    },
)
@api_view(["POST"])
def ingest_handbook(request, handbook_id: str):
    force = bool(request.data.get("force", False))
    sync = bool(request.data.get("sync", False))

    manual = RagManual.objects.filter(id=handbook_id).first()
    if manual is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)

    if not force:
        existing = (
            RagRun.objects.filter(
                manual=manual,
                kind=RagRun.Kind.INGEST,
                status=RagRun.Status.SUCCEEDED,
            )
            .order_by("-finished_at")
            .first()
        )
        if existing is not None:
            return Response(
                {"run": _serialize_run(existing), "reused": True},
                status=status.HTTP_200_OK,
            )

    run = create_run(manual, RagRun.Kind.INGEST)
    _run_task(
        ingest_manual_task,
        sync=sync,
        args=[str(manual.id), str(run.id)],
        kwargs={"force": force},
    )
    run.refresh_from_db()
    return Response({"run": _serialize_run(run)}, status=status.HTTP_202_ACCEPTED)


@extend_schema(
    tags=["Generation"],
    summary="Create AI generation plan",
    description=(
        "Builds a generation plan that maps template files to their required variables "
        "and determines how each placeholder will be resolved.\n\n"
        "The plan is first built deterministically from template assets and their detected "
        "placeholders, then refined by AI using the `plan_v1` prompt.\n\n"
        "If `sync=true` (default), the response includes the full plan object in `plan`. "
        "Otherwise returns 202 with the queued run."
    ),
    parameters=[
        OpenApiParameter(name="manual_id", location=OpenApiParameter.PATH, type=str, required=True,
                         description="Manual ID"),
    ],
    request=inline_serializer(
        name="PlanRequest",
        fields={
            "sync": serializers.BooleanField(
                required=False, default=True,
                help_text="If true (default), block until planning completes",
            ),
            "selected_asset_ids": serializers.ListField(
                child=serializers.UUIDField(), required=False, allow_null=True,
                help_text="Optional subset of asset UUIDs to include in the plan. If omitted, all TEMPLATE assets are included.",
            ),
        },
    ),
    responses={
        200: inline_serializer(
            name="PlanSyncResponse",
            fields={
                "run": serializers.DictField(help_text="Completed PLAN run"),
                "plan": serializers.DictField(
                    help_text="Generation plan: mapping of files to variables and resolution strategies",
                ),
            },
        ),
        202: inline_serializer(
            name="PlanAsyncResponse",
            fields={"run": serializers.DictField(help_text="Queued PLAN run")},
        ),
        400: inline_serializer(name="PlanBadRequest", fields={"error": serializers.CharField()}),
        404: inline_serializer(name="PlanNotFound", fields={"error": serializers.CharField()}),
    },
)
@api_view(["POST"])
def plan_handbook(request, handbook_id: str):
    manual = RagManual.objects.filter(id=handbook_id).first()
    if manual is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)

    sync = bool(request.data.get("sync", True))
    selected_asset_ids = request.data.get("selected_asset_ids")
    if selected_asset_ids is not None and not isinstance(selected_asset_ids, list):
        return Response(
            {"error": "selected_asset_ids must be an array"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    run = create_run(manual, RagRun.Kind.PLAN)
    _run_task(
        plan_manual_task,
        sync=sync,
        args=[str(manual.id), str(run.id)],
        kwargs={"selected_asset_ids": selected_asset_ids},
    )
    run.refresh_from_db()

    payload = {"run": _serialize_run(run)}
    if sync:
        payload["plan"] = run.metrics.get("plan", {})
    return Response(payload, status=status.HTTP_200_OK if sync else status.HTTP_202_ACCEPTED)


@extend_schema(
    tags=["Generation"],
    summary="Generate manual output files",
    description=(
        "Executes the full generation pipeline:\n\n"
        "1. **Build plan** — identifies template files and their required placeholders\n"
        "2. **Resolve variables** — priority-ordered resolution: CUSTOMER_INPUT → customer_profile "
        "→ HUMAN_OVERRIDE → global_overrides → default_value → AI_INFER → AI_DRAFT\n"
        "3. **Apply placeholders** — opens each OOXML template (DOCX/PPTX/XLSX), replaces "
        "`{{TOKEN}}` patterns in XML entries, writes output files\n"
        "4. **Register outputs** — creates GENERATED_OUTPUT assets linked to source templates\n\n"
        "The `report` (returned when `sync=true`) contains per-file status, unresolved tokens, "
        "and an overall summary (SUCCEEDED / PARTIAL / FAILED).\n\n"
        "**Overrides:**\n"
        "- `customer_profile`: dict of token→value from the client form (highest priority for known tokens)\n"
        "- `global_overrides`: dict of token→value applied to all files\n"
        "- `file_overrides_by_file`: dict of asset_id → {token: value} for per-file overrides"
    ),
    parameters=[
        OpenApiParameter(name="manual_id", location=OpenApiParameter.PATH, type=str, required=True,
                         description="Manual ID"),
    ],
    request=inline_serializer(
        name="GenerateRequest",
        fields={
            "sync": serializers.BooleanField(
                required=False, default=True,
                help_text="If true (default), block until generation completes",
            ),
            "customer_profile": serializers.DictField(
                required=False, default={},
                help_text="Client data as token→value map (e.g. {'COMPANY_NAME': 'Acme GmbH'})",
            ),
            "selected_asset_ids": serializers.ListField(
                child=serializers.UUIDField(), required=False, allow_null=True,
                help_text="Optional subset of template asset UUIDs to generate",
            ),
            "global_overrides": serializers.DictField(
                required=False, allow_null=True,
                help_text="Global token→value overrides applied to all files",
            ),
            "file_overrides_by_file": serializers.DictField(
                required=False, allow_null=True,
                help_text="Per-file overrides: {asset_id: {token: value}}",
            ),
        },
    ),
    responses={
        200: inline_serializer(
            name="GenerateSyncResponse",
            fields={
                "run": serializers.DictField(help_text="Completed GENERATE run"),
                "report": serializers.DictField(
                    help_text=(
                        "Generation report with fields: status (SUCCEEDED/PARTIAL/FAILED), "
                        "files (array of per-file results), summary (stats)"
                    ),
                ),
            },
        ),
        202: inline_serializer(
            name="GenerateAsyncResponse",
            fields={"run": serializers.DictField(help_text="Queued GENERATE run")},
        ),
        400: inline_serializer(name="GenerateBadRequest", fields={"error": serializers.CharField()}),
        404: inline_serializer(name="GenerateNotFound", fields={"error": serializers.CharField()}),
    },
)
@api_view(["POST"])
def generate_handbook(request, handbook_id: str):
    manual = RagManual.objects.filter(id=handbook_id).first()
    if manual is None:
        return Response({"error": "Handbook not found"}, status=status.HTTP_404_NOT_FOUND)

    sync = bool(request.data.get("sync", True))
    customer_profile = request.data.get("customer_profile", {})
    selected_asset_ids = request.data.get("selected_asset_ids")
    global_overrides = request.data.get("global_overrides")
    file_overrides_by_file = request.data.get("file_overrides_by_file")

    if selected_asset_ids is not None and not isinstance(selected_asset_ids, list):
        return Response(
            {"error": "selected_asset_ids must be an array"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if global_overrides is not None and not isinstance(global_overrides, dict):
        return Response(
            {"error": "global_overrides must be an object"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if file_overrides_by_file is not None and not isinstance(file_overrides_by_file, dict):
        return Response(
            {"error": "file_overrides_by_file must be an object"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    run = create_run(manual, RagRun.Kind.GENERATE)
    _run_task(
        generate_manual_task,
        sync=sync,
        args=[str(manual.id), str(run.id)],
        kwargs={
            "customer_profile": customer_profile if isinstance(customer_profile, dict) else {},
            "selected_asset_ids": selected_asset_ids,
            "global_overrides": global_overrides,
            "file_overrides_by_file": file_overrides_by_file,
        },
    )
    run.refresh_from_db()

    payload = {"run": _serialize_run(run)}
    if sync:
        payload["report"] = run.metrics
        return Response(payload, status=status.HTTP_200_OK)
    return Response(payload, status=status.HTTP_202_ACCEPTED)
