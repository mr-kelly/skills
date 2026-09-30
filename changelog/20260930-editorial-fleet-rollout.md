---
title: 2026-09-30 Editorial Theme — Mechanical Fleet Rollout
---

# Editorial Theme — Mechanical Fleet Rollout

Date: 2026-09-30
Author: AI Assistant
AI Agent: Claude

## Prompts & Instructions

**Original Request:**
> 把预设推广到剩下 69 个 app

Follow-up from `#156`'s own "Follow-ups" note: "Roll the preset to the
remaining 69 apps, or decide it stays opt-in. The migration cost is the
app-owned stylesheet, not the theme." — i.e. the mechanical, token-only pass
is what a fleet-wide rollout can safely do; the per-app component rewrite
`kelly-homework-coach` got is bespoke, one app at a time.

**Refined scope, decided during implementation, not assumed at the start:**
- Mechanical only: copy the asset, wire it, retire `accent-theme.css`/`.js`.
  Do not touch any app's own component CSS or markup.
- Investigate the cascade rather than trust that "editorial.css wins" from
  the single-app case generalizes — it did not, cleanly, and the
  investigation changed the shared asset itself (see below).

## What Changed

**`scripts/apply-editorial-rollout.mjs`** (new) — idempotent, mirrors
`apply-base-ui-rollout.mjs`'s shape. For every `kelly-*` app except the
already-adopted `kelly-homework-coach`: copies `editorial.css` +
`check-editorial.mjs` unmodified, wires `editorial.css` as the stylesheet
immediately after `base-ui.css`, retires `accent-theme.css`/`.js` (file and
`<link>`/`<script>` tags), and sets `data-theme="ink-paper"
data-editorial="desk"` on `<html>`. Run with `--check` for a dry-run report.

**`editorial.css`** (shared asset, extended) — a new "LEGACY NAME SHIM"
block. This is the substantive finding of this rollout, not a mechanical
detail: see "Why" below.

**`tests/editorial-rollout.test.mjs`** (new) — the fleet-wide invariant,
mirroring `tests/base-ui-rollout.test.mjs`. Asserts the mechanical contract
(asset byte-identical, wiring order, accent-theme retired, style attributes
present) for all 70 non-adopted apps, plus the cascade-safety properties of
the new shim (every alias is `html:root`, not a bare `:root`; no alias is a
same-specificity self-reference). Deliberately does NOT assert every app's
own CSS is raw-colour-free — see "Not Touched Here".

**`tests/editorial-theme.test.mjs`** (fixed) — its `adopters()` helper
auto-discovered "fully adopted" apps by the presence of `styles/editorial.css`.
That was correct when there was exactly one such app and became wrong the
moment this rollout gave the same file to 70 apps for a narrower reason.
Restricted to the same `kelly-homework-coach`-only set the new test uses.

**70 apps** — `styles/editorial.css`, `scripts/check-editorial.mjs`,
`index.html` (wiring + attributes), `accent-theme.css`/`.js` removed where
present (60 of the 70).

## Why

### The single-app case does not generalize — verified, not assumed

`editorial.css`'s canonical tokens (`--ink`, `--accent`, `--line`, `--muted`,
...) are declared on an unlayered `html:root` selector (specificity 0,1,1),
which beats every app's own unlayered `:root { --ink: #171a1f; }` block
(0,1,0) regardless of load order. That much held for the single-app case and
still holds. What does NOT generalize: `base-ui.css` ships roughly 50 synonym
properties (`--bg`, `--panel`, `--text`, `--warn`, `--good`, `--line-strong`,
`--accent-weak`, `--shadow-sm`, ...) as aliases onto its own canonical names —
but only inside its *unlayered dark-mode* block. Its light-mode canonical
block is inside `@layer base-ui`, which always loses to an app's own
unlayered `:root`, so every one of the 70 apps kept its pre-rollout
`:root { --bg: #f7f8fa; --panel: #fff; --text: #171a1f; --warn: ...; }` as
the light-mode source of truth for those names — and every one of the 70
apps' own component CSS still reads at least one of them (grepped, not
guessed: 70/70 apps, 1,064 raw-colour declarations counted separately as a
related but distinct finding — see below). `editorial.css` never declared
these synonyms at all, canonical or aliased.

Net effect before this fix: dropping `editorial.css` into an app would
correctly re-theme everything reachable through the canonical names
(`--ink`, `--accent`, `--line`, ...) and leave everything reachable only
through a legacy synonym (`--bg`, `--panel`, `--warn`, ...) on the old,
pre-rollout hardcoded colour — a half-themed app, invisible in a
custom-property probe, visible only in a real screenshot next to a real
`:root` block. Confirmed both ways with Playwright reading computed style
against `kelly-crm`'s actual shipped CSS: `--bg` read the app's stale
`#f7f8fa` before the fix and `editorial.css`'s `--canvas` after it, in both
colour schemes.

The fix is one new block in `editorial.css`: an `html:root` alias for every
legacy name `base-ui.css` already aliases, each pointing at this file's own
canonical token via `var()`. Two things that went wrong once while writing
it, both now asserted against in `tests/editorial-rollout.test.mjs` so they
cannot come back silently:

- **A same-specificity self-reference.** Three of the legacy names
  (`--accent-weak`, and initially `--accent-wash`/`--accent-focus`/
  `--accent-text`) collide with names `editorial.css` already declares as
  *canonical*, not legacy. Writing `--accent-wash: var(--accent-wash);` inside
  the same `html:root` selector is a same-specificity, later-source-order
  declaration that wins the cascade and is CSS's own "guaranteed-invalid" case
  — it silently unset `--accent-wash` fleet-wide. Caught by reading the
  computed value in a browser before shipping, not by inspection.
- **`--line-strong` mapped to the wrong weight at first.** It reads as
  `--rule-strong` (this file's near-ink, "exactly one per screen" token) by
  name association, but base-ui's `--line-strong` is a moderate-weight border
  used liberally (5 uses in `kelly-crm`'s own CSS alone, for things like a
  focused row's border) — much closer to `--rule`. Getting this wrong would
  not go unused; every such border in the fleet would go near-black.

### What a mechanical rollout does and does not deliver — stated, not implied

Screenshotting `kelly-crm` before/after made this concrete: the token swap
correctly recolours the app (warm `ink-paper` canvas, correct accent/status
colours, correct dark mode, `--text-base` genuinely 13px→15px) and does
**not** give it the eyebrow/serif-headline/hairline-metric-band "magazine"
structure `kelly-homework-coach` has — that requires the app's own component
CSS to use editorial's semantic patterns, which is exactly the bespoke,
per-app work `#156`'s own follow-up note distinguished from "the theme".
This rollout is that distinction, executed: the palette and type scale moved
for all 71 apps; the structural rewrite remains future, per-app work.

## Not Touched Here

- **1,064 pre-existing raw-colour declarations**, counted across the 70
  apps' own component CSS before this rollout touched a single file (mostly
  `demo-visuals.css` illustration fills and status-specific accents the
  original base-ui rollout's heuristics didn't confidently classify either).
  Real, but not this rollout's scope — cleaning an app's own component CSS to
  be fully token-driven is the bespoke pass, one app at a time.
- **`tests/base-ui-rollout.test.mjs`** is unrelated pre-existing red on
  `main` (documented in `#156`: asserts 70 apps, fleet is 71; asserts
  `kelly-followups` doesn't set `color-scheme: light`, it does). CI does not
  run it; confirmed identical before and after this branch.
- Per-app `scripts/check.mjs` was **not** spliced to call
  `editorialAssertions` — each is bespoke (different variable names, some
  don't read `index.html` at all) and 70 blind insertions is exactly the kind
  of mechanical edit likely to silently break one of them. Enforcement is
  centralized in `tests/editorial-rollout.test.mjs` instead, the same way
  `base-ui.css` itself has never been enforced per-app.

## Files Affected

- `scripts/apply-editorial-rollout.mjs` — new
- `skills/kelly-app-skill-creator/assets/editorial-theme/editorial.css` —
  legacy name shim added (811 → 902 lines)
- `skills/kelly-homework-coach/content/kelly-homework-coach-app/app/styles/editorial.css` —
  synced to the same byte-identical copy
- `tests/editorial-rollout.test.mjs` — new
- `tests/editorial-theme.test.mjs` — `adopters()` scoped to fully-adopted apps
- 70 apps × 3 files (`app/styles/editorial.css`, `scripts/check-editorial.mjs`,
  `app/index.html`), minus `accent-theme.css`/`.js` for the 60 that had them

## Breaking Changes

None to any app's behavior, markup, or component logic — every change is CSS
custom-property values and two `<link>`/`<script>` removals. The visual
change (new palette, new base type scale, dark-mode consistency) is the
point, not a side effect.

## Testing

- `node scripts/apply-editorial-rollout.mjs --check` — clean (idempotent)
  after applying.
- `node --test tests/editorial-rollout.test.mjs tests/editorial-theme.test.mjs`
  — 24/24. Every new assertion confirmed to go red on its own violation first
  (wrong wiring order, missing `data-theme`, a reintroduced self-reference,
  an alias removed) before being kept.
- `find tests/app-skills -name contract.test.mjs | xargs node --test` — 635/635
  across the fleet; these assert file-existence contracts for several apps
  that mention `accent-theme.css` — confirmed those assertions target the
  retired pre-Busabase `<skill-root>/app/` layout, not the current
  `content/<name>-app/app/` path, so retiring accent-theme here doesn't
  intersect them.
- `npx biome check .` — clean, 2,699 files.
- `npx tsc -p tsconfig.json` — the run shows ~550 pre-existing `busabase-sdk`
  module-resolution errors; confirmed by diff against the unmodified checkout
  that this is a `node_modules` artifact of a fresh git worktree (0 of 71
  per-app `node_modules` installed there vs. 72 already present in the
  working checkout used for exploration) and not one new error attributable
  to any file this rollout touched.
- `node scripts/build-site.mjs` — 78 pages, no taxonomy drift.
- Real-browser verification, not just computed-style probes: `kelly-crm`,
  `kelly-campaigns` (layered `styles/shell.css`), and `kelly-email` (no
  `accent-theme.css` to begin with) served statically and screenshotted at
  1280x800, light and dark, via `?demo=1`. No console errors attributable to
  this change, no horizontal overflow, correct palette/dark-mode in all six
  screenshots.

## Follow-up Tasks

- The structural "magazine" component rewrite (eyebrow, serif headline,
  hairline metric band) remains per-app, bespoke work — this rollout
  deliberately does not attempt it at fleet scale.
- The 1,064 pre-existing raw-colour declarations in apps' own component CSS
  are a real, separate cleanup opportunity, likely best scoped the way the
  original base-ui rollout was (heuristic mapping + review), not folded into
  this one.
- `tests/base-ui-rollout.test.mjs`'s two pre-existing failures (app count,
  `kelly-followups` colour-scheme) are still unfixed; still someone else's
  follow-up per `#156`.
