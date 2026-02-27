from __future__ import annotations

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from common.placeholders import replace_placeholders, extract_placeholder_tokens


OOXML_PART_PREFIXES = {
    "docx": ("word/",),
    "pptx": ("ppt/",),
    "xlsx": ("xl/",),
}


def _ext_from_asset(asset) -> str:
    return (asset.file_ext or "").lower().lstrip(".")


def _is_target_xml(ext: str, name: str) -> bool:
    if not name.endswith(".xml"):
        return False
    prefixes = OOXML_PART_PREFIXES.get(ext)
    if not prefixes:
        return False
    return any(name.startswith(prefix) for prefix in prefixes)


def apply_placeholders_to_ooxml_bytes(
    source_bytes: bytes, ext: str, values: dict[str, str]
) -> tuple[bytes, list[str]]:
    ext = ext.lower().lstrip(".")
    if ext not in OOXML_PART_PREFIXES:
        return source_bytes, []

    unresolved: set[str] = set()
    output = BytesIO()
    with ZipFile(BytesIO(source_bytes), "r") as archive_in:
        with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive_out:
            for info in archive_in.infolist():
                data = archive_in.read(info.filename)
                if _is_target_xml(ext, info.filename):
                    xml = data.decode("utf-8", errors="ignore")
                    replaced, unresolved_local = replace_placeholders(xml, values)
                    unresolved.update(unresolved_local)
                    data = replaced.encode("utf-8")
                archive_out.writestr(info, data)
    return output.getvalue(), sorted(unresolved)


def extract_placeholders_from_ooxml_bytes(source_bytes: bytes, ext: str) -> list[str]:
    ext = ext.lower().lstrip(".")
    if ext not in OOXML_PART_PREFIXES:
        return []

    tokens: set[str] = set()
    with ZipFile(BytesIO(source_bytes), "r") as archive:
        for name in sorted(archive.namelist()):
            if not _is_target_xml(ext, name):
                continue
            xml = archive.read(name).decode("utf-8", errors="ignore")
            tokens.update(extract_placeholder_tokens(xml))
    return sorted(tokens)
