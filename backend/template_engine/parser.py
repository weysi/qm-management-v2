from __future__ import annotations

import re

from .ast import PlaceholderNode, SourceRange, TemplateAst, TextNode
from .errors import TemplateEngineError
from .tokenizer import Token


PATH_PATTERN = re.compile(r"^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*$")


def parse(tokens: list[Token], source: str) -> TemplateAst:
    nodes = []
    for token in tokens:
        token_range = SourceRange(start=token.start, end=token.end)
        if token.kind == "text":
            nodes.append(TextNode(kind="text", text=token.value, range=token_range))
            continue

        variable = token.value.strip()
        if not PATH_PATTERN.match(variable):
            raise TemplateEngineError(
                code="INVALID_VARIABLE_PATH",
                message=f"Invalid variable path: {variable}",
                start=token.start,
                end=token.end,
                variable=variable,
                path=variable,
            )

        nodes.append(
            PlaceholderNode(
                kind="placeholder",
                raw_expression=token.value,
                variable=variable,
                syntax=token.syntax,
                range=token_range,
            )
        )

    return TemplateAst(source=source, nodes=tuple(nodes))
