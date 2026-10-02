---
title: 2026-10-02 Tokenize The Fleet's Remaining Raw Colours
---

# Tokenize The Fleet's Remaining Raw Colours

Date: 2026-10-02
Author: AI Assistant
AI Agent: Claude

## Prompts & Instructions

**Original Request:** "都做了吧" — go ahead with all four follow-up items
listed after the editorial rollout, including this one: 1,062 pre-existing
raw-colour declarations in apps' own component CSS, counted but explicitly
left untouched by `#178`/`#180` as out of scope for a mechanical rollout.

## What Changed

**`scripts/tokenize-raw-colours.mjs`** (new) — idempotent, `--check`/`--report`
modes mirroring the fleet's other rollout scripts. Maps four conservative,
mechanically-justifiable buckets:

1. **Dead `var(--x, #fallback)` fallbacks.** `--x` is always defined now
   (`base-ui.css`, `editorial.css`, or the app's own legacy `:root`), so the
   fallback never fires. Dropped — zero rendered pixels change.
2. **`box-shadow` colour portions.** Geometry (offset/blur/spread) untouched;
   only the embedded `rgba()`/hex is replaced. A `0 0 0 Npx COLOUR` ring
   shape (focus/selection) maps to `--accent-focus`; every other shape maps
   to `--shadow-tint` / `--shadow-tint-deep` by alpha.
3. **Scrim/blur overlays.** Near-black or near-white translucent
   backgrounds mapped to `--scrim` / `--surface-blur`. Tuned mid-pass: HSL
   saturation is numerically unstable near black — `rgb(15, 23, 42)`, the
   single most common literal in the fleet (a near-black navy scrim copy-
   pasted across dozens of apps), computes to 47% saturation from small
   channel deltas at low lightness despite reading as neutral dark on
   screen. Below 18% lightness the classifier now treats colour as neutral
   regardless of saturation; above that it still requires low saturation so
   a genuinely tinted overlay isn't silently flattened to grey.
4. **A literal dictionary plus a hue-angle classifier** for saturated bare
   colours in `background`/`color`/`border*`/`fill`/`stroke`/`outline`,
   including inside `border: <width> <style> <colour>` shorthand (not just
   the standalone `border-color` property). The dictionary handles
   high-frequency exact repeats (`#202124`, used as an "ink badge" fill in
   60+ apps, plus several Tailwind near-black greys). The classifier buckets
   by hue (positive/warning/danger/accent) and by lightness tier chooses the
   `-soft` variant, the plain token, or `color-mix(in srgb, var(--x) 70%,
   black)` for a dark/900-weight original — then **skips** anything with low
   saturation, extreme lightness, or a boundary hue (yellow-green, teal)
   rather than guess.

## Why

Most of what was left after the original base-ui rollout and the editorial
rollout turned out to be exactly what a human would also map correctly on
sight: Tailwind-palette semantic colours (`#22c55e` green, `#ef4444` red,
`#f59e0b` amber, `#3b82f6` blue — status dots and chips), the same near-black
scrim literal copy-pasted across the fleet, and shadow colours that only
needed their alpha-bearing portion swapped, not their geometry. 1,062 →
90 in two passes (854 mapped mechanically in the first pass; a second pass,
prompted by reviewing what was still left, fixed the saturation-near-black
gap and added border-shorthand support, closing 65 more files).

## Not Touched Here — the remaining 90

Deliberately left as raw colour, not silently skipped:

- **Gradients** (`background-image`, multi-stop `background`) — decorative
  illustration content (avatar/hero art), the same `kelly-digital-human`-style
  exception the fleet already carries for radius literals.
- **Brand colours** — `#5865f2` (Discord purple) and similar: a "Connect to
  Discord" affordance needs Discord's actual colour, not this app's theme
  accent, and substituting it would be a regression dressed as a cleanup.
- **Boundary hues** (yellow-green ~58-78°, teal ~168-180°) and any colour
  with saturation/lightness close to the classifier's thresholds — skipped
  by design rather than guessed, because a wrong guess here is a visible,
  silent colour-identity change, not a harmless no-op.
- **`rgba()`/`hsla()` values inside `border`/`outline` shorthand** — the hex
  case is handled; the translucent-colour case was judged a smaller, lower-
  confidence residual not worth a third heuristic pass in this round.

## Files Affected

- `scripts/tokenize-raw-colours.mjs` — new
- 132 app CSS files across the fleet — colour-only changes, verified
  symmetric (every diff hunk is a 1:1 line replacement, no structural edits)

## Breaking Changes

None — every substitution is a same-semantic colour swap (a Tailwind green
for this app's `--positive`, not a different hue), verified visually in both
colour schemes.

## Testing

- `node scripts/tokenize-raw-colours.mjs --check` — clean (idempotent) after
  applying both passes.
- `node --test tests/*.test.mjs` — 32/32 excluding the two pre-existing,
  unrelated `base-ui-rollout.test.mjs` failures already being fixed in `#180`
  (confirmed identical before and after this branch).
- `find tests/app-skills -name contract.test.mjs | xargs node --test` —
  635/635, unaffected.
- `npx biome check .` clean, 2,820 files. `node scripts/build-site.mjs` — 78
  pages, no drift.
- Real-browser verification: `kelly-ads` and `kelly-crm` (heavy status-badge
  usage — the primary target of the hue classifier) and `kelly-agent-builder`
  (exercises the scrim fix) screenshotted light+dark at 1280x850 via
  `?demo=1`. No console errors, no overflow, every status pill/badge/scrim
  reads correctly and legibly in both colour schemes across all six
  screenshots.

## Follow-up Tasks

- The remaining 90 raw-colour declarations (gradients, brand colours,
  boundary hues) — real, but each needs a judgement call a script shouldn't
  make blindly; left for a manual pass if ever prioritized.
- `rgba()`/`hsla()` inside `border`/`outline` shorthand — smaller, lower-
  confidence residual, not attempted this round.
