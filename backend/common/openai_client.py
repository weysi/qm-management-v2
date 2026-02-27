from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from openai import OpenAI


_client: OpenAI | None = None


def get_openai_client() -> OpenAI:
    global _client
    if _client is None:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        _client = OpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


@dataclass
class ChatJsonResult:
    payload: dict[str, Any]
    model: str


def _strip_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned[: -3]
    return cleaned.strip()


def chat_json(
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0,
    max_tokens: int = 2000,
    retries: int = 1,
) -> ChatJsonResult:
    client = get_openai_client()
    last_error: Exception | None = None

    for _attempt in range(retries + 1):
        response = client.chat.completions.create(
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        message = response.choices[0].message.content or "{}"
        try:
            parsed = json.loads(_strip_fence(message))
            if not isinstance(parsed, dict):
                raise ValueError("JSON root must be an object")
            return ChatJsonResult(payload=parsed, model=response.model)
        except Exception as exc:  # pragma: no cover - defensive
            last_error = exc

    raise RuntimeError(f"Model did not return valid JSON: {last_error}")


def embed_texts(texts: list[str], model: str) -> tuple[list[list[float]], str]:
    client = get_openai_client()
    response = client.embeddings.create(model=model, input=texts)
    vectors = [item.embedding for item in response.data]
    return vectors, response.model
