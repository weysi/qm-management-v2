from __future__ import annotations

import re

from .variable_keys import CANONICAL_ASSET_LOGO, CANONICAL_ASSET_SIGNATURE


CURRENT_DATE_KEYS = {
    "date",
    "validity_date",
    "document.current_date",
    "document.validity_date",
}

_ASSET_ALIASES = {
    "assets.logo": CANONICAL_ASSET_LOGO,
    "asset_logo": CANONICAL_ASSET_LOGO,
    "assets_logo": CANONICAL_ASSET_LOGO,
    "logo": CANONICAL_ASSET_LOGO,
    "company_logo": CANONICAL_ASSET_LOGO,
    "[logo]": CANONICAL_ASSET_LOGO,
    "__asset_logo__": CANONICAL_ASSET_LOGO,
    "company.logo": CANONICAL_ASSET_LOGO,
    "assets.signature": CANONICAL_ASSET_SIGNATURE,
    "asset_signature": CANONICAL_ASSET_SIGNATURE,
    "assets_signature": CANONICAL_ASSET_SIGNATURE,
    "signature": CANONICAL_ASSET_SIGNATURE,
    "company_signature": CANONICAL_ASSET_SIGNATURE,
    "[signature]": CANONICAL_ASSET_SIGNATURE,
    "__asset_signature__": CANONICAL_ASSET_SIGNATURE,
    "company.signature": CANONICAL_ASSET_SIGNATURE,
}


def extract_placeholder_segments(raw: str) -> list[str]:
    token = (raw or "").strip()
    if not token:
        return []

    if token.startswith("{{") and token.endswith("}}"):
        token = token[2:-2].strip()

    if token.startswith("__ASSET_") or token.startswith("["):
        token = token.split(":", 1)[0].strip()

    parts = [part.strip() for part in re.split(r"[|,]", token) if part.strip()]
    return parts


def canonicalize_placeholder_key(raw: str) -> str:
    segments = extract_placeholder_segments(raw)
    if not segments:
        return ""

    lowered = re.sub(r"\s+", "", segments[0]).lower()
    if not lowered:
        return ""

    return _ASSET_ALIASES.get(lowered, lowered)


def placeholder_has_modifier(raw: str, modifier: str) -> bool:
    normalized_modifier = re.sub(r"\s+", "", (modifier or "")).lower()
    if not normalized_modifier:
        return False
    return any(
        re.sub(r"\s+", "", part).lower() == normalized_modifier
        for part in extract_placeholder_segments(raw)[1:]
    )


def is_current_date_placeholder(*, raw: str | None = None, canonical_key: str | None = None) -> bool:
    key = canonicalize_placeholder_key(raw or "") if raw else re.sub(r"\s+", "", canonical_key or "").lower()
    if not key:
        return False

    if key in CURRENT_DATE_KEYS:
        return True

    if raw and placeholder_has_modifier(raw, "date"):
        return True

    return key.endswith("_date")
