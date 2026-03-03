from __future__ import annotations

from collections.abc import Iterable


def normalize_alias_map(entries: Iterable[dict]) -> dict[str, str]:
    alias_to_name: dict[str, str] = {}
    for entry in entries:
        name = str(entry.get("name") or entry.get("token") or "").strip()
        if not name:
            continue
        aliases = entry.get("aliases") or []
        if isinstance(aliases, tuple):
            aliases = list(aliases)
        alias_to_name[name] = name
        alias_to_name[name.lower()] = name
        alias_to_name[name.upper()] = name
        token = entry.get("token")
        if isinstance(token, str) and token.strip():
            alias_to_name[token] = name
            alias_to_name[token.lower()] = name
            alias_to_name[token.upper()] = name
        for alias in aliases:
            alias_text = str(alias).strip()
            if not alias_text:
                continue
            alias_to_name[alias_text] = name
            alias_to_name[alias_text.lower()] = name
            alias_to_name[alias_text.upper()] = name
    return alias_to_name


def canonicalize_name(name: str, alias_to_name: dict[str, str]) -> str:
    candidate = name.strip()
    if not candidate:
        return candidate
    return alias_to_name.get(candidate) or alias_to_name.get(candidate.lower()) or alias_to_name.get(candidate.upper()) or candidate
