"""
OOXML run normalizer.

Word (and PowerPoint) split text across multiple <w:r> runs for tracking,
spell-check, or formatting reasons. This means a template token like
{{COMPANY_NAME}} can appear in the raw XML as three separate runs:

    <w:r><w:t>{{</w:t></w:r>
    <w:r><w:rPr>...</w:rPr><w:t>COMPANY_NAME</w:t></w:r>
    <w:r><w:t>}}</w:t></w:r>

The template engine tokenizer operates on the raw XML string and will
mistake the XML markup between {{ and }} as the variable path, causing
INVALID_VARIABLE_PATH errors.

This module pre-processes XML parts so that every {{ ... }} token is
contained in a single contiguous <w:t> element before the template engine
sees the string.
"""
from __future__ import annotations

from lxml import etree

# ── namespace constants ────────────────────────────────────────────────────────

_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
_XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"

_W_P   = f"{{{_W}}}p"
_W_R   = f"{{{_W}}}r"
_W_T   = f"{{{_W}}}t"

_A_P   = f"{{{_A}}}p"
_A_R   = f"{{{_A}}}r"
_A_T   = f"{{{_A}}}t"


# ── low-level helpers ──────────────────────────────────────────────────────────

def _get_text(run_el: etree._Element, t_tag: str) -> str:
    t = run_el.find(t_tag)
    if t is None:
        return ""
    return t.text or ""


def _set_text(run_el: etree._Element, t_tag: str, text: str) -> None:
    t = run_el.find(t_tag)
    if t is None:
        t = etree.SubElement(run_el, t_tag)
    t.text = text
    # Preserve leading/trailing whitespace via xml:space="preserve"
    if text != text.strip():
        t.set(_XML_SPACE, "preserve")
    else:
        t.attrib.pop(_XML_SPACE, None)


# ── paragraph-level normalization ──────────────────────────────────────────────

def _normalize_paragraph(para_el: etree._Element, r_tag: str, t_tag: str) -> None:
    """Merge runs within *para_el* so no {{ … }} token is split across runs."""
    runs = para_el.findall(r_tag)
    if not runs:
        return

    texts = [_get_text(r, t_tag) for r in runs]
    full_text = "".join(texts)

    if "{{" not in full_text:
        return

    # Build char → run-index mapping
    char_to_run: list[int] = []
    for i, t in enumerate(texts):
        char_to_run.extend([i] * len(t))

    if not char_to_run:
        return

    # Collect merge groups: (first_run_idx, last_run_idx)
    merges: list[tuple[int, int]] = []
    pos = 0
    while True:
        open_pos = full_text.find("{{", pos)
        if open_pos == -1:
            break
        close_pos = full_text.find("}}", open_pos + 2)
        if close_pos == -1:
            break
        # close_pos points to the first '}'; we want the last char of '}}'
        last_char = close_pos + 1

        first_run = char_to_run[open_pos]
        last_run = (
            char_to_run[last_char]
            if last_char < len(char_to_run)
            else char_to_run[-1]
        )

        if first_run != last_run:
            merges.append((first_run, last_run))

        pos = last_char + 1

    if not merges:
        return

    # Process merges in reverse order so indices stay valid
    for first_run, last_run in sorted(set(merges), key=lambda x: x[0], reverse=True):
        runs = para_el.findall(r_tag)  # refresh after each mutation
        if first_run >= len(runs) or last_run >= len(runs):
            continue

        merged_text = "".join(
            _get_text(runs[i], t_tag) for i in range(first_run, last_run + 1)
        )
        _set_text(runs[first_run], t_tag, merged_text)

        # Remove the now-merged runs (keep runs[first_run])
        for run_el in runs[first_run + 1 : last_run + 1]:
            para_el.remove(run_el)


# ── public API ─────────────────────────────────────────────────────────────────

def normalize_ooxml_xml(xml: str, ext: str) -> str:
    """
    Return *xml* with all split-run {{ }} tokens merged into single runs.

    *ext* is the file extension without dot: ``"docx"`` or ``"pptx"``.
    If parsing fails the original *xml* is returned unchanged (fail-safe).
    """
    if "{{" not in xml:
        return xml

    try:
        root = etree.fromstring(xml.encode("utf-8"))
    except etree.XMLSyntaxError:
        return xml

    if ext == "docx":
        p_tag, r_tag, t_tag = _W_P, _W_R, _W_T
    elif ext == "pptx":
        p_tag, r_tag, t_tag = _A_P, _A_R, _A_T
    else:
        return xml

    for para in root.iter(p_tag):
        _normalize_paragraph(para, r_tag, t_tag)

    return etree.tostring(root, encoding="unicode", xml_declaration=False)
