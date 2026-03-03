from __future__ import annotations

from .ast import TemplateAst


def collect_variables(ast: TemplateAst) -> set[str]:
    return {
        node.variable
        for node in ast.nodes
        if getattr(node, "kind", None) == "placeholder"
    }


def collect_variables_with_locations(ast: TemplateAst) -> dict[str, list[dict[str, int]]]:
    collected: dict[str, list[dict[str, int]]] = {}
    for node in ast.nodes:
        if getattr(node, "kind", None) != "placeholder":
            continue
        collected.setdefault(node.variable, []).append(
            {"start": node.range.start, "end": node.range.end}
        )
    return collected
