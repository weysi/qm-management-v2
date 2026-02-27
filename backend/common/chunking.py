from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ChunkConfig:
    target_chars: int = 2400
    overlap_chars: int = 300


def estimate_token_count(text: str) -> int:
    return max(1, len(text) // 4)


def split_text_deterministic(text: str, config: ChunkConfig) -> list[str]:
    source = (text or "").strip()
    if not source:
        return []

    paragraphs = [part.strip() for part in source.split("\n\n") if part.strip()]
    if not paragraphs:
        paragraphs = [source]

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    def flush_chunk() -> None:
        nonlocal current, current_len
        if not current:
            return
        chunk = "\n\n".join(current).strip()
        if chunk:
            chunks.append(chunk)
        current = []
        current_len = 0

    for paragraph in paragraphs:
        paragraph_len = len(paragraph)
        projected_len = current_len + (2 if current else 0) + paragraph_len

        if projected_len <= config.target_chars:
            current.append(paragraph)
            current_len = projected_len
            continue

        if current:
            flush_chunk()

        if paragraph_len <= config.target_chars:
            current = [paragraph]
            current_len = paragraph_len
            continue

        step = max(1, config.target_chars - config.overlap_chars)
        start = 0
        while start < paragraph_len:
            end = min(paragraph_len, start + config.target_chars)
            window = paragraph[start:end].strip()
            if window:
                chunks.append(window)
            if end >= paragraph_len:
                break
            start += step

    flush_chunk()
    return chunks
