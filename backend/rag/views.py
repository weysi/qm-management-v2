from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from rag.models import RagManual, RagRun
from rag.services.chat import answer_chat
from runs.services.run_logger import create_run


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
