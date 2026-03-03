from __future__ import annotations

from .ast import PlaceholderNode


def unresolved_entry(node: PlaceholderNode, canonical: str) -> dict[str, object]:
    return {
        "variable": canonical,
        "raw_variable": node.variable,
        "start": node.range.start,
        "end": node.range.end,
    }
