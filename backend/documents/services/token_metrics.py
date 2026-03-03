from __future__ import annotations

import logging
from pathlib import Path


logger = logging.getLogger(__name__)

_encoder = None


def _get_encoder():
    global _encoder
    if _encoder is not None:
        return _encoder

    try:
        import tiktoken  # type: ignore

        _encoder = tiktoken.encoding_for_model("gpt-4o-mini")
    except Exception:  # pragma: no cover - optional dependency
        _encoder = False
    return _encoder


def estimate_token_count(text: str) -> int:
    if not text:
        return 0
    encoder = _get_encoder()
    if encoder:
        return len(encoder.encode(text))
    return max(1, len(text) // 4)


def estimate_token_count_from_bytes(payload: bytes) -> int:
    if not payload:
        return 0
    text = payload.decode("utf-8", errors="ignore")
    if text.strip():
        return estimate_token_count(text)
    return max(1, len(payload) // 4)


def log_token_metrics(*, path: Path, estimated_token_count: int) -> None:
    logger.info(
        "DOCUMENT_TOKEN_METRIC filename=%s estimated_token_count=%s output_path=%s",
        path.name,
        estimated_token_count,
        str(path.resolve()),
    )

