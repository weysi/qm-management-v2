from __future__ import annotations

from pathlib import Path

from django.conf import settings


PROMPT_REGISTRY = {
    "router": {"v1": "backend/prompts/router_v1.md"},
    "chat_answer": {"v1": "backend/prompts/chat_answer_v1.md"},
    "plan": {"v1": "backend/prompts/plan_v1.md"},
    "infer_variables": {"v1": "backend/prompts/infer_variables_v1.md"},
    "draft_variables": {"v1": "backend/prompts/draft_variables_v1.md"},
}


def get_prompt(name: str, version: str = "v1") -> tuple[str, str]:
    version_map = PROMPT_REGISTRY.get(name)
    if version_map is None:
        raise KeyError(f"Unknown prompt: {name}")

    path = version_map.get(version)
    if path is None:
        raise KeyError(f"Unknown prompt version: {name}/{version}")

    full_path = Path(path)
    if not full_path.is_absolute():
        full_path = (settings.PROJECT_ROOT / full_path).resolve()
    content = full_path.read_text(encoding="utf-8")
    return version, content
