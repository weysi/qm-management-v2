from __future__ import annotations

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from rag.models import RagManual, RagRun
from rag.services.chat import answer_chat
from runs.services.run_logger import create_run


@extend_schema(
    tags=["RAG Chat"],
    summary="Chat with indexed documents",
    description=(
        "Retrieval-Augmented Generation chat endpoint.\n\n"
        "**Pipeline:**\n"
        "1. **Router** — AI classifies user intent (QA, SEARCH, SUMMARY, OFF_TOPIC) using `router_v1` prompt\n"
        "2. **Retrieval** — Hybrid search: vector similarity (HNSW cosine) + PostgreSQL full-text search, "
        "merged via Reciprocal Rank Fusion (RRF, k=60)\n"
        "3. **Answer** — AI generates a markdown answer with citations using `chat_answer_v1` prompt\n\n"
        "Each chat call creates a tracked `RagRun` of kind CHAT for observability.\n\n"
        "`session_id` is optional and currently unused — reserved for future multi-turn context."
    ),
    request=inline_serializer(
        name="ChatRequest",
        fields={
            "manual_id": serializers.CharField(help_text="Manual ID to search within"),
            "message": serializers.CharField(help_text="User's question or message"),
            "session_id": serializers.CharField(
                required=False, allow_null=True,
                help_text="Optional session ID for multi-turn context (reserved for future use)",
            ),
        },
    ),
    responses={
        200: inline_serializer(
            name="ChatResponse",
            fields={
                "answer_markdown": serializers.CharField(
                    help_text="AI-generated answer in markdown format with embedded citations",
                ),
                "citations": serializers.ListField(
                    child=serializers.DictField(),
                    help_text="Array of citation objects referencing source chunks",
                ),
                "suggested_followups": serializers.ListField(
                    child=serializers.CharField(),
                    help_text="AI-suggested follow-up questions",
                ),
                "run_id": serializers.UUIDField(help_text="ID of the CHAT run for tracking"),
            },
        ),
        400: inline_serializer(name="ChatBadRequest", fields={"error": serializers.CharField()}),
        404: inline_serializer(name="ChatManualNotFound", fields={"error": serializers.CharField()}),
    },
)
@api_view(["POST"])
def chat(request):
    manual_id = str(request.data.get("manual_id", "")).strip()
    message = str(request.data.get("message", "")).strip()
    session_id = request.data.get("session_id")
    session_id = str(session_id).strip() if session_id is not None else None

    if not manual_id or not message:
        return Response(
            {"error": "manual_id and message are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    manual = RagManual.objects.filter(id=manual_id).first()
    if manual is None:
        return Response({"error": "Manual not found"}, status=status.HTTP_404_NOT_FOUND)

    run = create_run(manual, RagRun.Kind.CHAT)
    result = answer_chat(
        run=run,
        manual_id=manual_id,
        message=message,
        session_id=session_id,
    )
    run.refresh_from_db()

    return Response(
        {
            "answer_markdown": result.answer_markdown,
            "citations": result.citations,
            "suggested_followups": result.suggested_followups,
            "run_id": str(run.id),
        },
        status=status.HTTP_200_OK,
    )
