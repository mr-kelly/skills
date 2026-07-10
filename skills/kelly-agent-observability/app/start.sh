#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$APP_DIR/.." && pwd)"

# Server deps (Hono) install on first run. The frontend is zero-build vanilla.
if [ ! -d "$SKILL_DIR/node_modules/hono" ] || [ ! -d "$SKILL_DIR/node_modules/@hono/node-server" ]; then
  echo "Installing kelly-agent-observability server dependencies (first run)…"
  (cd "$SKILL_DIR" && npm install)
fi

# Seed mock fleet telemetry on first run so the dashboard has data immediately.
if [ ! -f "$APP_DIR/.data/fleet.json" ]; then
  echo "Seeding mock fleet telemetry (first run)…"
  (cd "$SKILL_DIR" && node scripts/generate_fleet_data.ts)
fi

exec node "$APP_DIR/server/launcher.ts"
