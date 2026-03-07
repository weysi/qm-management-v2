from __future__ import annotations

from typing import Final

CAPABILITIES: Final[list[dict[str, object]]] = [
    {
        "id": "quick_fill",
        "label": "Quick Fill",
        "supported_file_types": ["DOCX", "PPTX", "XLSX", "TXT", "MD", "PDF", "OTHER"],
        "supported_placeholder_kinds": ["TEXT"],
        "requires_references": False,
        "output_class": "short",
        "ui_entry_point": "inline_quick_fill",
    },
    {
        "id": "compose_from_company_context",
        "label": "Unternehmenskontext verfassen",
        "supported_file_types": ["DOCX", "PPTX", "XLSX", "TXT", "MD", "PDF", "OTHER"],
        "supported_placeholder_kinds": ["TEXT"],
        "requires_references": False,
        "output_class": "medium",
        "ui_entry_point": "compose_panel",
    },
    {
        "id": "compose_from_references",
        "label": "Mit Referenzen verfassen",
        "supported_file_types": ["DOCX", "PPTX", "XLSX", "TXT", "MD", "PDF", "OTHER"],
        "supported_placeholder_kinds": ["TEXT"],
        "requires_references": True,
        "output_class": "long",
        "ui_entry_point": "compose_panel",
    },
    {
        "id": "rewrite_existing_value",
        "label": "Bestehenden Text umformulieren",
        "supported_file_types": ["DOCX", "PPTX", "XLSX", "TXT", "MD", "PDF", "OTHER"],
        "supported_placeholder_kinds": ["TEXT"],
        "requires_references": False,
        "output_class": "medium",
        "ui_entry_point": "compose_panel",
    },
    {
        "id": "summarize_reference",
        "label": "Referenz zusammenfassen",
        "supported_file_types": ["DOCX", "PPTX", "XLSX", "TXT", "MD", "PDF", "OTHER"],
        "supported_placeholder_kinds": ["TEXT"],
        "requires_references": True,
        "output_class": "medium",
        "ui_entry_point": "reference_preview",
    },
    {
        "id": "extract_workflow_language",
        "label": "Ablaufsprache ableiten",
        "supported_file_types": ["DOCX", "PPTX", "XLSX", "TXT", "MD", "PDF", "OTHER"],
        "supported_placeholder_kinds": ["TEXT"],
        "requires_references": True,
        "output_class": "medium",
        "ui_entry_point": "compose_panel",
    },
    {
        "id": "generate_audit_ready_text",
        "label": "Auditfeste Formulierung",
        "supported_file_types": ["DOCX", "PPTX", "XLSX", "TXT", "MD", "PDF", "OTHER"],
        "supported_placeholder_kinds": ["TEXT"],
        "requires_references": False,
        "output_class": "long",
        "ui_entry_point": "compose_panel",
    },
]

OUTPUT_STYLES: Final[list[dict[str, str]]] = [
    {"id": "concise", "label": "Knapp", "output_class": "short"},
    {"id": "formal", "label": "Formell", "output_class": "medium"},
    {"id": "process_oriented", "label": "Prozessorientiert", "output_class": "medium"},
    {"id": "audit_ready", "label": "Audit-ready", "output_class": "long"},
    {"id": "slide_ready", "label": "Foliengeeignet", "output_class": "short"},
    {"id": "procedure_style", "label": "Verfahrensanweisung", "output_class": "long"},
    {"id": "table_cell_short", "label": "Tabellenzelle kurz", "output_class": "short"},
    {"id": "long_form_explanation", "label": "Ausführliche Erklärung", "output_class": "long"},
]

REFERENCE_SCOPES: Final[list[str]] = ["handbook", "file", "placeholder"]
SUPPORTED_LANGUAGES: Final[list[str]] = ["de-DE", "en-US"]


def get_capability_registry() -> list[dict[str, object]]:
    return [dict(item) for item in CAPABILITIES]


def get_output_styles() -> list[dict[str, str]]:
    return [dict(item) for item in OUTPUT_STYLES]
