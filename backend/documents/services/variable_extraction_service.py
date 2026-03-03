from __future__ import annotations

from pathlib import Path

from template_engine.cache import parse_template_cached
from template_engine.collector import collect_variables_with_locations
from template_engine.ooxml import extract_placeholder_locations_from_ooxml_bytes

BUILT_IN_ASSET_VARIABLES = {"assets.logo", "assets.signature"}


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

    if ext == ".docx":
        locations = extract_placeholder_locations_from_ooxml_bytes(source_bytes, ext)
    else:
        text = source_bytes.decode("utf-8", errors="ignore")
        locations = _extract_text_locations(text)

    contract: dict[str, dict[str, object]] = {}
    for variable, entries in locations.items():
        contract[variable] = {
            "required": True,
            "source": "user_input",
            "type": "string",
            "metadata": {"locations": entries},
        }

    for built_in in BUILT_IN_ASSET_VARIABLES:
        contract[built_in] = {
            "required": built_in in contract,
            "source": "system",
            "type": "string",
            "metadata": {"locations": contract.get(built_in, {}).get("metadata", {}).get("locations", [])},
        }

    return contract
