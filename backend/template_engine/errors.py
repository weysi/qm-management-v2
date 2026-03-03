from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TemplateEngineError(Exception):
    code: str
    message: str
    start: int | None = None
    end: int | None = None
    variable: str | None = None
    path: str | None = None

    def __str__(self) -> str:  # pragma: no cover - defensive
        return f"{self.code}: {self.message}"


def error_dict(err: TemplateEngineError) -> dict[str, object]:
    return {
        "error_code": err.code,
        "message": err.message,
        "start": err.start,
        "end": err.end,
        "variable": err.variable,
        "path": err.path,
    }
