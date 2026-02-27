from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from django.conf import settings
from django.db import connection, transaction

from assets.services.storage import LocalStorage
from common.chunking import ChunkConfig, estimate_token_count, split_text_deterministic
from common.hashing import file_sha256, sha256_text
from common.openai_client import embed_texts
from common.placeholders import count_placeholder_tokens
from indexing.services.extract import extract_raw_ooxml_text, extract_text_for_path
from packages.catalog import get_package_config
from packages.services import seed_variable_keys
from rag.models import (
    RagAsset,
    RagDocumentChunk,
    RagManual,
    RagTemplatePlaceholder,
    RagVariableKey,
)
from runs.services.run_logger import emit_event


@dataclass
class IngestionStats:
    assets_total: int = 0
    assets_created: int = 0
    assets_skipped: int = 0
    chunks_total: int = 0
    placeholders_total: int = 0
    extraction_errors: int = 0
    unknown_placeholders: int = 0


def classify_asset_role(relative_path: str, ext: str, config: dict) -> tuple[str, bool]:
    rules = config["classification_rules"]
    template_exts = set(config["template_file_exts"])
    reference_exts = set(config["reference_file_exts"])

    for prefix in rules.get("template_prefixes", []):
        if relative_path.startswith(prefix) and ext in template_exts:
            return RagAsset.Role.TEMPLATE, False

    for prefix in rules.get("reference_prefixes", []):
        if relative_path.startswith(prefix) and ext in reference_exts:
            return RagAsset.Role.REFERENCE, False

    if ext in template_exts:
        return RagAsset.Role.TEMPLATE, True
    if ext in reference_exts:
        return RagAsset.Role.REFERENCE, True
    return RagAsset.Role.REFERENCE, True


def _manual_paths(manual: RagManual) -> dict[str, Path]:
    base = settings.RAG_TENANT_ROOT / manual.tenant_id / "manuals" / str(manual.id)
    return {
        "base": base,
        "templates": base / "templates",
        "references": base / "references",
        "customer": base / "customer",
        "outputs": base / "outputs",
    }


def _resolve_destination(role: str, manual_dirs: dict[str, Path], rel_path: str) -> Path:
    if role == RagAsset.Role.TEMPLATE:
        return manual_dirs["templates"] / rel_path
    if role == RagAsset.Role.CUSTOMER_REFERENCE:
        return manual_dirs["customer"] / rel_path
    return manual_dirs["references"] / rel_path


def _guess_mime(ext_with_dot: str) -> str:
    mapping = {
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".ppt": "application/vnd.ms-powerpoint",
    }
    return mapping.get(ext_with_dot.lower(), "application/octet-stream")


def _resolve_package_root(config: dict) -> Path:
    source_prefix = Path(config["source_local_prefix"])
    if source_prefix.is_absolute():
        return source_prefix
    return (settings.PROJECT_ROOT / source_prefix).resolve()


def _upsert_asset(
    manual: RagManual,
    *,
    role: str,
    source: str,
    local_path: Path,
    sha256: str,
    package_rel_path: str,
    mime: str,
    file_ext: str,
) -> tuple[RagAsset, bool]:
    asset, created = RagAsset.objects.get_or_create(
        manual=manual,
        package_rel_path=package_rel_path,
        sha256=sha256,
        defaults={
            "tenant": manual.tenant,
            "role": role,
            "source": source,
            "local_path": str(local_path),
            "mime": mime,
            "file_ext": file_ext,
        },
    )
    if created:
        return asset, True

    changed = False
    if asset.local_path != str(local_path):
        asset.local_path = str(local_path)
        changed = True
    if asset.role != role:
        asset.role = role
        changed = True
    if asset.source != source:
        asset.source = source
        changed = True
    if asset.mime != mime:
        asset.mime = mime
        changed = True
    if asset.file_ext != file_ext:
        asset.file_ext = file_ext
        changed = True
    if changed:
        asset.save(
            update_fields=["local_path", "role", "source", "mime", "file_ext"]
        )
    return asset, False


def _store_placeholders(
    *,
    asset: RagAsset,
    package_code: str,
    package_version: str,
    placeholder_source_text: str,
) -> tuple[int, int]:
    RagTemplatePlaceholder.objects.filter(asset=asset).delete()

    token_counter = count_placeholder_tokens(placeholder_source_text)
    known = set(
        RagVariableKey.objects.filter(
            package_code=package_code,
            package_version=package_version,
        ).values_list("token", flat=True)
    )
    created = 0
    unknown = 0
    for token, occurrences in sorted(token_counter.items(), key=lambda item: item[0]):
        status = (
            RagTemplatePlaceholder.Status.KNOWN
            if token in known
            else RagTemplatePlaceholder.Status.UNKNOWN
        )
        if status == RagTemplatePlaceholder.Status.UNKNOWN:
            unknown += 1
        RagTemplatePlaceholder.objects.create(
            id=sha256_text(f"{asset.id}:{token}"),
            asset=asset,
            token=token,
            occurrences=occurrences,
            sample_context="",
            status=status,
        )
        created += 1
    return created, unknown


def _persist_chunks(
    *,
    manual: RagManual,
    asset: RagAsset,
    config: dict,
    extracted_text: str,
    slices: list[dict],
    force: bool,
) -> list[RagDocumentChunk]:
    chunk_cfg = ChunkConfig(
        target_chars=config["chunking"]["target_chars"],
        overlap_chars=config["chunking"]["overlap_chars"],
    )
    chunks = split_text_deterministic(extracted_text, chunk_cfg)

    if force:
        RagDocumentChunk.objects.filter(asset=asset).delete()

    rows: list[RagDocumentChunk] = []
    language = (config.get("languages") or ["en"])[0]
    metadata_base = {
        "package_code": manual.package_code,
        "package_version": manual.package_version,
        "manual_id": str(manual.id),
        "tenant_id": manual.tenant_id,
        "asset_role": asset.role,
        "asset_path": asset.package_rel_path,
        "language": language,
    }

    for index, chunk_text in enumerate(chunks):
        chunk_id = sha256_text(f"{asset.id}:{index}:{sha256_text(chunk_text)}")
        metadata = dict(metadata_base)
        if slices:
            first = slices[min(index, len(slices) - 1)]
            metadata.update({k: v for k, v in first.items() if k != "text"})

        row, _created = RagDocumentChunk.objects.update_or_create(
            id=chunk_id,
            defaults={
                "asset": asset,
                "chunk_index": index,
                "text": chunk_text,
                "token_count": estimate_token_count(chunk_text),
                "metadata": metadata,
            },
        )
        rows.append(row)

    return rows


def _apply_fts(chunks: list[RagDocumentChunk], fts_config: str) -> None:
    if not chunks:
        return
    ids = [chunk.id for chunk in chunks]
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE rag_document_chunk
            SET tsv = to_tsvector(%s, coalesce(text, ''))
            WHERE id = ANY(%s)
            """,
            [fts_config, ids],
        )


def _apply_embeddings(chunks: list[RagDocumentChunk]) -> None:
    if not chunks:
        return
    texts = [chunk.text for chunk in chunks]
    vectors, _model = embed_texts(texts, settings.OPENAI_EMBED_MODEL)
    for row, vector in zip(chunks, vectors):
        row.embedding = vector
    RagDocumentChunk.objects.bulk_update(chunks, ["embedding"])


def index_existing_asset(
    *,
    manual: RagManual,
    asset: RagAsset,
    run,
    force: bool = False,
) -> tuple[list[RagDocumentChunk], int, int]:
    config = get_package_config(manual.package_code, manual.package_version)
    extracted = extract_text_for_path(Path(asset.local_path))
    placeholder_text = (
        extract_raw_ooxml_text(Path(asset.local_path))
        if asset.role == RagAsset.Role.TEMPLATE
        else extracted.full_text
    )
    placeholders, unknown = _store_placeholders(
        asset=asset,
        package_code=manual.package_code,
        package_version=manual.package_version,
        placeholder_source_text=placeholder_text,
    )
    chunks = _persist_chunks(
        manual=manual,
        asset=asset,
        config=config,
        extracted_text=extracted.full_text,
        slices=extracted.slices,
        force=force,
    )
    emit_event(
        run,
        message="Asset indexed",
        payload={
            "asset_id": str(asset.id),
            "path": asset.package_rel_path,
            "chunks": len(chunks),
            "placeholders": placeholders,
            "unknown_placeholders": unknown,
        },
    )
    return chunks, placeholders, unknown


def _copy_source_to_manual(
    *,
    storage: LocalStorage,
    manual: RagManual,
    source_files: Iterable[Path],
    package_root: Path,
    run,
    force: bool,
) -> tuple[list[RagAsset], IngestionStats]:
    stats = IngestionStats()
    config = get_package_config(manual.package_code, manual.package_version)
    dirs = _manual_paths(manual)
    for directory in dirs.values():
        storage.ensure_dir(directory)

    assets: list[RagAsset] = []
    for source_file in source_files:
        relative = source_file.relative_to(package_root).as_posix()
        ext = source_file.suffix.lower().lstrip(".")
        role, unclassified = classify_asset_role(relative, ext, config)
        destination = _resolve_destination(role, dirs, relative)

        source_bytes = storage.read_bytes(source_file)
        storage.write_bytes(destination, source_bytes)
        sha = file_sha256(destination)

        asset, created = _upsert_asset(
            manual,
            role=role,
            source=RagAsset.Source.PACKAGE_VAULT,
            local_path=destination,
            sha256=sha,
            package_rel_path=relative,
            mime=_guess_mime(source_file.suffix.lower()),
            file_ext=ext,
        )
        stats.assets_total += 1
        if created:
            stats.assets_created += 1
        else:
            stats.assets_skipped += 1
        assets.append(asset)

        emit_event(
            run,
            message="Asset copied",
            payload={
                "asset_id": str(asset.id),
                "path": relative,
                "unclassified": unclassified,
                "force": force,
            },
        )

    return assets, stats


@transaction.atomic
def ingest_package_for_manual(manual: RagManual, run, force: bool = False) -> IngestionStats:
    config = get_package_config(manual.package_code, manual.package_version)
    seed_variable_keys(manual.package_code, manual.package_version)

    storage = LocalStorage()
    package_root = _resolve_package_root(config)
    source_files = storage.list_files(package_root)
    emit_event(run, message="Package scan started", payload={"files": len(source_files)})

    assets, copy_stats = _copy_source_to_manual(
        storage=storage,
        manual=manual,
        source_files=source_files,
        package_root=package_root,
        run=run,
        force=force,
    )

    # Merge copy stats (but keep tracking ingestion stats separately)
    stats = IngestionStats()
    stats.assets_total = copy_stats.assets_total
    stats.assets_created = copy_stats.assets_created
    stats.assets_skipped = copy_stats.assets_skipped

    # Iterate over ALL manual assets, including uploaded ones
    all_assets = RagAsset.objects.filter(manual=manual)

    processed_chunks: list[RagDocumentChunk] = []
    for asset in all_assets:
        try:
            rows, placeholders, unknown = index_existing_asset(
                manual=manual,
                asset=asset,
                run=run,
                force=force,
            )
            processed_chunks.extend(rows)
            stats.chunks_total += len(rows)
            stats.placeholders_total += placeholders
            stats.unknown_placeholders += unknown
        except Exception as exc:  # noqa: BLE001
            stats.extraction_errors += 1
            emit_event(
                run,
                level="ERROR",
                message="Asset extraction failed",
                payload={
                    "asset_id": str(asset.id),
                    "path": asset.package_rel_path,
                    "error": str(exc),
                },
            )

    if stats.chunks_total == 0:
        raise RuntimeError("Ingestion failed: zero chunks produced")

    try:
        _apply_embeddings(processed_chunks)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Embedding API unavailable: {exc}") from exc

    _apply_fts(processed_chunks, config["fts_config"])

    emit_event(
        run,
        message="Ingestion finished",
        payload={
            "assets_total": stats.assets_total,
            "chunks_total": stats.chunks_total,
            "placeholders_total": stats.placeholders_total,
            "unknown_placeholders": stats.unknown_placeholders,
            "extraction_errors": stats.extraction_errors,
        },
    )
    return stats


@transaction.atomic
def ingest_single_asset(manual: RagManual, run, asset: RagAsset, force: bool = True) -> IngestionStats:
    seed_variable_keys(manual.package_code, manual.package_version)
    stats = IngestionStats(assets_total=1, assets_created=1)

    try:
        chunks, placeholders, unknown = index_existing_asset(
            manual=manual,
            asset=asset,
            run=run,
            force=force,
        )
        if not chunks:
            raise RuntimeError("No chunks generated for uploaded asset")
        _apply_embeddings(chunks)
        config = get_package_config(manual.package_code, manual.package_version)
        _apply_fts(chunks, config["fts_config"])

        stats.chunks_total = len(chunks)
        stats.placeholders_total = placeholders
        stats.unknown_placeholders = unknown
        return stats
    except Exception as exc:  # noqa: BLE001
        emit_event(
            run,
            level="ERROR",
            message="Single asset ingestion failed",
            payload={
                "asset_id": str(asset.id),
                "path": asset.package_rel_path,
                "error": str(exc),
            },
        )
        raise
