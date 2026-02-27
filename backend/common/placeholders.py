from __future__ import annotations

import re
from collections import Counter


PLACEHOLDER_PATTERN = re.compile(r"\{\{([A-Z0-9_]+)\}\}")


def extract_placeholder_tokens(text: str) -> list[str]:
    return [match.group(1) for match in PLACEHOLDER_PATTERN.finditer(text)]


def count_placeholder_tokens(text: str) -> Counter[str]:
    return Counter(extract_placeholder_tokens(text))


def replace_placeholders(text: str, values: dict[str, str]) -> tuple[str, list[str]]:
    unresolved: set[str] = set()

    def _replace(match: re.Match[str]) -> str:
        token = match.group(1)
        value = values.get(token)
        if value is None or value.strip() == "":
            unresolved.add(token)
            return match.group(0)
        return value

    return PLACEHOLDER_PATTERN.sub(_replace, text), sorted(unresolved)
