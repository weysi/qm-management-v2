"""Template Engine v2: deterministic, side-effect free template parsing and rendering."""

from .ast import (
    PlaceholderNode,
    SourceRange,
    TemplateAst,
    TemplateNode,
    TextNode,
)
from .cache import parse_template_cached
from .collector import collect_variables, collect_variables_with_locations
from .errors import TemplateEngineError, error_dict
from .parser import parse
from .renderer import RenderResult, render
from .tokenizer import Token, tokenize

__all__ = [
    "PlaceholderNode",
    "SourceRange",
    "TemplateAst",
    "TemplateEngineError",
    "TemplateNode",
    "TextNode",
    "Token",
    "RenderResult",
    "collect_variables",
    "collect_variables_with_locations",
    "error_dict",
    "parse",
    "parse_template_cached",
    "render",
    "tokenize",
]
