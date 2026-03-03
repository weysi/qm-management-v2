from __future__ import annotations

from collections.abc import Mapping


CANONICAL_ASSET_LOGO = "assets.logo"
CANONICAL_ASSET_SIGNATURE = "assets.signature"

_ALIASES_BY_CANONICAL: dict[str, tuple[str, ...]] = {
    CANONICAL_ASSET_LOGO: (
        "{{assets.logo}}",
        "__ASSET_LOGO__",
        "[LOGO]",
    ),
    CANONICAL_ASSET_SIGNATURE: (
        "{{assets.signature}}",
        "__ASSET_SIGNATURE__",
        "[SIGNATURE]",
    ),
}

_ALIAS_TO_CANONICAL: dict[str, str] = {
    CANONICAL_ASSET_LOGO: CANONICAL_ASSET_LOGO,
    CANONICAL_ASSET_SIGNATURE: CANONICAL_ASSET_SIGNATURE,
    "assets.logo": CANONICAL_ASSET_LOGO,
    "assets.signature": CANONICAL_ASSET_SIGNATURE,
    "[logo]": CANONICAL_ASSET_LOGO,
    "[signature]": CANONICAL_ASSET_SIGNATURE,
    "[LOGO]": CANONICAL_ASSET_LOGO,
    "[SIGNATURE]": CANONICAL_ASSET_SIGNATURE,
    "__ASSET_LOGO__": CANONICAL_ASSET_LOGO,
    "__ASSET_SIGNATURE__": CANONICAL_ASSET_SIGNATURE,
    "{{assets.logo}}": CANONICAL_ASSET_LOGO,
    "{{assets.signature}}": CANONICAL_ASSET_SIGNATURE,
}


def canonicalize_variable_key(value: str) -> str:
    candidate = value.strip()
    if not candidate:
        return candidate
    return _ALIAS_TO_CANONICAL.get(candidate) or _ALIAS_TO_CANONICAL.get(candidate.lower()) or candidate


def aliases_for_canonical(canonical: str) -> list[str]:
    return list(_ALIASES_BY_CANONICAL.get(canonical.strip(), ()))


def get_variable_aliases(canonical: str) -> list[str]:
    return aliases_for_canonical(canonical)


def canonicalize_placeholder(raw: str) -> str | None:
    candidate = raw.strip()
    if not candidate:
        return None

    if candidate.startswith("{{") and candidate.endswith("}}"):
        candidate = candidate[2:-2].strip()
    if "|" in candidate:
        candidate = candidate.split("|", 1)[0].strip()
    if ":" in candidate and (
        candidate.startswith("__ASSET_")
        or candidate.startswith("[")
    ):
        candidate = candidate.split(":", 1)[0].strip()

    canonical = canonicalize_variable_key(candidate)
    if canonical in {CANONICAL_ASSET_LOGO, CANONICAL_ASSET_SIGNATURE}:
        return canonical
    return None


def canonicalize_variable_map(data: Mapping[str, object] | None) -> dict[str, object]:
    if not data:
        return {}

    normalized: dict[str, object] = {}
    for key, value in data.items():
        canonical = canonicalize_variable_key(str(key))
        if not canonical:
            continue
        normalized[canonical] = value
    return normalized
