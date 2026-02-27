from __future__ import annotations

from celery import shared_task

from generation.services.execution import execute_generation
from generation.services.planning import build_generation_plan
from rag.models import RagManual, RagRun
from runs.services.run_logger import emit_event, mark_run_failed, mark_run_started, mark_run_succeeded


@shared_task(bind=True)
def plan_manual_task(
    self,
    manual_id: str,
    run_id: str,
    selected_asset_ids: list[str] | None = None,
) -> dict:
    run = RagRun.objects.select_related("manual").get(id=run_id)
    manual = RagManual.objects.get(id=manual_id)

    mark_run_started(run)
    try:
        plan, prompt_version, model = build_generation_plan(
            manual,
            selected_asset_ids=selected_asset_ids,
        )
        run.prompt_version = prompt_version
        run.model = model
        run.save(update_fields=["prompt_version", "model"])
        mark_run_succeeded(
            run,
            metrics={
                "plan": plan,
                "required_tokens": len(plan.get("required_tokens", [])),
                "unknown_tokens": len(plan.get("unknown_tokens", [])),
            },
        )
        return run.metrics
    except Exception as exc:  # noqa: BLE001
        emit_event(run, level="ERROR", message="Plan failed", payload={"error": str(exc)})
        mark_run_failed(run, metrics={"error": str(exc)})
        raise


@shared_task(bind=True)
def generate_manual_task(
    self,
    manual_id: str,
    run_id: str,
    customer_profile: dict | None = None,
    selected_asset_ids: list[str] | None = None,
    global_overrides: dict[str, str] | None = None,
    file_overrides_by_file: dict[str, dict[str, str]] | None = None,
) -> dict:
    run = RagRun.objects.select_related("manual").get(id=run_id)
    manual = RagManual.objects.get(id=manual_id)

    mark_run_started(run)
    manual.status = RagManual.Status.IN_PROGRESS
    manual.save(update_fields=["status"])

    try:
        report = execute_generation(
            manual=manual,
            run=run,
            customer_profile=customer_profile or {},
            selected_asset_ids=selected_asset_ids,
            global_overrides=global_overrides,
            file_overrides_by_file=file_overrides_by_file,
        )
        status = report.get("status", "SUCCEEDED")
        if status == "FAILED":
            mark_run_failed(run, metrics=report)
            manual.status = RagManual.Status.FAILED
            manual.save(update_fields=["status"])
        else:
            mark_run_succeeded(run, metrics=report)
            manual.status = RagManual.Status.READY
            manual.save(update_fields=["status"])
        return report
    except Exception as exc:  # noqa: BLE001
        emit_event(run, level="ERROR", message="Generate failed", payload={"error": str(exc)})
        mark_run_failed(run, metrics={"error": str(exc)})
        manual.status = RagManual.Status.FAILED
        manual.save(update_fields=["status"])
        raise
