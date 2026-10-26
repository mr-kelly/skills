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
- Complete the Security gallery, walkthrough and website references in the accompanying changes.

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
- Media validation checks codec, dimensions, duration and actual route coverage.
- The final follow-up records the CI and staged website validation results.
