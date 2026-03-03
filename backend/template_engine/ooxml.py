from __future__ import annotations

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from .cache import parse_template_cached
from .collector import collect_variables, collect_variables_with_locations
from .ooxml_normalizer import normalize_ooxml_xml
from .renderer import render

OOXML_PART_PREFIXES = {
    "docx": ("word/",),
    "pptx": ("ppt/",),
    "xlsx": ("xl/",),
}


def _is_target_xml(ext: str, name: str) -> bool:
    if not name.endswith(".xml"):
        return False
    prefixes = OOXML_PART_PREFIXES.get(ext)
    if not prefixes:
        return False
    return any(name.startswith(prefix) for prefix in prefixes)


def extract_placeholders_from_ooxml_bytes(source_bytes: bytes, ext: str) -> list[str]:
    ext = ext.lower().lstrip(".")
    if ext not in OOXML_PART_PREFIXES:
        return []

    variables: set[str] = set()
    with ZipFile(BytesIO(source_bytes), "r") as archive:
        for name in sorted(archive.namelist()):
            if not _is_target_xml(ext, name):
                continue
            xml = archive.read(name).decode("utf-8", errors="ignore")
            xml = normalize_ooxml_xml(xml, ext)
            ast = parse_template_cached(xml)
            variables.update(collect_variables(ast))
    return sorted(variables)


def extract_placeholder_locations_from_ooxml_bytes(
    source_bytes: bytes,
    ext: str,
) -> dict[str, list[dict[str, object]]]:
    ext = ext.lower().lstrip(".")
    locations: dict[str, list[dict[str, object]]] = {}
    if ext not in OOXML_PART_PREFIXES:
        return locations

    with ZipFile(BytesIO(source_bytes), "r") as archive:
        for name in sorted(archive.namelist()):
            if not _is_target_xml(ext, name):
                continue
            xml = archive.read(name).decode("utf-8", errors="ignore")
            xml = normalize_ooxml_xml(xml, ext)
            ast = parse_template_cached(xml)
            for variable, ranges in collect_variables_with_locations(ast).items():
                for item in ranges:
                    locations.setdefault(variable, []).append(
                        {
                            "xml_path": name,
                            "start": item["start"],
                            "end": item["end"],
                        }
                    )

    return locations


def apply_placeholders_to_ooxml_bytes(
    source_bytes: bytes,
    ext: str,
    values: dict[str, object],
    *,
    required_variables: set[str] | None = None,
) -> tuple[bytes, list[dict[str, object]], list[dict[str, object]]]:
    ext = ext.lower().lstrip(".")
    if ext not in OOXML_PART_PREFIXES:
        return source_bytes, [], []

    unresolved: list[dict[str, object]] = []
    errors: list[dict[str, object]] = []

    output = BytesIO()
    with ZipFile(BytesIO(source_bytes), "r") as archive_in:
        with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive_out:
            for info in archive_in.infolist():
                data = archive_in.read(info.filename)
                if _is_target_xml(ext, info.filename):
                    xml = data.decode("utf-8", errors="ignore")
                    xml = normalize_ooxml_xml(xml, ext)
                    ast = parse_template_cached(xml)
                    result = render(
                        ast,
                        values,
                        required_variables=required_variables,
                        fail_fast_on_required=False,
                        preserve_unresolved=True,
                    )
                    unresolved.extend(
                        [{"xml_path": info.filename, **item} for item in result.unresolved]
                    )
                    errors.extend(
                        [
                            {
                                "xml_path": info.filename,
                                "error_code": err.code,
                                "message": err.message,
                                "start": err.start,
                                "end": err.end,
                                "variable": err.variable,
                                "path": err.path,
                            }
                            for err in result.errors
                        ]
                    )
                    data = result.output.encode("utf-8")
                archive_out.writestr(info, data)

    return output.getvalue(), unresolved, errors
