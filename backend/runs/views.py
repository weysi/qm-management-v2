from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from rag.models import RagRun


@api_view(["GET"])
def get_run(request, manual_id: str, run_id: str):
    run = (
        RagRun.objects.select_related("manual")
        .filter(id=run_id, manual_id=manual_id)
        .first()
    )
    if run is None:
        return Response(
            {"error": "Run not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    events = [
        {
            "id": str(event.id),
            "ts": event.ts.isoformat(),
            "level": event.level,
            "message": event.message,
            "payload": event.payload,
        }
        for event in run.events.order_by("ts")
    ]
    return Response(
        {
            "run": {
                "id": str(run.id),
                "manual_id": str(run.manual_id),
                "kind": run.kind,
                "status": run.status,
                "prompt_version": run.prompt_version,
                "model": run.model,
                "metrics": run.metrics,
                "started_at": run.started_at.isoformat() if run.started_at else None,
                "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            },
            "events": events,
        },
        status=status.HTTP_200_OK,
    )
