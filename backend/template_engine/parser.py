from __future__ import annotations

import re

from .ast import PlaceholderNode, SourceRange, TemplateAst, TextNode
from .errors import TemplateEngineError
from .tokenizer import Token


PATH_PATTERN = re.compile(r"^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*$")
OPTION_SEGMENT_PATTERN = re.compile(r"^[A-Za-z_][\w-]*\s*:\s*[-A-Za-z0-9_.]+$")


def _parse_expression(token: Token) -> tuple[str, str]:
    raw = token.value.strip()
    if not raw:
        raise TemplateEngineError(
            code="EMPTY_PLACEHOLDER",
            message="Placeholder expression cannot be empty",
            start=token.start,
            end=token.end,
        )

    segments = [segment.strip() for segment in raw.split("|")]
    variable = segments[0]
    if not PATH_PATTERN.match(variable):
        raise TemplateEngineError(
            code="INVALID_VARIABLE_PATH",
            message=f"Invalid variable path: {variable}",
            start=token.start,
            end=token.end,
            variable=variable,
            path=variable,
        )

    for segment in segments[1:]:
        if not segment:
            raise TemplateEngineError(
                code="INVALID_PLACEHOLDER_OPTION",
                message=f"Invalid placeholder option in expression: {raw}",
                start=token.start,
                end=token.end,
                variable=variable,
                path=variable,
            )
        if not OPTION_SEGMENT_PATTERN.match(segment):
            raise TemplateEngineError(
                code="INVALID_PLACEHOLDER_OPTION",
                message=f"Invalid placeholder option '{segment}' in expression: {raw}",
                start=token.start,
                end=token.end,
                variable=variable,
                path=variable,
            )
    return variable, raw


def parse(tokens: list[Token], source: str) -> TemplateAst:
    nodes = []
    for token in tokens:
        token_range = SourceRange(start=token.start, end=token.end)
        if token.kind == "text":
            nodes.append(TextNode(kind="text", text=token.value, range=token_range))
            continue

        variable, raw_expression = _parse_expression(token)

        nodes.append(
            PlaceholderNode(
                kind="placeholder",
                raw_expression=raw_expression,
                variable=variable,
                syntax=token.syntax,
                range=token_range,
            )
        )

    return TemplateAst(source=source, nodes=tuple(nodes))
