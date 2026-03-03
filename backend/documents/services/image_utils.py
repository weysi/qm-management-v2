from __future__ import annotations


DEFAULT_DOCX_MAX_WIDTH_PX = 200
DEFAULT_DOCX_MAX_HEIGHT_PX = 120
DEFAULT_XLSX_MAX_WIDTH_PX = 180
DEFAULT_XLSX_MAX_HEIGHT_PX = 80


def fit_within_box(
    *,
    source_width: int,
    source_height: int,
    box_width: int,
    box_height: int,
) -> tuple[int, int]:
    if source_width <= 0 or source_height <= 0:
        return max(1, box_width), max(1, box_height)
    ratio = min(box_width / source_width, box_height / source_height)
    width = max(1, int(source_width * ratio))
    height = max(1, int(source_height * ratio))
    return width, height


def resolve_display_size(
    *,
    source_width: int | None,
    source_height: int | None,
    request_width: int | None,
    request_height: int | None,
    max_width: int,
    max_height: int,
) -> tuple[int, int]:
    base_width = max(1, source_width or max_width)
    base_height = max(1, source_height or max_height)

    if request_width and request_height:
        return max(1, request_width), max(1, request_height)

    if request_width:
        ratio = request_width / base_width
        return max(1, request_width), max(1, int(base_height * ratio))

    if request_height:
        ratio = request_height / base_height
        return max(1, int(base_width * ratio)), max(1, request_height)

    return fit_within_box(
        source_width=base_width,
        source_height=base_height,
        box_width=max_width,
        box_height=max_height,
    )
