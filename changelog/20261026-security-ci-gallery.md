---
title: 2026-10-26 Security CI and gallery delivery
---

# Security CI and gallery delivery

Date: 2026-10-26
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> Record a Kelly Security walkthrough using busabase-template-video, fix the CI errors after
> the skill was merged, and complete its gallery screenshots and website entry.

**Refined Instructions:**
- Restore the repository's SDK dependency policy for both locked Security projects.
- Record the real application with synthetic, non-sensitive data and document that provenance.
- Cover every primary workflow view, add a cover and complete screenshot gallery, and verify the site.

## What Changed

- Declare the exact `busabase-sdk@0.99.1` release-age exclusion in the skill and AirApp workspaces.
- Fetch Git LFS objects in the test job so package/media checks read real screenshot bytes rather
  than pointer files, matching the Pages deployment checkout.
- Add a 22-second, 1440×900 silent H.264 walkthrough covering all six primary workflow views.
- Generate English and Chinese covers from real application captures, and include seven workflow/
  phone screenshots with thumbnails and meaningful bilingual captions.
- Update the template manifest, skill READMEs, root gallery and generated website. The detail page
  orders cover → playable walkthrough → screenshots, and the homepage uses the new cover.
- Add a website regression test for Security's complete gallery and lazy video player.

## Why

The merge failed the repository SDK policy audit, blocking Pages deployment. The original short
review clip and two README shots did not explain the full multi-server investigation workflow.

## Files Affected

- `skills/kelly-security/pnpm-workspace.yaml` — exact SDK policy declaration.
- `skills/kelly-security/content/kelly-security-app/pnpm-workspace.yaml` — same declaration for the app.
- Security media, manifests, READMEs and generated site — walkthrough and complete gallery.

## Breaking Changes

None.

## Testing

- Repository SDK and hosted-runtime policy audits pass after the configuration correction.
- Video: 22.267 seconds, H.264, 1440×900, 30fps, yuv420p, TV color range, 713,024 bytes, no audio.
- Both generated covers pass structural validation; strict four-layer package validation passes.
- The staged website passes its asset check: 85 pages, 663 local images and 7 local videos.
- Browser acceptance loaded all eight gallery images, played the entire video, checked the homepage
  cover and verified the 390px page has no horizontal overflow or page errors.
- Root lint/typecheck, both repository policy audits, Security package/app checks and six contract
  tests pass. Nine website/media validator tests pass.
