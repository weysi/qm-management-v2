from __future__ import annotations

import re
from collections.abc import Iterable


LEGACY_ALIAS_TO_CANONICAL: dict[str, str] = {
    "[LOGO]": "assets.logo",
    "[SIGNATURE]": "assets.signature",
    "__ASSET_LOGO__": "assets.logo",
    "__ASSET_SIGNATURE__": "assets.signature",
}

CANONICAL_TO_LEGACY_ALIASES: dict[str, tuple[str, ...]] = {
    "assets.logo": ("{{assets.logo}}", "__ASSET_LOGO__", "[LOGO]"),
    "assets.signature": ("{{assets.signature}}", "__ASSET_SIGNATURE__", "[SIGNATURE]"),
}

LEGACY_TOKEN_PATTERN = re.compile(
    r"(?<!\\)(\[(LOGO|SIGNATURE)\]|__ASSET_(LOGO|SIGNATURE)__)(?::([A-Za-z0-9_=,\-]+))?",
    re.IGNORECASE,
)


def normalize_legacy_placeholders(template: str) -> str:
    if not template:
        return template

    def _replace(match: re.Match[str]) -> str:
        token = match.group(1).upper()
        canonical = LEGACY_ALIAS_TO_CANONICAL.get(token)
        if not canonical:
            return match.group(0)

        options_raw = (match.group(4) or "").strip()
        options: list[str] = []
        if options_raw:
            for item in options_raw.split(","):
                part = item.strip()
                if "=" not in part:
                    continue
                key, value = [x.strip() for x in part.split("=", 1)]
                if key.lower() in {"w", "h"} and value.isdigit():
                    options.append(f"{key.lower()}:{value}")
        suffix = "".join(f"|{opt}" for opt in options)
        return "{{" + canonical + suffix + "}}"

    return LEGACY_TOKEN_PATTERN.sub(_replace, template)


def get_aliases_for_canonical(name: str) -> tuple[str, ...]:
    return CANONICAL_TO_LEGACY_ALIASES.get(name.strip(), ())


def normalize_alias_map(entries: Iterable[dict]) -> dict[str, str]:
    alias_to_name: dict[str, str] = {}

    for alias, canonical in LEGACY_ALIAS_TO_CANONICAL.items():
        alias_to_name[alias] = canonical
        alias_to_name[alias.lower()] = canonical
        alias_to_name[alias.upper()] = canonical

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
    return (
        alias_to_name.get(candidate)
        or alias_to_name.get(candidate.lower())
        or alias_to_name.get(candidate.upper())
        or LEGACY_ALIAS_TO_CANONICAL.get(candidate)
        or LEGACY_ALIAS_TO_CANONICAL.get(candidate.upper())
        or candidate
    )
