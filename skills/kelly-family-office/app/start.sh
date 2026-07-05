#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$APP_DIR/.." && pwd)"

# Server deps (Hono) install on first run. The frontend is zero-build vanilla.
if [ ! -d "$SKILL_DIR/node_modules/hono" ] || [ ! -d "$SKILL_DIR/node_modules/@hono/node-server" ]; then
  echo "Installing kelly-family-office server dependencies (first run)…"
  (cd "$SKILL_DIR" && npm install)
fi

exec node "$APP_DIR/server/launcher.mjs"
