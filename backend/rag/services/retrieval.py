from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.db import connection

from common.openai_client import embed_texts
from rag.models import RagManual
from packages.catalog import get_package_config


@dataclass(frozen=True)
class RetrievalFilters:
    role: str | None = None
    asset_ids: list[str] | None = None
    language: str | None = None
    package_code: str | None = None


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


def _fetch_vector_rows(
    *,
    manual_id: str,
    query_vector: list[float],
    filters: RetrievalFilters,
    top_k: int,
) -> list[dict[str, Any]]:
    clauses = ["a.manual_id = %s"]

    if filters.role and filters.role != "ANY":
        clauses.append("a.role = %s")
    if filters.asset_ids:
        clauses.append("a.id = ANY(%s)")
    if filters.language and filters.language != "ANY":
        clauses.append("c.metadata->>'language' = %s")

    query = f"""
        SELECT c.id, c.text, c.metadata, a.id::text AS asset_id, a.package_rel_path, a.role
        FROM rag_document_chunk c
        JOIN rag_asset a ON a.id = c.asset_id
        WHERE {' AND '.join(clauses)}
        ORDER BY c.embedding <=> %s::vector
        LIMIT %s
    """
    # move vector + limit to end to match dynamic params order
    dynamic_params = [manual_id]
    if filters.role and filters.role != "ANY":
        dynamic_params.append(filters.role)
    if filters.asset_ids:
        dynamic_params.append(filters.asset_ids)
    if filters.language and filters.language != "ANY":
        dynamic_params.append(filters.language)
    dynamic_params.extend([_vector_literal(query_vector), top_k])

    with connection.cursor() as cursor:
        cursor.execute(query, dynamic_params)
        rows = cursor.fetchall()
    return [
        {
            "chunk_id": row[0],
            "text": row[1],
            "metadata": row[2] or {},
            "asset_id": row[3],
            "asset_path": row[4],
            "role": row[5],
        }
        for row in rows
    ]


def _fetch_fts_rows(
    *,
    manual: RagManual,
    query: str,
    filters: RetrievalFilters,
    top_k: int,
) -> list[dict[str, Any]]:
    config = get_package_config(manual.package_code, manual.package_version)
    clauses = ["a.manual_id = %s", "c.tsv @@ plainto_tsquery(%s, %s)"]
    params: list[Any] = [str(manual.id), config["fts_config"], query]

    if filters.role and filters.role != "ANY":
        clauses.append("a.role = %s")
        params.append(filters.role)
    if filters.asset_ids:
        clauses.append("a.id = ANY(%s)")
        params.append(filters.asset_ids)
    if filters.language and filters.language != "ANY":
        clauses.append("c.metadata->>'language' = %s")
        params.append(filters.language)

    params.extend([config["fts_config"], query, top_k])
    sql = f"""
        SELECT c.id, c.text, c.metadata, a.id::text AS asset_id, a.package_rel_path, a.role
        FROM rag_document_chunk c
        JOIN rag_asset a ON a.id = c.asset_id
        WHERE {' AND '.join(clauses)}
        ORDER BY ts_rank(c.tsv, plainto_tsquery(%s, %s)) DESC, c.id ASC
        LIMIT %s
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        rows = cursor.fetchall()
    return [
        {
            "chunk_id": row[0],
            "text": row[1],
            "metadata": row[2] or {},
            "asset_id": row[3],
            "asset_path": row[4],
            "role": row[5],
        }
        for row in rows
    ]


def retrieve_context(
    *,
    manual_id: str,
    query: str,
    filters: RetrievalFilters,
    top_k_vec: int = 20,
    top_k_fts: int = 20,
    top_n: int = 10,
) -> list[dict[str, Any]]:
    manual = RagManual.objects.get(id=manual_id)
    vectors, _model = embed_texts([query], settings.OPENAI_EMBED_MODEL)
    vector_rows = _fetch_vector_rows(
        manual_id=manual_id, query_vector=vectors[0], filters=filters, top_k=top_k_vec
    )
    fts_rows = _fetch_fts_rows(manual=manual, query=query, filters=filters, top_k=top_k_fts)

    return rrf_merge(vector_rows, fts_rows, top_n=top_n)


def rrf_merge(
    vector_rows: list[dict[str, Any]],
    fts_rows: list[dict[str, Any]],
    *,
    top_n: int,
    k: int = 60,
) -> list[dict[str, Any]]:
    scores: dict[str, float] = {}
    values: dict[str, dict[str, Any]] = {}

    for rank, row in enumerate(vector_rows, start=1):
        chunk_id = row["chunk_id"]
        values[chunk_id] = row
        scores[chunk_id] = scores.get(chunk_id, 0.0) + (1.0 / (k + rank))

    for rank, row in enumerate(fts_rows, start=1):
        chunk_id = row["chunk_id"]
        values[chunk_id] = row
        scores[chunk_id] = scores.get(chunk_id, 0.0) + (1.0 / (k + rank))

    ordered = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    return [values[chunk_id] for chunk_id, _score in ordered[:top_n]]
