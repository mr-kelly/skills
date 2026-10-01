---
title: 2026-10-02 Editorial Rollout — Restore accent-theme.css/.js
---

# Editorial Rollout — Restore accent-theme.css/.js

Date: 2026-10-02
Author: AI Assistant
AI Agent: Claude

## Prompts & Instructions

**Original Request:**
> 怎样了 (follow-up check-in on PR #178's CI status)

CI on `#178` failed: `kelly-invoice-sheet`'s `ui_test.py` —
`assert page.locator(".accent-settings").count() == 1` — `AssertionError`.

## What Changed

`#178` retired `accent-theme.css`/`.js` for all 60 apps that had them,
reasoning "the family is the accent now" by analogy to
`kelly-homework-coach`'s bespoke pass. That reasoning does not survive a
blind, fleet-wide pass: `accent-theme.js` renders a real, working,
operator-facing Help & Settings control (an 8-colour picker,
`.accent-settings` / `[data-accent-settings]`), and no editorial-family
picker exists yet to replace it. CI caught the regression on the first app
whose test happened to assert the control's presence explicitly.

Restored, byte-identical, from the pre-rollout commit (`b62c6d76`), for all
60 affected apps: `app/accent-theme.css`, `app/accent-theme.js`, and their
`<link>`/`<script>` tags back in their original last-stylesheet /
last-script position. `scripts/apply-editorial-rollout.mjs` no longer
touches accent-theme at all — it only adds `editorial.css` and the
`data-theme`/`data-editorial` attributes now. `tests/editorial-rollout.test.mjs`'s
assertion flipped from "accent-theme must be retired" to "accent-theme,
wherever it currently exists, must stay correctly wired" — a consistency
check instead of a fixed outcome, so it doesn't need updating if a future
app adds or drops accent-theme on its own.

## Why

Removing a working, tested, operator-facing control with nothing replacing
it is a product regression, not a mechanical cleanup — exactly the
distinction this rollout's own scope was supposed to respect ("mechanical
only... does not attempt the real adopter pass"). Retiring accent-theme in
favour of the family system is real, desirable future work, but it needs a
family-picker UI to land first, which is bespoke per-app (or per-shell) work,
not something a blind script should do as a side effect.

Accepted, stated trade-off this restoration leaves: an operator who picks an
Apple-style accent colour via the restored picker can now get a colour that
doesn't match the app's `ink-paper` (or other) editorial family — the
picker was never designed against this palette. That mismatch already
existed in spirit (accent-theme's 8 colours were never designed against
`base-ui.css`'s palette either), and is strictly better than deleting a
working control outright.

## Why CI only caught one app, not sixty

The `test:app-skills:oss` chain is a sequential `&&` of 67 apps;
`kelly-invoice-sheet` is #43, and the job stops at the first failure — CI
never reached apps #44–67. Verified every one of those 24 apps separately
after the fix: `scripts/check.mjs` and `node --test` (pure logic) pass for
all 24; the Playwright `ui_test.py` passes for 23 of 24 directly, and the
24th (`kelly-agent-observability`) failed only because *this verification
session* hadn't run `npm install` in that skill's root-level `scripts/`
directory (a second, separate `package.json` from the app's own) — confirmed
environmental, not a regression, by installing it and getting a clean pass.
The 42 apps before `kelly-invoice-sheet` in the chain were already proven
clean by CI's own run (it reached and passed all of them before failing at
#43), and the fix here only adds files back — it cannot newly break an app
that was passing with those files present.

## Files Affected

- `scripts/apply-editorial-rollout.mjs` — no longer touches accent-theme
- `tests/editorial-rollout.test.mjs` — assertion inverted to a consistency
  check
- 60 apps × (`app/accent-theme.css`, `app/accent-theme.js`, `app/index.html`)
  — files restored byte-identical, wiring restored to original position

## Breaking Changes

None — this restores pre-`#178` behavior for accent-theme while keeping the
editorial.css addition from `#178` intact.

## Testing

- All 120 restored files (`accent-theme.css`/`.js` × 60 apps) diffed byte-for-byte
  against the pre-rollout commit — 0 mismatches.
- Per-app diff spot check (`kelly-invoice-sheet`) against the pre-rollout
  commit shows exactly the intended net change: `editorial.css` link +
  `data-theme`/`data-editorial` attributes added, nothing else.
- `python3 tests/app-skills/kelly-invoice-sheet/ui_test.py` — the exact test
  CI ran — now passes (2/2 scenarios), run directly, not inferred.
- All 24 apps CI never reached (because it stopped at #43): `node
  scripts/check.mjs` 24/24, `node --test` 24/24, `ui_test.py` 24/24 (23
  directly, 1 after installing a skill-root dependency this verification
  session had missed — confirmed unrelated to the rollout by installing it
  and getting a clean pass).
- `node --test tests/editorial-rollout.test.mjs tests/editorial-theme.test.mjs`
  — 21/21. `find tests/app-skills -name contract.test.mjs | xargs node --test`
  — 635/635, unaffected.
- `npx biome check .` — clean, 2,819 files.
- `node scripts/apply-editorial-rollout.mjs --check` — clean (idempotent).
- Stray `package-lock.json` files generated by this session's per-app `npm
  install` verification runs (26 of them) removed before committing — this
  repo does not commit per-app lockfiles.

## Follow-up Tasks

- Building an editorial-family picker to actually replace accent-theme's
  8-colour picker — real work, deliberately not attempted here.
- Same follow-ups as `#178`: the structural per-app component rewrite, the
  1,064 pre-existing raw-colour declarations, and `tests/base-ui-rollout.test.mjs`'s
  two pre-existing failures remain unaddressed.
