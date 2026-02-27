from __future__ import annotations

from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import transaction

from assets.services.storage import LocalStorage
from common.hashing import file_sha256
from generation.services.planning import build_generation_plan
from generation.services.template_apply import apply_placeholders_to_ooxml_bytes
from generation.services.variables import resolve_required_variables
from rag.models import RagAsset, RagManual, RagRun, RagVariableValue
from runs.services.run_logger import emit_event


def _manual_output_root(manual: RagManual) -> Path:
    return (
        settings.RAG_TENANT_ROOT
        / manual.tenant_id
        / "manuals"
        / str(manual.id)
        / "outputs"
    )


def _resolve_output_rel_path(template_asset: RagAsset, output_item: dict[str, Any]) -> str:
    configured = str(output_item.get("output_rel_path", "")).strip()
    if configured:
        return configured
    return f"outputs/{template_asset.package_rel_path}"


def _build_effective_map(
    *,
    base_values: dict[str, str],
    source_by_token: dict[str, str],
    global_overrides: dict[str, str] | None,
    file_overrides: dict[str, str] | None,
) -> dict[str, str]:
    merged = dict(base_values)

    def _apply(overrides: dict[str, str] | None) -> None:
        if not overrides:
            return
        for token, value in overrides.items():
            if source_by_token.get(token) == RagVariableValue.Source.CUSTOMER_INPUT:
                continue
            if value is None:
                continue
            text = str(value).strip()
            if not text:
                continue
            merged[token] = text

    _apply(global_overrides)
    _apply(file_overrides)
    return merged


def _register_generated_asset(
    *,
    manual: RagManual,
    template_asset: RagAsset,
    output_path: Path,
    output_rel_path: str,
) -> RagAsset:
    sha = file_sha256(output_path)
    asset, created = RagAsset.objects.get_or_create(
        manual=manual,
        package_rel_path=output_rel_path,
        sha256=sha,
        defaults={
            "tenant": manual.tenant,
            "source_asset": template_asset,
            "role": RagAsset.Role.GENERATED_OUTPUT,
            "source": RagAsset.Source.AI_GENERATED,
            "local_path": str(output_path),
            "mime": template_asset.mime,
            "file_ext": template_asset.file_ext,
        },
    )
    if created:
        return asset

    changed = False
    if asset.local_path != str(output_path):
        asset.local_path = str(output_path)
        changed = True
    if asset.source_asset_id != template_asset.id:
        asset.source_asset = template_asset
        changed = True
    if asset.role != RagAsset.Role.GENERATED_OUTPUT:
        asset.role = RagAsset.Role.GENERATED_OUTPUT
        changed = True
    if asset.source != RagAsset.Source.AI_GENERATED:
        asset.source = RagAsset.Source.AI_GENERATED
        changed = True
    if changed:
        asset.save(update_fields=["local_path", "source_asset", "role", "source"])
    return asset


@transaction.atomic
def execute_generation(
    *,
    manual: RagManual,
    run: RagRun,
    customer_profile: dict[str, Any] | None = None,
    selected_asset_ids: list[str] | None = None,
    global_overrides: dict[str, str] | None = None,
    file_overrides_by_file: dict[str, dict[str, str]] | None = None,
) -> dict[str, Any]:
    customer_profile = customer_profile or {}
    global_overrides = global_overrides or {}
    file_overrides_by_file = file_overrides_by_file or {}
    selected_ids = set(selected_asset_ids or [])

    plan, prompt_version, model = build_generation_plan(manual)
    run.prompt_version = prompt_version
    run.model = model
    run.save(update_fields=["prompt_version", "model"])
    emit_event(
        run,
        message="Generation plan ready",
        payload={
            "prompt_version": prompt_version,
            "model": model,
            "outputs": len(plan.get("outputs", [])),
        },
    )

    required_tokens = [str(token) for token in plan.get("required_tokens", [])]
    base_values, source_by_token = resolve_required_variables(
        manual=manual,
        required_tokens=required_tokens,
        customer_profile=customer_profile,
        human_overrides=global_overrides,
        run=run,
    )
    emit_event(
        run,
        message="Variables resolved",
        payload={
            "required_tokens": len(required_tokens),
            "resolved_tokens": len(base_values),
        },
    )

    storage = LocalStorage()
    output_root = _manual_output_root(manual)
    storage.ensure_dir(output_root)

    file_results: list[dict[str, Any]] = []
    generated = 0
    failed = 0
    skipped = 0

    for output_item in plan.get("outputs", []):
        template_asset_id = str(output_item.get("template_asset_id", ""))
        if selected_ids and template_asset_id not in selected_ids:
            skipped += 1
            continue
        if not template_asset_id:
            failed += 1
            file_results.append(
                {
                    "template_asset_id": "",
                    "status": "error",
                    "error": "Missing template_asset_id in plan output",
                    "warnings": [],
                    "unresolved_tokens": [],
                }
            )
            continue

        try:
            template_asset = RagAsset.objects.get(
                id=template_asset_id,
                manual=manual,
                role=RagAsset.Role.TEMPLATE,
            )
        except RagAsset.DoesNotExist:
            failed += 1
            file_results.append(
                {
                    "template_asset_id": template_asset_id,
                    "status": "error",
                    "error": "Template asset not found",
                    "warnings": [],
                    "unresolved_tokens": [],
                }
            )
            continue

        try:
            source_bytes = storage.read_bytes(Path(template_asset.local_path))
            effective_values = _build_effective_map(
                base_values=base_values,
                source_by_token=source_by_token,
                global_overrides=global_overrides,
                file_overrides=file_overrides_by_file.get(str(template_asset.id)),
            )
            output_bytes, unresolved = apply_placeholders_to_ooxml_bytes(
                source_bytes,
                template_asset.file_ext,
                effective_values,
            )

            output_rel_path = _resolve_output_rel_path(template_asset, output_item)
            output_path = (settings.RAG_TENANT_ROOT / manual.tenant_id / "manuals" / str(manual.id) / output_rel_path).resolve()
            storage.write_bytes(output_path, output_bytes)

            output_asset = _register_generated_asset(
                manual=manual,
                template_asset=template_asset,
                output_path=output_path,
                output_rel_path=output_rel_path,
            )
            generated += 1
            result = {
                "template_asset_id": str(template_asset.id),
                "template_path": template_asset.package_rel_path,
                "output_asset_id": str(output_asset.id),
                "output_rel_path": output_rel_path,
                "status": "generated",
                "warnings": [],
                "unresolved_tokens": sorted(unresolved),
            }
            file_results.append(result)
            emit_event(run, message="File generated", payload=result)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            result = {
                "template_asset_id": str(template_asset.id),
                "template_path": template_asset.package_rel_path,
                "status": "error",
                "error": str(exc),
                "warnings": [],
                "unresolved_tokens": [],
            }
            file_results.append(result)
            emit_event(run, level="ERROR", message="File generation failed", payload=result)

    status = "SUCCEEDED"
    if failed > 0 and generated == 0:
        status = "FAILED"
    elif failed > 0:
        status = "PARTIAL"

    report = {
        "status": status,
        "plan": plan,
        "files": file_results,
        "summary": {
            "total": len(file_results),
            "generated": generated,
            "failed": failed,
            "skipped": skipped,
        },
        "unknown_tokens": [str(token) for token in plan.get("unknown_tokens", [])],
    }
    return report
