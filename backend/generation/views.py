from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from generation.services.manuals import ensure_manual
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


@api_view(["POST"])
def start_package(request, manual_id: str):
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

    manual = ensure_manual(
        manual_id=manual_id,
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


@api_view(["POST"])
def ingest_manual(request, manual_id: str):
    force = bool(request.data.get("force", False))
    sync = bool(request.data.get("sync", False))

    manual = RagManual.objects.filter(id=manual_id).first()
    if manual is None:
        return Response({"error": "Manual not found"}, status=status.HTTP_404_NOT_FOUND)

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


@api_view(["POST"])
def plan_manual(request, manual_id: str):
    manual = RagManual.objects.filter(id=manual_id).first()
    if manual is None:
        return Response({"error": "Manual not found"}, status=status.HTTP_404_NOT_FOUND)

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


@api_view(["POST"])
def generate_manual(request, manual_id: str):
    manual = RagManual.objects.filter(id=manual_id).first()
    if manual is None:
        return Response({"error": "Manual not found"}, status=status.HTTP_404_NOT_FOUND)

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
