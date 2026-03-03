from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath

from django.db import transaction
from django.utils import timezone

from documents.models import Document


@dataclass(frozen=True)
class DeleteResult:
    deleted_count: int
    deleted_paths: list[str]


def _sanitize_path(raw: str) -> str:
    value = (raw or "").replace("\\", "/").strip()
    if not value:
        raise ValueError("path is required")

    posix = PurePosixPath(value)
    safe_parts = [part for part in posix.parts if part not in {"", ".", ".."}]
    cleaned = "/".join(safe_parts)
    if not cleaned:
        raise ValueError("invalid path")
    return cleaned


def build_tree(*, handbook_id: str, include_deleted: bool = False) -> list[dict[str, object]]:
    query = Document.objects.filter(handbook_id=handbook_id)
    if not include_deleted:
        query = query.filter(deleted_at__isnull=True)

    files = list(query.order_by("relative_path").values("id", "name", "relative_path", "deleted_at"))

    root: dict[str, object] = {"name": "", "path": "", "kind": "folder", "children": []}

    def get_child(parent: dict[str, object], name: str, path: str, kind: str) -> dict[str, object]:
        children = parent["children"]
        for child in children:
            if child["name"] == name and child["kind"] == kind:
                return child
        created: dict[str, object] = {"name": name, "path": path, "kind": kind}
        if kind == "folder":
            created["children"] = []
        children.append(created)
        return created

    for file_row in files:
        rel = str(file_row["relative_path"])
        parts = [item for item in rel.split("/") if item]
        current = root
        for idx, part in enumerate(parts):
            current_path = "/".join(parts[: idx + 1])
            is_file = idx == len(parts) - 1
            if is_file:
                file_node = get_child(current, part, current_path, "file")
                file_node.update(
                    {
                        "id": str(file_row["id"]),
                        "deleted": file_row["deleted_at"] is not None,
                    }
                )
            else:
                current = get_child(current, part, current_path, "folder")

    def sort_node(node: dict[str, object]) -> None:
        children = node.get("children") or []
        children.sort(key=lambda item: (item["kind"] != "folder", item["name"]))
        for child in children:
            if child["kind"] == "folder":
                sort_node(child)

    sort_node(root)
    return root["children"]


@transaction.atomic
def soft_delete_path(*, handbook_id: str, path: str, recursive: bool = False) -> DeleteResult:
    safe_path = _sanitize_path(path)

    file_match = Document.objects.filter(
        handbook_id=handbook_id,
        relative_path=safe_path,
        deleted_at__isnull=True,
    )
    if file_match.exists():
        deleted = list(file_match.values_list("relative_path", flat=True))
        file_match.update(deleted_at=timezone.now())
        return DeleteResult(deleted_count=len(deleted), deleted_paths=deleted)

    prefix = f"{safe_path}/"
    query = Document.objects.filter(
        handbook_id=handbook_id,
        relative_path__startswith=prefix,
        deleted_at__isnull=True,
    )
    if not recursive:
        raise ValueError("recursive=true is required for folder delete")

    deleted = list(query.values_list("relative_path", flat=True))
    query.update(deleted_at=timezone.now())
    return DeleteResult(deleted_count=len(deleted), deleted_paths=deleted)
