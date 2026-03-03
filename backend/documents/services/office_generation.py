from __future__ import annotations

import logging
import threading
from contextlib import contextmanager
from dataclasses import dataclass

from django.conf import settings
from template_engine.ooxml import apply_placeholders_to_ooxml_bytes

from .asset_metadata import detect_image_dimensions
from .asset_resolver import AssetResolverError, StorageAssetResolver
from .generation_policy import RenderGenerationPolicy, should_fail_on_missing_asset
from .inject_docx import inject_docx_assets
from .inject_pptx import inject_pptx_assets
from .inject_xlsx import inject_xlsx_assets
from .office_asset_types import ResolvedOfficeAsset
from .variable_keys import CANONICAL_ASSET_LOGO, CANONICAL_ASSET_SIGNATURE, aliases_for_canonical


logger = logging.getLogger(__name__)

ASSET_KEYS = (CANONICAL_ASSET_LOGO, CANONICAL_ASSET_SIGNATURE)
SAFE_OFFICE_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/bmp",
}
_GENERATION_SEMAPHORE = threading.BoundedSemaphore(
    value=max(1, int(getattr(settings, "OFFICE_MAX_CONCURRENT_GENERATIONS", 2)))
)


@dataclass(frozen=True)
class GenerationResult:
    output_bytes: bytes
    unresolved: list[dict[str, object]]
    errors: list[dict[str, object]]
    warnings: list[dict[str, object]]


def _error(*, key: str, code: str, message: str) -> dict[str, object]:
    return {
        "variable": key,
        "error_code": code,
        "message": message,
        "path": key,
    }


def _warning(*, key: str, code: str, message: str) -> dict[str, object]:
    return {
        "variable": key,
        "warning_code": code,
        "message": message,
    }


def _supports_mime_for_office(mime: str) -> bool:
    normalized = mime.lower()
    return normalized in SAFE_OFFICE_MIME_TYPES


def _rasterize_svg_if_enabled(
    *,
    payload: bytes,
    key: str,
    policy: RenderGenerationPolicy,
    width: int | None,
    height: int | None,
) -> tuple[bytes | None, dict[str, object] | None, dict[str, object] | None]:
    if not policy.allow_svg_rasterize:
        return None, None, _warning(
            key=key,
            code="SVG_EMBED_NOT_SUPPORTED",
            message="SVG asset cannot be embedded in Office output unless svg rasterization is enabled.",
        )

    if not bool(getattr(settings, "OFFICE_ALLOW_SVG_RASTERIZE", False)):
        return None, _error(
            key=key,
            code="UNSUPPORTED_ASSET_MIME_FOR_OFFICE",
            message="SVG rasterization is disabled by server configuration.",
        ), None

    pixel_budget = int(getattr(settings, "OFFICE_SVG_MAX_PIXEL_BUDGET", 16_000_000))
    if width and height and width * height > pixel_budget:
        return None, _error(
            key=key,
            code="SVG_PIXEL_BUDGET_EXCEEDED",
            message=f"SVG exceeds pixel budget ({pixel_budget}).",
        ), None

    try:
        import cairosvg  # type: ignore
    except Exception as exc:  # pragma: no cover - runtime dependency
        return None, _error(
            key=key,
            code="SVG_CONVERTER_UNAVAILABLE",
            message=f"SVG conversion library unavailable: {exc}",
        ), None

    converted = cairosvg.svg2png(bytestring=payload)
    return converted, None, _warning(
        key=key,
        code="SVG_RASTERIZED",
        message="SVG was rasterized to PNG for Office embedding.",
    )


@contextmanager
def _generation_slot():
    timeout_seconds = float(getattr(settings, "OFFICE_GENERATION_SLOT_TIMEOUT_SECONDS", 30))
    acquired = _GENERATION_SEMAPHORE.acquire(timeout=timeout_seconds)
    if not acquired:
        raise RuntimeError("Office generation queue is busy. Please retry.")
    try:
        yield
    finally:
        _GENERATION_SEMAPHORE.release()


def _load_assets(
    *,
    handbook_id: str,
    resolver: StorageAssetResolver,
    generation_policy: RenderGenerationPolicy,
) -> tuple[
    dict[str, ResolvedOfficeAsset | None],
    dict[str, dict[str, object]],
    list[dict[str, object]],
]:
    assets_by_key: dict[str, ResolvedOfficeAsset | None] = {}
    error_by_key: dict[str, dict[str, object]] = {}
    warnings: list[dict[str, object]] = []

    for key in ASSET_KEYS:
        ref = resolver.resolve(handbook_id, key)
        if ref is None:
            assets_by_key[key] = None
            continue

        try:
            payload = resolver.load_buffer(ref)
        except AssetResolverError as exc:
            assets_by_key[key] = None
            error_by_key[key] = _error(
                key=key,
                code="ASSET_INTEGRITY_ERROR",
                message=str(exc),
            )
            warnings.append(
                _warning(
                    key=key,
                    code="ASSET_LOAD_FAILED",
                    message=str(exc),
                )
            )
            continue

        mime = (ref.mime_type or "").lower()
        converted_payload = payload
        converted_mime = mime
        converted_width = ref.width
        converted_height = ref.height

        if mime == "image/svg+xml":
            converted_payload, err, warn = _rasterize_svg_if_enabled(
                payload=payload,
                key=key,
                policy=generation_policy,
                width=ref.width,
                height=ref.height,
            )
            if err:
                assets_by_key[key] = None
                error_by_key[key] = err
                continue
            if warn:
                warnings.append(warn)
            if converted_payload is None:
                assets_by_key[key] = None
                continue
            converted_mime = "image/png"
            converted_size = detect_image_dimensions(converted_payload, converted_mime)
            if converted_size:
                converted_width, converted_height = converted_size
        elif not _supports_mime_for_office(mime):
            assets_by_key[key] = None
            error_by_key[key] = _error(
                key=key,
                code="UNSUPPORTED_ASSET_MIME_FOR_OFFICE",
                message=f"Unsupported Office image mime type: {ref.mime_type}",
            )
            warnings.append(
                _warning(
                    key=key,
                    code="UNSUPPORTED_ASSET_MIME_FOR_OFFICE",
                    message=f"Unsupported Office image mime type: {ref.mime_type}",
                )
            )
            continue

        assets_by_key[key] = ResolvedOfficeAsset(
            ref=ref,
            payload=converted_payload,
            mime_type=converted_mime,
            width=converted_width,
            height=converted_height,
        )
        logger.info(
            "ASSET_RESOLVED handbook_id=%s key=%s id=%s mime=%s size=%s",
            handbook_id,
            key,
            ref.id,
            converted_mime,
            ref.size_bytes,
        )

    return assets_by_key, error_by_key, warnings


def generate_office_document(
    *,
    source_bytes: bytes,
    ext: str,
    handbook_id: str,
    text_values: dict[str, object],
    required_non_asset_variables: set[str],
    generation_policy: RenderGenerationPolicy,
) -> GenerationResult:
    fail_on_missing_asset = should_fail_on_missing_asset(generation_policy)
    logger.info("OFFICE_TEMPLATE_DETECTED ext=%s handbook_id=%s", ext, handbook_id)

    with _generation_slot():
        output_bytes, unresolved, errors = apply_placeholders_to_ooxml_bytes(
            source_bytes,
            ext,
            text_values,
            required_variables=required_non_asset_variables,
        )
        collected_errors = [
            {
                "variable": item.get("variable"),
                "error_code": item.get("error_code"),
                "message": item.get("message"),
                "path": item.get("path"),
                "start": item.get("start"),
                "end": item.get("end"),
            }
            for item in errors
        ]

        aliases_by_key = {
            CANONICAL_ASSET_LOGO: aliases_for_canonical(CANONICAL_ASSET_LOGO),
            CANONICAL_ASSET_SIGNATURE: aliases_for_canonical(CANONICAL_ASSET_SIGNATURE),
        }

        resolver = StorageAssetResolver()
        assets_by_key, error_by_key, warnings = _load_assets(
            handbook_id=handbook_id,
            resolver=resolver,
            generation_policy=generation_policy,
        )

        if ext == ".docx":
            output_bytes, injection_errors, occurrences = inject_docx_assets(
                payload=output_bytes,
                aliases_by_key=aliases_by_key,
                assets_by_key=assets_by_key,
                fail_on_missing_asset=fail_on_missing_asset,
                error_by_key=error_by_key,
            )
        elif ext == ".pptx":
            output_bytes, injection_errors, occurrences = inject_pptx_assets(
                payload=output_bytes,
                aliases_by_key=aliases_by_key,
                assets_by_key=assets_by_key,
                fail_on_missing_asset=fail_on_missing_asset,
                error_by_key=error_by_key,
            )
        elif ext == ".xlsx":
            output_bytes, injection_errors, occurrences = inject_xlsx_assets(
                payload=output_bytes,
                aliases_by_key=aliases_by_key,
                assets_by_key=assets_by_key,
                fail_on_missing_asset=fail_on_missing_asset,
                error_by_key=error_by_key,
            )
        else:
            occurrences = {}
            injection_errors = []

        for key, count in sorted(occurrences.items()):
            logger.info("OFFICE_PLACEHOLDER_OCCURRENCES ext=%s key=%s count=%s", ext, key, count)
        logger.info("OFFICE_INJECTION_SUCCESS ext=%s handbook_id=%s", ext, handbook_id)

        collected_errors.extend(injection_errors)

        # Asset placeholders should not be reported unresolved when successfully injected.
        unresolved_filtered: list[dict[str, object]] = []
        for item in unresolved:
            variable = str(item.get("variable", ""))
            if variable in ASSET_KEYS:
                had_occurrence = occurrences.get(variable, 0) > 0
                missing_asset = assets_by_key.get(variable) is None
                if had_occurrence and (not missing_asset or not fail_on_missing_asset):
                    continue
            unresolved_filtered.append(item)

        return GenerationResult(
            output_bytes=output_bytes,
            unresolved=unresolved_filtered,
            errors=collected_errors,
            warnings=warnings,
        )
