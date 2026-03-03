from __future__ import annotations

from dataclasses import dataclass


class GenerationPolicyValidationError(ValueError):
    pass


@dataclass(frozen=True)
class RenderGenerationPolicy:
    on_missing_asset: str = "FAIL"
    allow_svg_rasterize: bool = False


def parse_generation_policy(payload: object | None) -> RenderGenerationPolicy:
    if payload is None:
        return RenderGenerationPolicy()
    if not isinstance(payload, dict):
        raise GenerationPolicyValidationError("generation_policy must be an object")

    raw = str(payload.get("on_missing_asset", "FAIL")).strip().upper()
    if raw not in {"FAIL", "KEEP_PLACEHOLDER"}:
        raise GenerationPolicyValidationError(
            "generation_policy.on_missing_asset must be FAIL or KEEP_PLACEHOLDER"
        )
    allow_svg_rasterize_payload = payload.get("allow_svg_rasterize")
    if allow_svg_rasterize_payload is None:
        allow_svg_rasterize = False
    elif isinstance(allow_svg_rasterize_payload, bool):
        allow_svg_rasterize = allow_svg_rasterize_payload
    else:
        raise GenerationPolicyValidationError(
            "generation_policy.allow_svg_rasterize must be a boolean"
        )

    return RenderGenerationPolicy(
        on_missing_asset=raw,
        allow_svg_rasterize=allow_svg_rasterize,
    )


def should_fail_on_missing_asset(policy: RenderGenerationPolicy) -> bool:
    return policy.on_missing_asset == "FAIL"
