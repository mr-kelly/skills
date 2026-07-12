#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$APP_DIR/.." && pwd)"

# Server deps (Hono) install on first run. The frontend is zero-build vanilla.
if [ ! -d "$SKILL_DIR/node_modules/hono" ] || [ ! -d "$SKILL_DIR/node_modules/@hono/node-server" ]; then
  echo "Installing kelly-email server dependencies (first run)…"
  (cd "$SKILL_DIR" && npm install)
fi

# Do not default KELLY_EMAIL_BUSABASE_URL/BASE_ID/BASE_SLUG here: env vars
# outrank the local bootstrap config on purpose (so an operator override always
# wins), so a launcher-level default would silently overrule whatever the
# setup UI saves. Pass through only what the user actually set.
exec node "$APP_DIR/server/launcher.ts"
