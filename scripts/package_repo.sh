#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p artifacts
ts="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
artifact="artifacts/build_${ts}.zip"

zip -rq "$artifact" \
  backend \
  src \
  scripts \
  package.json \
  package-lock.json \
  next.config.ts \
  tsconfig.json \
  tailwind.config.ts \
  AGENTS.md \
  AGENT_OUTPUT.md \
  docker-compose.yml

echo "Artifact: $artifact"
