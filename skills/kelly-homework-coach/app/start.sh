#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node app/server/launcher.ts
