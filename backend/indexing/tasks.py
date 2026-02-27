from __future__ import annotations

from celery import shared_task
from django.db import transaction

from indexing.services.ingestion import ingest_package_for_manual, ingest_single_asset
from rag.models import RagAsset, RagManual, RagRun
from runs.services.run_logger import (
    emit_event,
    mark_run_failed,
    mark_run_started,
    mark_run_succeeded,
)


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=2)
def ingest_manual_task(self, manual_id: str, run_id: str, force: bool = False) -> dict:
    run = RagRun.objects.select_related("manual").get(id=run_id)
    manual = RagManual.objects.get(id=manual_id)

    mark_run_started(run)
    manual.status = RagManual.Status.IN_PROGRESS
    manual.save(update_fields=["status"])

    try:
        stats = ingest_package_for_manual(manual, run, force=force)
        metrics = {
            "assets_total": stats.assets_total,
            "assets_created": stats.assets_created,
            "assets_skipped": stats.assets_skipped,
            "chunks_total": stats.chunks_total,
            "placeholders_total": stats.placeholders_total,
            "unknown_placeholders": stats.unknown_placeholders,
            "extraction_errors": stats.extraction_errors,
        }
        mark_run_succeeded(run, metrics=metrics)
        manual.status = RagManual.Status.READY
        manual.save(update_fields=["status"])
        return metrics
    except Exception as exc:  # noqa: BLE001
        emit_event(run, level="ERROR", message="Ingestion run failed", payload={"error": str(exc)})
        mark_run_failed(run, metrics={"error": str(exc)})
        manual.status = RagManual.Status.FAILED
        manual.save(update_fields=["status"])
        raise


@shared_task(bind=True)
def ingest_asset_task(self, manual_id: str, run_id: str, asset_id: str, force: bool = True) -> dict:
    run = RagRun.objects.select_related("manual").get(id=run_id)
    manual = RagManual.objects.get(id=manual_id)
    asset = RagAsset.objects.get(id=asset_id, manual=manual)

    mark_run_started(run)
    try:
        stats = ingest_single_asset(manual, run, asset, force=force)
        metrics = {
            "assets_total": stats.assets_total,
            "chunks_total": stats.chunks_total,
            "placeholders_total": stats.placeholders_total,
            "unknown_placeholders": stats.unknown_placeholders,
        }
        mark_run_succeeded(run, metrics=metrics)
        return metrics
    except Exception as exc:  # noqa: BLE001
        mark_run_failed(run, metrics={"error": str(exc), "asset_id": asset_id})
        raise
