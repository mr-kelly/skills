---
title: 2026-10-22 kelly-homework-coach — Show Failures In The Page, Not In A Dialog
---

# kelly-homework-coach — Show Failures In The Page, Not In A Dialog

Date: 2026-10-22
Author: AI Assistant
AI Agent: Claude

## Request

> “确认修改”那排按钮点不动？ / 点击“开始做这套试卷”，页面没反应？

## What Changed

- Every `window.alert()` in the app (8 call sites) now goes through `showError()` /
  `showFailure()`, which render a `role="alert"` banner at the top of the detail panel
  (`[data-action-error]`). The banner is cleared on the next button click.
- Caught errors are prefixed with a localized "That did not go through:" so a raw
  "Failed to fetch" is not the whole message.
- New i18n key `actionFailed` (en / zh) and a `.decision-error` style.

## Why

The app runs inside a sandboxed Busabase AirApp iframe, where browsers silently drop modal
dialogs. A refused review decision, a paper that cannot start, or a failed network write
produced no feedback at all, which reads as a dead button. The click handlers themselves were
already wired; only their failure path was invisible.

This does not identify why a given user's write was refused. It makes the reason visible so the
next report carries it.

## Files Affected

- `skills/kelly-homework-coach/content/kelly-homework-coach-app/app/app.js` — `showError`,
  `showFailure`, banner in the detail panel, 8 alert call sites replaced
- `skills/kelly-homework-coach/content/kelly-homework-coach-app/app/i18n/messages.js` — `actionFailed`
- `skills/kelly-homework-coach/content/kelly-homework-coach-app/app/styles.css` — `.decision-error`
- `tests/app-skills/kelly-homework-coach/ui_test.py` — empty answer shows the banner, no dialog
- `tests/app-skills/kelly-homework-coach/learning_flow_test.py` — refused write against a real
  Busabase shows the banner, writes nothing, and the retry succeeds

## Breaking Changes

None.

## Testing

`python3 tests/app-skills/kelly-homework-coach/ui_test.py` (demo UI, OSS provisioning, real
Busabase learning flow), `pnpm run check` in the app, `node --test tests/app-skills/kelly-homework-coach/*.test.mjs`,
`npx biome check`.
