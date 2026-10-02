---
title: 2026-10-02 Kelly Legal Contracts — Full Editorial Adoption
---

# Kelly Legal Contracts — Full Editorial Adoption

Date: 2026-10-02
Author: AI Assistant
AI Agent: Claude

## Prompts & Instructions

**Original Request:** "都做了吧" — proceed with all four follow-ups from the
editorial rollout, including the structural "magazine" adoption. Scoped via
clarifying question to "2-3 sample apps, each given the full
`kelly-homework-coach` (#156) treatment" rather than a mechanical pass across
the fleet. `kelly-legal-contracts` is the third and last of three, chosen
for a different industry/domain (legal/compliance review, with hard-stop
risk rules) than `kelly-crm` (sales) and `kelly-campaigns` (marketing).

## What Changed

### A third app, the same pre-existing bug

- **The metric band collapsed to one column at phone width**, not two — the
  third unrelated app in this 3-sample batch with the exact same bug:
  `workflow.css`'s `@media (max-width: 720px) { .metrics, .settings-row {
  grid-template-columns: 1fr } }` silently overrode the correct 2-column
  rule from 980px. All three sample apps had this identical pattern,
  including a byte-identical dead legacy `:root` block in `shell.css` —
  strong evidence these three (and likely most of the pre-editorial fleet)
  share a common template origin. A dedicated fleet-wide sweep is now a
  clear follow-up, flagged in all three PRs rather than attempted piecemeal.

### Structural: the masthead, not just new colours

Per `editorial-visual-system.md`'s `desk` register, Overview now opens with
an eyebrow ("Contract Review" + seller brand + generated date), a serif
headline computed from real state ("3 clause issues need your review today"
/ "Nothing needs your review today"), a lede summarising the portfolio
(contract count + compliance pass rate), a rule-heavy divider, and a
hairline-divided 4-metric band (Contracts / Clause Issues / Risk pass rate
/ Exported this week — including the per-platform issue-count badges,
preserved unchanged). The shared topbar `<h1>`/subtitle are left empty on
this one view only.

This app also has an independent `#mobileViewTitle`/`#mobileViewMeta` compact
mobile nav strip (derived from the route name directly, not from the topbar
title) — confirmed unaffected by clearing `els.title`/`els.subtitle`, since
it was never wired to them.

### Token purity and the accent system

Identical fix set to `kelly-campaigns` (#184), found via the same
`check-editorial.mjs` pass: dead `:root` block removed from `shell.css`
(byte-identical to the other two apps' copies), 7 `border-radius: 999px` →
`var(--radius-pill)`, one `0.375rem` → `var(--radius-sm)`, 2 `0.18s ease`
transitions → `var(--ease-state)`, 6 raw box-shadow colours classified by
the fleet-wide ring/alpha rule, one `#202124` badge background →
`var(--ink)`, one mobile-sidebar scrim → `var(--scrim)`, and 2 dead
`var(--x, #fallback)` colours in `demo-visuals.css` with the fallback
dropped.

Retired `accent-theme.css`/`.js`, replaced with the shared
`style-picker.css`/`.js`. Safety-checked first: the only `accent-theme`
references in `tests/app-skills/kelly-legal-contracts/contract.test.mjs`
assert that a *stale pre-Busabase provider layout* at `skillRoot/app/...`
does **not** exist — unrelated to the live
`content/kelly-legal-contracts-app/app/accent-theme.css` this PR removes,
confirmed by reading the test before touching anything. Verified working
end-to-end: picker mounts into Help & Settings via the `#content` +
settings-route heuristic, a family click (`sage-clay`) re-themes `--accent`
live, and the choice persists across reload.

`scripts/check.mjs` now runs `editorialAssertions` — passes clean after the
fixes above.

### Regenerated assets

All 12 screenshot pairs (6 routes × en/zh) + thumbnails recaptured via
`capture-app-screenshots.mjs --skill kelly-legal-contracts --frame` and
`generate-screenshot-thumbnails.mjs --skill kelly-legal-contracts`.

## Files Affected

- `content/kelly-legal-contracts-app/app/app.js` — masthead markup in
  `renderOverview`, topbar title/subtitle cleared for Overview only
- `content/kelly-legal-contracts-app/app/styles/workflow.css` — masthead +
  hairline metric-band CSS, mobile 1-column override removed, 980px
  hairline row-redistribution, raw radius/transition/box-shadow/colour
  values tokenized
- `content/kelly-legal-contracts-app/app/styles/shell.css` — dead `:root`
  block removed, raw transition/box-shadow/radius/colour values tokenized
- `content/kelly-legal-contracts-app/app/demo-visuals.css` — dead
  `var(--x, #fallback)` fallbacks dropped
- `content/kelly-legal-contracts-app/app/i18n/messages.js` — 4 new keys
  (en+zh) for the masthead copy
- `content/kelly-legal-contracts-app/app/index.html` —
  `accent-theme.css`/`.js` replaced with `styles/style-picker.css`/`.js`
- `content/kelly-legal-contracts-app/app/accent-theme.css`,
  `app/accent-theme.js` — removed
- `content/kelly-legal-contracts-app/app/styles/style-picker.css`,
  `app/styles/style-picker.js` — new (copies of the shared asset)
- `content/kelly-legal-contracts-app/scripts/check.mjs` — editorial
  contract check wired in
- `assets/screenshots/*.webp`, `assets/screenshots/thumbs/*.webp` —
  regenerated

## Breaking Changes

None to data, API, or Busabase resources. The accent picker UI changes from
a prior accent-only control to 7 editorial families.

## Testing

- `node scripts/check.mjs` — clean (editorial contract included).
- `node --test` (app-owned unit tests) — 22/22, including every hard-stop
  risk rule (`banned_words`, `claims_registry`) unaffected by the CSS/UI
  changes.
- `tests/app-skills/kelly-legal-contracts/contract.test.mjs` +
  `local-server.test.mjs` — 12/12.
- `tests/app-skills/kelly-legal-contracts/ui_test.py` — 2/2, including the
  real Busabase round-trip scenario (lazy provisioning, decision write,
  persistence).
- `cloud_oauth_test.py` — skipped (no cloud credentials in this
  environment).
- Real-browser verification across light/dark × 1280px/390px with
  `?demo=overview`: masthead renders with real computed copy, metric band
  is 4 columns desktop / 2 columns phone (never 1), platform badges render
  correctly, no console errors, no horizontal overflow. Style picker
  exercised with real clicks: family switch confirmed via computed
  `--accent`, persists across reload.
- `npx biome check` clean (one formatting fix applied). `build-site.mjs` —
  78 pages. Scoped `tsc` — zero errors attributable to this change (one
  pre-existing `@types/node` resolution artifact from cross-worktree
  `node_modules` borrowing, unrelated to any file this PR touches).

## Follow-up Tasks

- This completes the 3-sample batch (`kelly-crm` #183, `kelly-campaigns`
  #184, `kelly-legal-contracts`). The mobile metric-band 1-column bug and
  the byte-identical dead `:root` block showed up in all three — a
  dedicated fleet-wide grep-and-fix pass is the clear next step, not
  attempted here.
- Whether to extend `spread`/`gallery` registers to this app — not
  attempted here; `desk` already reads well.
