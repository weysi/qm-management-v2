from __future__ import annotations

from dataclasses import dataclass
import re

from .variable_keys import canonicalize_placeholder


@dataclass(frozen=True)
class PlaceholderOccurrence:
    key: str
    raw: str
    start: int
    end: int
    width_px: int | None = None
    height_px: int | None = None


_MUSTACHE_PATTERN = re.compile(r"\{\{([^{}]+)\}\}")
_LEGACY_PATTERN = re.compile(
    r"(?<!\\)(\[(LOGO|SIGNATURE)\]|__ASSET_(LOGO|SIGNATURE)__)(?::([A-Za-z0-9_=,\-]+))?",
    re.IGNORECASE,
)


def _parse_option_parts(parts: list[str]) -> tuple[int | None, int | None]:
    width: int | None = None
    height: int | None = None
    for part in parts:
        item = part.strip()
        if not item:
            continue
        if ":" in item:
            key, raw_value = [x.strip().lower() for x in item.split(":", 1)]
        elif "=" in item:
            key, raw_value = [x.strip().lower() for x in item.split("=", 1)]
        else:
            continue
        if not raw_value.isdigit():
            continue
        value = int(raw_value)
        if key == "w":
            width = value
        elif key == "h":
            height = value
    return width, height


def _extract_from_mustache(text: str) -> list[PlaceholderOccurrence]:
    matches: list[PlaceholderOccurrence] = []
    for match in _MUSTACHE_PATTERN.finditer(text):
        raw = match.group(0)
        expression = (match.group(1) or "").strip()
        if not expression:
            continue
        segments = [segment.strip() for segment in expression.split("|") if segment.strip()]
        if not segments:
            continue
        canonical = canonicalize_placeholder(segments[0])
        if not canonical:
            continue
        width_px, height_px = _parse_option_parts(segments[1:])
        matches.append(
            PlaceholderOccurrence(
                key=canonical,
                raw=raw,
                start=match.start(),
                end=match.end(),
                width_px=width_px,
                height_px=height_px,
            )
        )
    return matches


def _extract_from_legacy(text: str) -> list[PlaceholderOccurrence]:
    matches: list[PlaceholderOccurrence] = []
    for match in _LEGACY_PATTERN.finditer(text):
        token = (match.group(1) or "").strip()
        canonical = canonicalize_placeholder(token)
        if not canonical:
            continue
        width_px, height_px = _parse_option_parts((match.group(4) or "").split(","))
        matches.append(
            PlaceholderOccurrence(
                key=canonical,
                raw=match.group(0),
                start=match.start(),
                end=match.end(),
                width_px=width_px,
                height_px=height_px,
            )
        )
    return matches


def collect_asset_occurrences(text: str, allowed_keys: set[str]) -> list[PlaceholderOccurrence]:
    if not text:
        return []

    found = _extract_from_mustache(text) + _extract_from_legacy(text)
    filtered = [item for item in found if item.key in allowed_keys]
    filtered.sort(key=lambda item: (item.start, item.end))
    return filtered
