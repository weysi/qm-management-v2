from __future__ import annotations

from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiTypes,
    extend_schema,
    inline_serializer,
)
from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from rag.models import RagRun


@extend_schema(
    tags=["Runs"],
    summary="Get run details and events",
    description=(
        "Returns full details of a pipeline run including all logged events.\n\n"
        "A **RagRun** tracks every pipeline operation (INGEST, PLAN, GENERATE, CHAT). "
        "It records the AI model used, prompt version, timing, and a `metrics` JSON blob "
        "containing step-specific data (e.g. generation report, plan output).\n\n"
        "**RagRunEvent** entries provide granular, timestamped logs within the run "
        "(DEBUG/INFO/WARN/ERROR level) for debugging and monitoring."
    ),
    parameters=[
        OpenApiParameter(name="manual_id", location=OpenApiParameter.PATH, type=str, required=True,
                         description="Manual ID the run belongs to"),
        OpenApiParameter(name="run_id", location=OpenApiParameter.PATH, type=OpenApiTypes.UUID, required=True,
                         description="Run UUID"),
    ],
    responses={
        200: inline_serializer(
            name="RunDetailResponse",
            fields={
                "run": inline_serializer(
                    name="RunDetail",
                    fields={
                        "id": serializers.UUIDField(help_text="Run UUID"),
                        "manual_id": serializers.CharField(help_text="Manual ID"),
                        "kind": serializers.ChoiceField(
                            choices=["INGEST", "PLAN", "GENERATE", "CHAT"],
                            help_text="Pipeline step type: INGEST (file indexing), PLAN (AI planning), GENERATE (template filling), CHAT (RAG Q&A)",
                        ),
                        "status": serializers.ChoiceField(
                            choices=["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"],
                            help_text="Run lifecycle state",
                        ),
                        "prompt_version": serializers.CharField(help_text="Prompt template version (e.g. 'plan_v1')"),
                        "model": serializers.CharField(help_text="OpenAI model identifier used"),
                        "metrics": serializers.DictField(help_text="Step-specific result data (plan, report, etc.)"),
                        "started_at": serializers.DateTimeField(allow_null=True),
                        "finished_at": serializers.DateTimeField(allow_null=True),
                    },
                ),
                "events": serializers.ListField(
                    child=inline_serializer(
                        name="RunEventDetail",
                        fields={
                            "id": serializers.UUIDField(help_text="Event UUID"),
                            "ts": serializers.DateTimeField(help_text="Event timestamp"),
                            "level": serializers.ChoiceField(
                                choices=["DEBUG", "INFO", "WARN", "ERROR"],
                                help_text="Log level",
                            ),
                            "message": serializers.CharField(help_text="Human-readable log message"),
                            "payload": serializers.DictField(help_text="Structured event data (JSON)"),
                        },
                    ),
                    help_text="Events ordered by timestamp (ascending)",
                ),
            },
        ),
        404: inline_serializer(name="RunNotFound", fields={"error": serializers.CharField()}),
    },
)
@api_view(["GET"])
def get_run(request, handbook_id: str, run_id: str):
    run = (
        RagRun.objects.select_related("manual")
        .filter(id=run_id, manual_id=handbook_id)
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
