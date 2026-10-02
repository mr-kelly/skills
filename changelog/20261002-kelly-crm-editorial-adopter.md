---
title: 2026-10-02 Kelly CRM — Full Editorial Adoption
---

# Kelly CRM — Full Editorial Adoption

Date: 2026-10-02
Author: AI Assistant
AI Agent: Claude

## Prompts & Instructions

**Original Request:** "都做了吧" — proceed with all four follow-ups from the
editorial rollout, including the structural "magazine" adoption. Scoped via
clarifying question to "2-3 sample apps, each given the full
`kelly-homework-coach` (#156) treatment" rather than a mechanical pass across
the fleet. `kelly-crm` is the first of three.

## What Changed

### Two real bugs found by actually using the app, not by reading code

- **`zh` demo content was only partially localized.** `localizeSnapshotZh()`
  already overrode `deals[].next_step` and `deals[].notes`, but not
  `deals[].agent_next_action` (rendered as "智能体建议的下一步" — the single
  most prominent block on a deal's detail page) or `contacts[].agent_notes`.
  A zh-CN screenshot of a deal detail showed Chinese everywhere except the
  one paragraph the operator reads first. Added zh translations for all 8
  deals' `agent_next_action` and all 10 contacts' `agent_notes`. The
  interaction timeline (real meeting/email records) stays English by design
  — per `ui-workflow-patterns.md`'s multilingual rule, that is source
  material, not UI chrome, and this fix only touches the latter.
- **The metric band collapsed to one column at phone width**, not two.
  `mobile-shell-layout.md` is explicit about this exact case ("two columns
  of four metrics is two rows there, and the list still has to be visible
  under them") — a pre-existing `@media (max-width: 720px) { .metrics {
  grid-template-columns: 1fr } }` rule, unrelated to this PR's own additions,
  silently overrode the correct 2-column rule at the same breakpoint. Only
  visible by actually opening the app at 390px; invisible in any token-level
  or desktop check. Removed the conflicting rule.

### Structural: the masthead, not just new colours

Per `editorial-visual-system.md`'s `desk` register, Overview now opens with
an eyebrow, a serif headline computed from real state ("3 follow-ups need
your decision today" / "Nothing needs your decision today"), a lede
summarising pipeline value, a rule-heavy divider, and a hairline-divided
4-metric band (was 4 individually-bordered cards). The shared topbar
`<h1>`/subtitle are left empty on this one view — a second heavy heading
next to the new masthead would just repeat it — every other view (Deals,
Contacts, Follow-ups, Settings) keeps its plain topbar title unchanged, per
the doc's own rule that only the opening screen gets the full treatment.

### Token purity and the accent system

- Removed the app's own dead `:root { --bg: ...; --accent: #334155; ... }`
  block (16 declarations) — editorial.css's higher-specificity `html:root`
  already won every one of these regardless, so the local copy was inert,
  but keeping two copies of the same names is how one silently drifts from
  the other.
- Fixed the remaining raw values `check-editorial.mjs` flags once wired in:
  box-shadow colours (via the same classifier built for the fleet-wide
  tokenization), six `border-radius: 999px` → `var(--radius-pill)`, two
  `0.18s ease` transitions (sidebar collapse, mobile drawer slide — both
  state changes a viewer should see) → `var(--ease-state)`.
- Retired `accent-theme.css`/`.js`, replaced with `style-picker.css`/`.js`
  (built in the editorial-rollout follow-up work) — verified safe first:
  `tests/app-skills/kelly-crm/*.py` has no `.accent-settings` assertion,
  unlike the app that caught the fleet-wide rollout's accidental removal.
  Verified working end-to-end: clicking a family swatch in Help & Settings
  re-themes the whole app live, persists across reload, and renders
  correctly in dark mode for a non-default family.
- `scripts/check.mjs` now runs `editorialAssertions` (previously only
  `kelly-homework-coach` had this wired) — passes clean.

### Regenerated assets

`assets/screenshots/*.webp` + `thumbs/*` recaptured via the repo's own
`capture-app-screenshots.mjs --frame` — the committed README screenshots now
show the actual masthead, not the pre-adoption layout.

## Files Affected

- `app/app.js` — masthead markup, metric-band restructuring, topbar
  title/subtitle cleared for Overview
- `app/styles.css` — masthead/metric-band CSS, dead `:root` removed, raw
  box-shadow/radius/transition values tokenized, mobile 1-column override
  removed
- `app/demo-visuals.css` — box-shadow/colour tokenized (same fix as `#182`)
- `app/i18n/messages.js` — 3 new keys (en+zh) for the masthead copy
- `app/js/providers/demo-provider.js` — zh translations for
  `agent_next_action` (8 deals) and `agent_notes` (10 contacts)
- `app/index.html` — `accent-theme.css`/`.js` replaced with
  `styles/style-picker.css`/`.js`
- `app/accent-theme.css`, `app/accent-theme.js` — removed
- `app/styles/style-picker.css`, `app/styles/style-picker.js` — new (copies
  of the shared asset)
- `scripts/check.mjs` — editorial contract check wired in
- `assets/screenshots/*.webp`, `assets/screenshots/thumbs/*.webp` —
  regenerated

## Breaking Changes

None to data, API, or Busabase resources. The accent picker UI changes from
8 Apple colours to 7 editorial families — same category of control, not a
new concept for the operator.

## Testing

- `node scripts/check.mjs` — clean (editorial contract included).
- `node --test` (app-owned unit tests) — 3/3.
- `tests/app-skills/kelly-crm/contract.test.mjs` — 5/5.
- `tests/app-skills/kelly-crm/local-server.test.mjs` — 3/3.
- `tests/app-skills/kelly-crm/ui_test.py` — 2/2, including the real
  Busabase round-trip scenario (lazy provisioning, decision write,
  persistence) — confirms the `app.js`/`demo-provider.js` changes didn't
  touch the real decision-write path.
- `node --test tests/*.test.mjs` (repo-level, excluding
  `base-ui-rollout.test.mjs`'s two pre-existing unrelated failures) — 31/31.
- Real-browser verification across every route: desktop 1280x720/820 light
  and dark, phone 390px and 360px — no console errors, no horizontal
  overflow anywhere. Style picker exercised with real clicks: family switch
  (confirmed via computed `--accent`), persistence across reload, dark mode
  with a non-default family.
- `npx biome check skills/kelly-crm/` clean. `node scripts/build-site.mjs`
  — 78 pages. `npx tsc` — no new errors attributable to this change.

## Follow-up Tasks

- `kelly-campaigns` and `kelly-legal-contracts` are next in this same
  3-sample batch.
- Whether to extend `spread`/`gallery` registers to this app — not attempted
  here; `desk` already reads well and nothing in the data obviously wants a
  different register.
