#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable


ARTIFACTS_DIR = Path("artifacts")
REPORT_PATH = ARTIFACTS_DIR / "token_report.json"


def _load_encoder():
    try:
        import tiktoken  # type: ignore

        return tiktoken.encoding_for_model("gpt-4o-mini")
    except Exception:
        return None


ENCODER = _load_encoder()


def token_count(text: str) -> int:
    if ENCODER is not None:
        return len(ENCODER.encode(text))
    # Deterministic fallback when tiktoken is unavailable.
    return max(1, len(text) // 4) if text else 0


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def get_paths_from_git_diff(diff_ref: str) -> list[Path]:
    command = ["git", "diff", "--name-only", diff_ref]
    output = subprocess.check_output(command, text=True)
    return sorted(
        {
            Path(line.strip())
            for line in output.splitlines()
            if line.strip()
        }
    )


def git_show_text(ref: str, path: Path) -> str | None:
    try:
        return subprocess.check_output(
            ["git", "show", f"{ref}:{path.as_posix()}"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return None


@dataclass
class FileTokenReport:
    path: str
    tokens_before: int | None
    tokens_after: int
    delta_tokens: int | None


def build_report(paths: Iterable[Path], baseline_ref: str) -> list[FileTokenReport]:
    reports: list[FileTokenReport] = []
    for path in sorted(set(paths), key=lambda p: p.as_posix()):
        after_text = read_text(path) if path.exists() and path.is_file() else ""
        after_tokens = token_count(after_text)

        before_text = git_show_text(baseline_ref, path)
        before_tokens = token_count(before_text) if before_text is not None else None
        delta = (after_tokens - before_tokens) if before_tokens is not None else None

        reports.append(
            FileTokenReport(
                path=path.as_posix(),
                tokens_before=before_tokens,
                tokens_after=after_tokens,
                delta_tokens=delta,
            )
        )
    return reports


def print_table(rows: list[FileTokenReport]) -> None:
    headers = ["Path", "Tokens Before", "Tokens After", "Delta"]
    data = [
        [
            row.path,
            "-" if row.tokens_before is None else str(row.tokens_before),
            str(row.tokens_after),
            "-" if row.delta_tokens is None else f"{row.delta_tokens:+d}",
        ]
        for row in rows
    ]
    widths = [len(h) for h in headers]
    for r in data:
        for idx, cell in enumerate(r):
            widths[idx] = max(widths[idx], len(cell))

    def _line(values: list[str]) -> str:
        return " | ".join(value.ljust(widths[idx]) for idx, value in enumerate(values))

    print(_line(headers))
    print("-+-".join("-" * w for w in widths))
    for r in data:
        print(_line(r))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate per-file token report")
    parser.add_argument(
        "--paths",
        nargs="*",
        default=[],
        help="Explicit file paths to include",
    )
    parser.add_argument(
        "--git-diff",
        default=None,
        help="Collect file paths from git diff reference (e.g. HEAD)",
    )
    parser.add_argument(
        "--baseline-ref",
        default="HEAD",
        help="Git ref used to compute tokens_before (default: HEAD)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    input_paths = [Path(p) for p in args.paths]
    if args.git_diff:
        input_paths.extend(get_paths_from_git_diff(args.git_diff))
    paths = sorted(set(input_paths))

    if not paths:
        print("No files to report.")
        return 1

    rows = build_report(paths, args.baseline_ref)
    print_table(rows)

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "baseline_ref": args.baseline_ref,
        "files": [asdict(row) for row in rows],
    }
    REPORT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nToken report written: {REPORT_PATH.as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
