from __future__ import annotations

from io import BytesIO

from docx import Document as WordDocument
from docx.shared import Inches

from .asset_placeholders import collect_asset_occurrences
from .asset_resolver import asset_missing_error
from .image_utils import (
    DEFAULT_DOCX_MAX_HEIGHT_PX,
    DEFAULT_DOCX_MAX_WIDTH_PX,
    resolve_display_size,
)
from .office_asset_types import ResolvedOfficeAsset


def _iter_container_paragraphs(container):
    for paragraph in container.paragraphs:
        yield paragraph
    for table in container.tables:
        for row in table.rows:
            for cell in row.cells:
                yield from _iter_container_paragraphs(cell)


def _iter_word_paragraphs(doc: WordDocument):
    yield from _iter_container_paragraphs(doc)
    for section in doc.sections:
        yield from _iter_container_paragraphs(section.header)
        yield from _iter_container_paragraphs(section.footer)


def inject_docx_assets(
    *,
    payload: bytes,
    aliases_by_key: dict[str, list[str]],
    assets_by_key: dict[str, ResolvedOfficeAsset | None],
    fail_on_missing_asset: bool,
    error_by_key: dict[str, dict[str, object]] | None = None,
) -> tuple[bytes, list[dict[str, object]], dict[str, int]]:
    doc = WordDocument(BytesIO(payload))
    errors: list[dict[str, object]] = []
    occurrences: dict[str, int] = {}
    available_keys = set(aliases_by_key.keys())
    per_key_errors = error_by_key or {}

    for paragraph in _iter_word_paragraphs(doc):
        text = paragraph.text or ""
        if not text:
            continue
        matches = collect_asset_occurrences(text, available_keys)
        if not matches:
            continue

        paragraph.text = ""
        cursor = 0
        for match in matches:
            if match.start > cursor:
                paragraph.add_run(text[cursor : match.start])
            cursor = match.end

            key = str(match.key)
            token = str(match.raw)
            occurrences[key] = occurrences.get(key, 0) + 1

            resolved = assets_by_key.get(key)
            if resolved is None:
                if fail_on_missing_asset:
                    errors.append(per_key_errors.get(key) or asset_missing_error(key))
                else:
                    paragraph.add_run(token)
                continue

            draw_w, draw_h = resolve_display_size(
                source_width=resolved.width,
                source_height=resolved.height,
                request_width=match.width_px,
                request_height=match.height_px,
                max_width=DEFAULT_DOCX_MAX_WIDTH_PX,
                max_height=DEFAULT_DOCX_MAX_HEIGHT_PX,
            )
            width_in = draw_w / 96.0
            height_in = draw_h / 96.0

            run = paragraph.add_run()
            run.add_picture(
                BytesIO(resolved.payload),
                width=Inches(width_in),
                height=Inches(height_in),
            )

        if cursor < len(text):
            paragraph.add_run(text[cursor:])

    out = BytesIO()
    doc.save(out)
    return out.getvalue(), errors, occurrences
