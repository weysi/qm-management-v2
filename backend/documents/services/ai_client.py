from __future__ import annotations

import time
from dataclasses import dataclass

from django.conf import settings
from openai import OpenAI


@dataclass(frozen=True)
class RewriteResponse:
    content: str
    model: str
    usage: dict[str, int]


class AiClientError(RuntimeError):
    pass


class AiClient:
    def __init__(self) -> None:
        if not settings.OPENAI_API_KEY:
            raise AiClientError("OPENAI_API_KEY is not configured")
        self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self._model = settings.OPENAI_REWRITE_MODEL
        self._timeout = settings.AI_REWRITE_TIMEOUT_SECONDS
        self._retries = settings.AI_REWRITE_RETRIES

    def rewrite(self, *, instruction: str, content: str) -> RewriteResponse:
        last_error: Exception | None = None

        for attempt in range(self._retries + 1):
            try:
                response = self._client.chat.completions.create(
                    model=self._model,
                    timeout=self._timeout,
                    temperature=0.2,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You rewrite the provided document content exactly as requested. "
                                "Return plain text only. Keep placeholders like {{assets.logo}} intact unless instructed otherwise."
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                f"Instruction:\n{instruction}\n\n"
                                f"Document content:\n{content}"
                            ),
                        },
                    ],
                )
                text = response.choices[0].message.content or ""
                if not text.strip():
                    raise AiClientError("AI returned empty rewrite output")

                usage = {
                    "prompt_tokens": int((response.usage.prompt_tokens if response.usage else 0) or 0),
                    "completion_tokens": int((response.usage.completion_tokens if response.usage else 0) or 0),
                    "total_tokens": int((response.usage.total_tokens if response.usage else 0) or 0),
                }
                return RewriteResponse(content=text, model=response.model, usage=usage)
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt >= self._retries:
                    break
                time.sleep(min(2**attempt, 4))

        raise AiClientError(f"AI rewrite failed: {last_error}")
