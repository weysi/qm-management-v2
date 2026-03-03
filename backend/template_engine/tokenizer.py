from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .errors import TemplateEngineError


@dataclass(frozen=True)
class Token:
    kind: Literal["text", "placeholder"]
    value: str
    raw: str
    start: int
    end: int
    syntax: Literal["text", "mustache"]


def _find_unescaped(haystack: str, needle: str, start: int) -> int:
    index = start
    while True:
        pos = haystack.find(needle, index)
        if pos == -1:
            return -1
        if pos > 0 and haystack[pos - 1] == "\\":
            index = pos + len(needle)
            continue
        return pos


def _append_text(tokens: list[Token], text: str, start: int, end: int) -> None:
    if not text:
        return
    if tokens and tokens[-1].kind == "text" and tokens[-1].end == start:
        prev = tokens[-1]
        tokens[-1] = Token(
            kind="text",
            value=prev.value + text,
            raw=prev.raw + text,
            start=prev.start,
            end=end,
            syntax="text",
        )
        return
    tokens.append(
        Token(
            kind="text",
            value=text,
            raw=text,
            start=start,
            end=end,
            syntax="text",
        )
    )


def tokenize(template: str) -> list[Token]:
    tokens: list[Token] = []
    i = 0
    length = len(template)

    while i < length:
        if template.startswith("\\{{", i):
            _append_text(tokens, "{{", i, i + 3)
            i += 3
            continue
        if template.startswith("{{", i):
            close = _find_unescaped(template, "}}", i + 2)
            if close == -1:
                raise TemplateEngineError(
                    code="UNTERMINATED_MUSTACHE",
                    message="Unterminated mustache placeholder",
                    start=i,
                    end=length,
                )
            raw_expr = template[i + 2 : close]
            expr = raw_expr.strip()
            if not expr:
                raise TemplateEngineError(
                    code="EMPTY_PLACEHOLDER",
                    message="Placeholder expression cannot be empty",
                    start=i,
                    end=close + 2,
                )
            tokens.append(
                Token(
                    kind="placeholder",
                    value=expr,
                    raw=template[i : close + 2],
                    start=i,
                    end=close + 2,
                    syntax="mustache",
                )
            )
            i = close + 2
            continue

        next_candidates = [p for p in [template.find("{{", i), template.find("\\{{", i)] if p != -1]
        next_start = min(next_candidates) if next_candidates else length
        _append_text(tokens, template[i:next_start], i, next_start)
        i = next_start

    return tokens
