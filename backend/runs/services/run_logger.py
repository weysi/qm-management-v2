from __future__ import annotations

from django.utils import timezone

from rag.models import RagRun, RagRunEvent


def create_run(manual, kind: str, *, status: str = RagRun.Status.QUEUED) -> RagRun:
    return RagRun.objects.create(manual=manual, kind=kind, status=status)


def mark_run_started(run: RagRun) -> RagRun:
    run.status = RagRun.Status.RUNNING
    run.started_at = timezone.now()
    run.save(update_fields=["status", "started_at"])
    return run


def mark_run_succeeded(run: RagRun, metrics: dict | None = None) -> RagRun:
    run.status = RagRun.Status.SUCCEEDED
    run.finished_at = timezone.now()
    if metrics is not None:
        run.metrics = metrics
    run.save(update_fields=["status", "finished_at", "metrics"])
    return run


def mark_run_failed(run: RagRun, metrics: dict | None = None) -> RagRun:
    run.status = RagRun.Status.FAILED
    run.finished_at = timezone.now()
    if metrics is not None:
        run.metrics = metrics
    run.save(update_fields=["status", "finished_at", "metrics"])
    return run


def emit_event(
    run: RagRun,
    *,
    level: str = RagRunEvent.Level.INFO,
    message: str,
    payload: dict | None = None,
) -> RagRunEvent:
    return RagRunEvent.objects.create(
        run=run, level=level, message=message, payload=payload or {}
    )
