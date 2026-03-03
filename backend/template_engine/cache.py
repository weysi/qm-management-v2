from __future__ import annotations

from functools import lru_cache

from .parser import parse
from .tokenizer import tokenize


@lru_cache(maxsize=2048)
def parse_template_cached(template: str):
    return parse(tokenize(template), template)
