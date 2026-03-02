#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p artifacts
report="artifacts/dead_surface_report.txt"

{
  echo "Dead Surface Audit"
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo

  echo "== API Routes =="
  find src/app/api -name 'route.ts' | sort
  echo

  echo "== API Route Imports =="
  while IFS= read -r route; do
    echo "-- $route"
    rg -n "^import " "$route" || true
    echo
  done < <(find src/app/api -name 'route.ts' | sort)

  echo "== Candidate Orphan Modules (heuristic) =="
  while IFS= read -r file; do
    alias_path="@/${file#src/}"
    alias_path="${alias_path%.ts}"
    alias_path="${alias_path%.tsx}"

    if [[ "$file" == *"/index.ts" ]]; then
      continue
    fi

    if ! rg -n --fixed-strings "$alias_path" src --glob "!$file" >/dev/null 2>&1; then
      echo "$file"
    fi
  done < <(find src/components src/hooks src/lib -type f \( -name '*.ts' -o -name '*.tsx' \) | sort)
} >"$report"

echo "Dead surface report: $report"
