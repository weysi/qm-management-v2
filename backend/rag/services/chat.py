from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.conf import settings

from common.openai_client import chat_json
from prompts.registry import get_prompt
from rag.models import RagRun
from rag.services.retrieval import RetrievalFilters, retrieve_context
from runs.services.run_logger import emit_event, mark_run_failed, mark_run_started, mark_run_succeeded


@dataclass
class ChatResult:
    answer_markdown: str
    citations: list[dict[str, str]]
    suggested_followups: list[str]


def _validate_router_payload(payload: dict[str, Any]) -> dict[str, Any]:
    intent = str(payload.get("intent", "STANDARD_QA"))
    filters = payload.get("filters", {})
    if not isinstance(filters, dict):
        filters = {}
    role = str(filters.get("role", "ANY"))
    language = str(filters.get("language", "ANY"))
    top_n = int(payload.get("topN", 10))
    top_n = min(max(top_n, 1), 10)
    return {"intent": intent, "filters": {"role": role, "language": language}, "topN": top_n}


def _validate_answer_payload(
    payload: dict[str, Any], allowed_chunk_ids: set[str]
) -> ChatResult:
    answer = str(payload.get("answer_markdown", "")).strip()
    citations_raw = payload.get("citations", [])
    followups_raw = payload.get("suggested_followups", [])

    citations: list[dict[str, str]] = []
    if isinstance(citations_raw, list):
        for item in citations_raw:
            if not isinstance(item, dict):
                continue
            chunk_id = str(item.get("chunk_id", ""))
            asset_path = str(item.get("asset_path", ""))
            if chunk_id in allowed_chunk_ids:
                citations.append({"chunk_id": chunk_id, "asset_path": asset_path})

    followups: list[str] = []
    if isinstance(followups_raw, list):
        followups = [str(value) for value in followups_raw[:3] if str(value).strip()]

    return ChatResult(
        answer_markdown=answer,
        citations=citations,
        suggested_followups=followups,
    )


def answer_chat(*, run: RagRun, manual_id: str, message: str, session_id: str | None = None) -> ChatResult:
    mark_run_started(run)
    emit_event(run, message="Chat request received", payload={"manual_id": manual_id, "session_id": session_id})

    try:
        router_version, router_prompt = get_prompt("router", "v1")
        router_result = chat_json(
            model=settings.OPENAI_ROUTER_MODEL,
            system_prompt=router_prompt,
            user_prompt=f"Message: {message}",
            temperature=0,
            retries=1,
        )
        routing = _validate_router_payload(router_result.payload)
        run.prompt_version = f"router:{router_version}"
        run.model = router_result.model
        run.save(update_fields=["prompt_version", "model"])
        emit_event(run, message="Chat router completed", payload={"routing": routing, "model": router_result.model, "prompt_version": router_version})

        filters = RetrievalFilters(
            role=routing["filters"]["role"],
            language=routing["filters"]["language"],
        )
        chunks = retrieve_context(
            manual_id=manual_id,
            query=message,
            filters=filters,
            top_n=routing["topN"],
        )
        emit_event(run, message="Retrieval completed", payload={"chunk_count": len(chunks)})

        if not chunks:
            fallback = ChatResult(
                answer_markdown="I don't have enough context to answer this question reliably.",
                citations=[],
                suggested_followups=[
                    "Upload additional references for this manual.",
                    "Ask a more specific question with clause or section context.",
                ],
            )
            mark_run_succeeded(
                run,
                metrics={"chunk_count": 0, "citations": 0, "session_id": session_id},
            )
            return fallback

        context = "\n\n".join(
            [
                f"chunk_id={chunk['chunk_id']} path={chunk['asset_path']} role={chunk['role']}\n{chunk['text']}"
                for chunk in chunks
            ]
        )
        answer_version, answer_prompt = get_prompt("chat_answer", "v1")
        answer_result = chat_json(
            model=settings.OPENAI_CHAT_MODEL,
            system_prompt=answer_prompt,
            user_prompt=f"User message:\n{message}\n\nContext chunks:\n{context}",
            temperature=0,
            retries=1,
        )
        run.prompt_version = f"router:{router_version},chat_answer:{answer_version}"
        run.model = answer_result.model
        run.save(update_fields=["prompt_version", "model"])

        result = _validate_answer_payload(
            answer_result.payload, {item["chunk_id"] for item in chunks}
        )
        emit_event(
            run,
            message="Chat response generated",
            payload={
                "prompt_version": answer_version,
                "model": answer_result.model,
                "citations": result.citations,
            },
        )
        mark_run_succeeded(
            run,
            metrics={
                "chunk_count": len(chunks),
                "citations": len(result.citations),
                "session_id": session_id,
            },
        )
        return result
    except Exception as exc:  # noqa: BLE001
        emit_event(run, level="ERROR", message="Chat failed", payload={"error": str(exc)})
        mark_run_failed(run, metrics={"error": str(exc)})
        raise
