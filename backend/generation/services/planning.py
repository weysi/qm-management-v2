from __future__ import annotations

from typing import Any

from django.conf import settings

from common.openai_client import chat_json
from packages.services import load_playbook
from prompts.registry import get_prompt
from rag.models import RagAsset, RagManual, RagTemplatePlaceholder


def _deterministic_plan(manual: RagManual, template_assets: list[RagAsset], playbook: dict) -> dict[str, Any]:
    outputs = []
    required_tokens: set[str] = set()
    unknown_tokens: set[str] = set()

    for asset in template_assets:
        placeholders = RagTemplatePlaceholder.objects.filter(asset=asset).order_by("token")
        required_tokens.update(placeholders.values_list("token", flat=True))
        unknown_tokens.update(
            placeholders.filter(status=RagTemplatePlaceholder.Status.UNKNOWN).values_list(
                "token", flat=True
            )
        )
        outputs.append(
            {
                "template_asset_id": str(asset.id),
                "output_rel_path": f"outputs/{asset.package_rel_path.split('/')[-1]}",
                "strategies": {
                    "replacement_mode": playbook.get("replacement_mode", "SIMPLE_TEXT"),
                    "draft_groups": playbook.get("draft_groups", []),
                },
            }
        )

    return {
        "outputs": outputs,
        "required_tokens": sorted(required_tokens),
        "unknown_tokens": sorted(unknown_tokens),
    }


def _validate_plan(payload: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return fallback
    if not isinstance(payload.get("outputs"), list):
        return fallback
    if not isinstance(payload.get("required_tokens"), list):
        payload["required_tokens"] = fallback["required_tokens"]
    if not isinstance(payload.get("unknown_tokens"), list):
        payload["unknown_tokens"] = fallback["unknown_tokens"]
    return payload


def build_generation_plan(
    manual: RagManual, selected_asset_ids: list[str] | None = None
) -> tuple[dict[str, Any], str, str]:
    query = RagAsset.objects.filter(manual=manual, role=RagAsset.Role.TEMPLATE)
    if selected_asset_ids:
        query = query.filter(id__in=selected_asset_ids)
    template_assets = list(query.order_by("package_rel_path"))
    playbook = load_playbook(manual.package_code, manual.package_version)
    fallback = _deterministic_plan(manual, template_assets, playbook)

    prompt_version, prompt_text = get_prompt("plan", "v1")
    user_prompt = (
        f"package_code={manual.package_code}\n"
        f"package_version={manual.package_version}\n"
        f"templates={fallback['outputs']}\n"
        f"required_tokens={fallback['required_tokens']}\n"
        f"unknown_tokens={fallback['unknown_tokens']}\n"
        f"playbook={playbook}"
    )

    response = chat_json(
        model=settings.OPENAI_CHAT_MODEL,
        system_prompt=prompt_text,
        user_prompt=user_prompt,
        temperature=0,
        retries=1,
    )
    plan = _validate_plan(response.payload, fallback)
    return plan, prompt_version, response.model
