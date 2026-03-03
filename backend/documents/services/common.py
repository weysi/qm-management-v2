from __future__ import annotations

from pathlib import Path, PurePosixPath

from django.conf import settings

SUPPORTED_TEMPLATE_EXTS = {".docx", ".pptx", ".xlsx", ".md", ".txt", ".html", ".htm"}
SUPPORTED_UPLOAD_EXTS = SUPPORTED_TEMPLATE_EXTS | {".zip"}
SUPPORTED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"}
TEXT_EXTS = {".md", ".txt", ".html", ".htm"}


def documents_root() -> Path:
    return settings.DOCUMENTS_DATA_ROOT


def handbook_root(handbook_id: str) -> Path:
    safe_handbook_id = handbook_id.strip()
    return documents_root() / "handbooks" / safe_handbook_id


def sanitize_relative_path(path_value: str, fallback: str) -> str:
    raw = (path_value or "").replace("\\", "/").strip()
    if not raw:
        raw = fallback

    posix = PurePosixPath(raw)
    safe_parts = [part for part in posix.parts if part not in {"", ".", ".."}]
    return "/".join(safe_parts) or fallback


def ensure_within_handbook_path(handbook_id: str, rel_path: str) -> Path:
    root = handbook_root(handbook_id).resolve()
    full = (root / rel_path).resolve()
    if root not in full.parents and full != root:
        raise ValueError("Path escapes handbook scope")
    return full
