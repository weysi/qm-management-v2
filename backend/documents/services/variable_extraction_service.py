from __future__ import annotations

from pathlib import Path

from template_engine.cache import parse_template_cached
from template_engine.collector import collect_variables_with_locations
from template_engine.ooxml import extract_placeholder_locations_from_ooxml_bytes

from .variable_keys import (
    CANONICAL_ASSET_LOGO,
    CANONICAL_ASSET_SIGNATURE,
    canonicalize_variable_key,
    get_variable_aliases,
)

BUILT_IN_ASSET_VARIABLES = {CANONICAL_ASSET_LOGO, CANONICAL_ASSET_SIGNATURE}


def _extract_text_locations(text: str) -> dict[str, list[dict[str, object]]]:
    ast = parse_template_cached(text)
    extracted = collect_variables_with_locations(ast)
    output: dict[str, list[dict[str, object]]] = {}
    for variable, ranges in extracted.items():
        output[variable] = [{"start": item["start"], "end": item["end"]} for item in ranges]
    return output


def extract_variable_contract(path: Path, source_bytes: bytes) -> dict[str, dict[str, object]]:
    ext = path.suffix.lower()
    locations: dict[str, list[dict[str, object]]]

    if ext in {".docx", ".pptx", ".xlsx"}:
        locations = extract_placeholder_locations_from_ooxml_bytes(source_bytes, ext)
    else:
        text = source_bytes.decode("utf-8", errors="ignore")
        locations = _extract_text_locations(text)

    contract: dict[str, dict[str, object]] = {}
    for variable, entries in locations.items():
        canonical_name = canonicalize_variable_key(variable)
        metadata: dict[str, object] = {"locations": entries}
        aliases = get_variable_aliases(canonical_name)
        if aliases:
            metadata["aliases"] = aliases

        contract[canonical_name] = {
            "required": True,
            "source": "user_input",
            "type": "string",
            "metadata": metadata,
        }

    for built_in in BUILT_IN_ASSET_VARIABLES:
        existing = contract.get(built_in, {})
        existing_locations = (
            existing.get("metadata", {}).get("locations", [])
            if isinstance(existing.get("metadata"), dict)
            else []
        )
        contract[built_in] = {
            "required": built_in in contract,
            "source": "system",
            "type": "string",
            "metadata": {
                "locations": existing_locations,
                "aliases": get_variable_aliases(built_in),
            },
        }

    return contract
