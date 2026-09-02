---
title: 2026-09-02 AirApp UI Retrofit
---

# AirApp UI Retrofit

Date: 2026-09-02
Author: AI Assistant
AI Agent: OpenAI Codex

## Request

Upgrade every existing App-in-Skill UI to the shared AirApp visual baseline without changing its
DOM, JavaScript, workflow, or product-specific identity.

## What Changed

- Added one shared, dark-mode-ready Base UI asset and an idempotent rollout script.
- Rolled the asset out to all 70 current Kelly AirApps, including the concurrently merged Kelly Ideas app.
- Mapped hardcoded font sizes to the eight-step type scale and component radii to three tokens.
- Mapped legacy light surfaces and compound grid backgrounds to theme-aware color tokens.
- Prevented demo media from colliding with phone work surfaces while keeping desktop evidence visible.
- Preserved semantic square edges, circles, pills, and the digital-human illustration contours.
- Added regression coverage for asset hashes, cascade order, color-scheme metadata, layers, tokens,
  overflow, text clipping, dark surfaces, text contrast, and work-surface overlap.

## Verification

- `node scripts/apply-base-ui-rollout.mjs --check`
- `node --test tests/base-ui-rollout.test.mjs`
- All 70 apps' existing `pnpm check` commands passed.
- `npm run typecheck` passed with the repository's installed skill dependencies linked into the
  isolated worktree.
- Biome passed for all 292 files changed by this rollout. The full repository lint still reports
  eight pre-existing formatting/import-order errors in the concurrently merged Kelly Ideas
  business JavaScript; this rollout changes only that app's CSS.
- Captured 280 before and 280 after screenshots, plus 70 before/after contact sheets.
- Light/dark desktop/mobile browser matrix passed for every app with assertions for horizontal
  overflow, clipped controls, sticky surfaces, bright dark-mode surfaces, text contrast below 3:1,
  and overlapping work regions.

## Breaking Changes

None. Existing app CSS deliberately remains later in the cascade and keeps ownership of product-specific layout.
