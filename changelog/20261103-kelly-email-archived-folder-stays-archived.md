---
title: 2026-11-03 Kelly Email no longer rebuilds a Folder that was moved to the Trash
---

# Kelly Email no longer rebuilds a Folder that was moved to the Trash

Date: 2026-11-03
Author: AI Assistant
AI Agent: Claude

## Prompts & Instructions

**Original Request:**
> The Kelly Email Folder in a Space was deleted, and came back about a second later. Who created it, and why does it come back?

**Refined Instructions:**
- Find what recreates the Folder after it is deleted.
- Stop it for a Folder that someone deliberately removed, without breaking first-time setup in a Space that never had the app.

## What Changed

- Every data call in the Busabase provider ran `init()` first, and `init()` created whatever declared resource was missing. A Folder in the Trash counts as missing, so the next page load or poll rebuilt the whole Folder, its three Bases and the Drive.
- Automatic provisioning now checks the Space's Trash first. If a missing resource has a same-app node in the Trash, it is treated as removed on purpose: nothing is created, and the setup panel says so and how to proceed (restore it, or run `node scripts/init_busabase_schema.ts --apply`).
- A Space that never had the app still provisions on first contact, as before.
- An operator running `ensureSchema({ apply: true })` (the `--apply` script) is explicit intent and still creates the resources, Trash or not.

## Why

A deleted workspace should stay deleted. The only way out was to find and stop every running instance first.

## Files Affected

- `skills/kelly-email/content/kelly-email-app/app/js/busabase-client.js` - Trash check before automatic provisioning; `force` for explicit setup
- `skills/kelly-email/content/kelly-email-app/app/js/data/busabase-provider.js` - explicit `ensureSchema({ apply })` bypasses the guard; clearer status message and next step
- `skills/kelly-email/scripts/init_busabase_schema.ts` - help text
- `skills/kelly-email/content/kelly-email-app/test/busabase-conformance.test.mjs` - live test: archived Folder stays archived across repeated reads
- `tests/app-skills/kelly-email/ui_test.py` - browser story: delete, reload three times, explicit apply

## Breaking Changes

None. A Folder that is in the Trash is no longer recreated automatically; restore it or run the init script with `--apply`.

## Testing

- `pnpm --dir skills/kelly-email/content/kelly-email-app check`
- `BUSABASE_LIVE_TEST_URL=<local busabase> node --test skills/kelly-email/content/kelly-email-app/test/busabase-conformance.test.mjs`
- `python3 tests/app-skills/kelly-email/ui_test.py`
