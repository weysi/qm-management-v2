#!/bin/sh
set -eu

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/qm-management-v2}"

if [ -z "$DEPLOY_HOST" ]; then
  echo "DEPLOY_HOST is required." >&2
  exit 1
fi

if [ ! -f ".env.production" ]; then
  echo ".env.production is required before deployment." >&2
  exit 1
fi

REMOTE="$DEPLOY_USER@$DEPLOY_HOST"

ssh "$REMOTE" "mkdir -p '$DEPLOY_PATH'"

rsync -az --delete \
  --exclude '.git' \
  --exclude '.next' \
  --exclude 'node_modules' \
  --exclude '.venv' \
  --exclude 'data' \
  --exclude '*.zip' \
  . "$REMOTE:$DEPLOY_PATH/"

ssh "$REMOTE" "cd '$DEPLOY_PATH' && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build"
