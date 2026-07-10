#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$APP_DIR/.." && pwd)"

# Server deps (Hono) install on first run. The frontend is zero-build vanilla.
if [ ! -d "$SKILL_DIR/node_modules/hono" ] || [ ! -d "$SKILL_DIR/node_modules/@hono/node-server" ]; then
  echo "Installing kelly-email server dependencies (first run)…"
  (cd "$SKILL_DIR" && npm install)
fi

export KELLY_EMAIL_DATA_PROVIDER="${KELLY_EMAIL_DATA_PROVIDER:-busabase}"
export KELLY_EMAIL_BUSABASE_URL="${KELLY_EMAIL_BUSABASE_URL:-http://127.0.0.1:15419}"
export KELLY_EMAIL_BUSABASE_BASE_ID="${KELLY_EMAIL_BUSABASE_BASE_ID:-kelly-email}"
export KELLY_EMAIL_BUSABASE_BASE_SLUG="${KELLY_EMAIL_BUSABASE_BASE_SLUG:-kelly-email}"

exec node "$APP_DIR/server/launcher.ts"
