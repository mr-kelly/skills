---
title: 2026-10-02 Kelly Campaigns — Full Editorial Adoption
---

# Kelly Campaigns — Full Editorial Adoption

Date: 2026-10-02
Author: AI Assistant
AI Agent: Claude

## Prompts & Instructions

**Original Request:** "都做了吧" — proceed with all four follow-ups from the
editorial rollout, including the structural "magazine" adoption. Scoped via
clarifying question to "2-3 sample apps, each given the full
`kelly-homework-coach` (#156) treatment" rather than a mechanical pass across
the fleet. `kelly-campaigns` is the second of three, chosen because its CSS
is split across `base-ui.css` / `editorial.css` / `layers.css` / `shell.css`
/ `workflow.css` (layered `@layer` architecture) rather than `kelly-crm`'s
single `styles.css` — a structurally different pattern worth proving the
adoption approach against.

## What Changed

### A real bug found by actually using the app, not by reading code

- **The metric band collapsed to one column at phone width**, not two — the
  exact same bug class as `kelly-crm`'s (#183), present here too:
  `workflow.css`'s `@media (max-width: 720px) { .metrics, .network-grid,
  .settings-channel { grid-template-columns: 1fr } }` silently overrode the
  correct 2-column rule established at 980px. `mobile-shell-layout.md` is
  explicit that a 4-metric band stays 2 columns even at narrow phone widths.
  Found by opening the app at 390px, not visible at any desktop viewport or
  in a token-level check. Given this is the second unrelated app found with
  the identical pre-existing pattern, it is likely common across the older
  (pre-editorial) apps in the fleet — worth a dedicated fleet-wide sweep, not
  attempted here (out of scope for a single-app adoption PR).

### Structural: the masthead, not just new colours

Per `editorial-visual-system.md`'s `desk` register, Overview now opens with
an eyebrow ("Email Operations" + generated timestamp), a serif headline
computed from real state ("9 sends need your review today" / "Nothing needs
your review today"), a lede summarising list health (subscriber count +
average open rate), a rule-heavy divider, and a hairline-divided 4-metric
band (was 4 individually-bordered cards). The shared topbar `<h1>`/subtitle
are left empty on this one view — every other view (Campaigns,
Deliverability, Performance, Help & Settings) keeps its plain topbar title
unchanged.

The hairline band itself needed one adjustment `kelly-crm` didn't: this
app's metrics already went to 2 columns at 980px (not 720px like
`kelly-crm`), so the row-divider redistribution (`.metric:nth-child(3/4)`
gets a top hairline instead of an inline-start one once there are only 2
columns) is wired at the 980px breakpoint here, not 720px.

### Token purity and the accent system

- Removed the app's own dead `:root { color-scheme: ...; --bg: ...; }` block
  (16 declarations, in `shell.css`) — `editorial.css`'s higher-specificity
  `html:root` already won every one of these regardless.
- Fixed every raw value `check-editorial.mjs` flags once wired in: 6
  `border-radius: 999px` → `var(--radius-pill)`, one stray
  `border-radius: 0.375rem` → `var(--radius-sm)`, 2 `0.18s ease` transitions
  (sidebar collapse, mobile drawer slide — both state changes a viewer
  should see) → `var(--ease-state)`, 6 raw box-shadow colours classified by
  the same ring/alpha rule used fleet-wide (`--accent-focus` for focus
  rings, `--shadow-tint`/`--shadow-tint-deep` by alpha, `--scrim` for the
  mobile sidebar backdrop), 2 raw `#202124` badge backgrounds →
  `var(--ink)`, and 4 dead `var(--muted, #71717a)` / `var(--text, #18181b)`
  fallbacks in `demo-visuals.css` with the fallback dropped (both names are
  always defined now).
- Retired `accent-theme.css`/`.js`, replaced with `style-picker.css`/`.js`
  (built in the editorial-rollout follow-up work) — verified safe first:
  `tests/app-skills/kelly-campaigns/*.py` has no `.accent-settings`
  assertion. Verified working end-to-end: the picker mounts into the Help &
  Settings `<div class="settings">` panel via the `#content` +
  settings-route heuristic (this app has no `#settingsContent` id, unlike
  some other apps — confirms the heuristic chain, not just the first match,
  matters), clicking a family swatch re-themes the whole app live
  (`--accent` changed from `#3a5a93` to `#b8546b` on a Rose & Ochre click),
  and the choice persists across reload.
- `scripts/check.mjs` now runs `editorialAssertions` (previously only
  `kelly-homework-coach` and `kelly-crm` had this wired) — passes clean
  after the fixes above.

### Regenerated assets

`assets/screenshots/*.webp` + `thumbs/*` recaptured via the repo's own
`capture-app-screenshots.mjs --skill kelly-campaigns --frame` and
`generate-screenshot-thumbnails.mjs --skill kelly-campaigns` — the committed
README screenshots now show the masthead, not the pre-adoption layout.

## Files Affected

- `content/kelly-campaigns-app/app/app.js` — masthead markup in
  `renderOverview`, topbar title/subtitle cleared for Overview only
- `content/kelly-campaigns-app/app/styles/workflow.css` — masthead +
  hairline metric-band CSS, mobile 1-column override removed, 980px hairline
  row-redistribution, raw radius/transition/box-shadow/colour values
  tokenized
- `content/kelly-campaigns-app/app/styles/shell.css` — dead `:root` block
  removed, raw transition/box-shadow/radius/colour values tokenized
- `content/kelly-campaigns-app/app/demo-visuals.css` — dead
  `var(--x, #fallback)` fallbacks dropped, one raw box-shadow tokenized
- `content/kelly-campaigns-app/app/i18n/messages.js` — 4 new keys (en+zh)
  for the masthead copy
- `content/kelly-campaigns-app/app/index.html` — `accent-theme.css`/`.js`
  replaced with `styles/style-picker.css`/`.js`
- `content/kelly-campaigns-app/app/accent-theme.css`,
  `app/accent-theme.js` — removed
- `content/kelly-campaigns-app/app/styles/style-picker.css`,
  `app/styles/style-picker.js` — new (copies of the shared asset)
- `content/kelly-campaigns-app/scripts/check.mjs` — editorial contract check
  wired in
- `assets/screenshots/*.webp`, `assets/screenshots/thumbs/*.webp` —
  regenerated

## Breaking Changes

None to data, API, or Busabase resources. The accent picker UI changes from
a prior accent-only control to 7 editorial families — same category of
control, not a new concept for the operator.

## Testing

- `node scripts/check.mjs` — clean (editorial contract included).
- `node --test` (app-owned unit tests) — 5/5.
- `tests/app-skills/kelly-campaigns/contract.test.mjs` +
  `local-server.test.mjs` — 10/10.
- `tests/app-skills/kelly-campaigns/ui_test.py` — 2/2, including the real
  Busabase round-trip scenario (lazy provisioning, decision write,
  persistence) — confirms the `app.js` changes didn't touch the write path.
- `cloud_oauth_test.py` — skipped (no cloud credentials in this
  environment), same as every other local run.
- Real-browser verification across light/dark × 1280px/390px with
  `?demo=overview`: masthead renders with real computed copy, metric band
  is 4 columns desktop / 2 columns phone (never 1), no console errors, no
  horizontal overflow. Style picker exercised with real clicks: family
  switch confirmed via computed `--accent`, persists across reload.
- `npx biome check skills/kelly-campaigns/` clean (one formatting fix
  applied). `node scripts/build-site.mjs` — 78 pages. Scoped `npx tsc` run
  showed only pre-existing `busabase-sdk` module-resolution noise in
  unrelated apps (`kelly-support`, `kelly-tickets`, `kelly-wechat-crm`,
  `kelly-writer`) from this throwaway worktree never having run a
  workspace-root `pnpm install` — zero errors attributable to this change.

## Follow-up Tasks

- `kelly-legal-contracts` is next and last in this 3-sample batch.
- The mobile metric-band 1-column bug has now shown up identically in two
  unrelated apps (`kelly-crm`, `kelly-campaigns`) that predate the editorial
  rollout — worth a dedicated fleet-wide grep-and-fix pass once the 3-sample
  batch is done, not attempted here.
- Whether to extend `spread`/`gallery` registers to this app — not attempted
  here; `desk` already reads well.
