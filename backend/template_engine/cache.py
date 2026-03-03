from __future__ import annotations

from functools import lru_cache

from .compat import normalize_legacy_placeholders
from .parser import parse
from .tokenizer import tokenize


@lru_cache(maxsize=2048)
def parse_template_cached(template: str):
    normalized = normalize_legacy_placeholders(template)
    return parse(tokenize(normalized), normalized)
