from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class SourceRange:
    start: int
    end: int


@dataclass(frozen=True)
class TextNode:
    kind: Literal["text"]
    text: str
    range: SourceRange


@dataclass(frozen=True)
class PlaceholderNode:
    kind: Literal["placeholder"]
    raw_expression: str
    variable: str
    syntax: Literal["mustache"]
    range: SourceRange


TemplateNode = TextNode | PlaceholderNode


@dataclass(frozen=True)
class TemplateAst:
    source: str
    nodes: tuple[TemplateNode, ...]


@dataclass(frozen=True)
class VariableRegistryEntry:
    name: str
    aliases: tuple[str, ...]
    var_type: str
    required: bool
    source: str
    description: str
    constraints: dict
    enum_options: tuple[str, ...]
    default: str | None
    redaction: bool
    forbidden: bool
    generation_policy: str
