---
title: 2026-10-02 Move WeChat Templates and Add Template Media to the Skills Site
---

# WeChat Templates and Template Media

Date: 2026-10-02
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> Move China-specific scenarios such as WeChat CRM and WeChat public-account content to mr-kelly/skills, and make that repository's website display Busabase template covers and videos. Commit after green verification.

**Refined Instructions:**
- Keep the existing Kelly WeChat CRM package as the destination; verify its six demo datasets match the Busabase template before removing the duplicate there.
- Preserve its real demo recording, generate a current cover, and bring across resource-specific Agent prompts.
- Read cover and optional video paths from `busabase.json`; show them before the README screenshot gallery without breaking older site recordings.
- Verify real installation, browser use, media playback, catalog generation and published screenshot evidence.

## What Changed

- The Kelly WeChat CRM template now has a generated cover, a playable demo clip and resource-specific prompts for its Folder, six Bases and AirApp.
- The skills site displays declared template cover first, optional video second and the remaining bilingual screenshots after that.
- README galleries describe every declared screenshot in English and Chinese; the WeChat public-account content template remains in this repository.
- The separate Busabase templates repository removes its duplicate WeChat CRM entry and regenerates its catalog.

## Why

The regional WeChat scenarios belong with Kelly's skills and should remain installable and inspectable after leaving the general Busabase template catalog.

## Files Affected

- `skills/kelly-wechat-crm/` - Cover, recording, prompts and generated Base sidecars.
- `skills/kelly-wechat-content/` - Verified public-account content example and evidence.
- `scripts/build-site.mjs` and `tests/site/template-media.test.mjs` - Manifest-driven gallery and regression coverage.
- `README.md`, `docs/README-zh-CN.md`, `docs/` - Bilingual captions and generated pages.
- `.gitattributes` - Git LFS tracking for skill recordings.
- `.github/workflows/ci.yml` - Stage template recordings with screenshots for GitHub Pages.
- `.github/workflows/ci.yml` - Run the gallery regression test on pull requests.
- `skills/kelly-wechat-content/pnpm-workspace.yaml` and its AirApp counterpart - Declare the pinned SDK version for the repository's dependency audit.

## Breaking Changes

None to installed Kelly apps. The generic Busabase template catalog no longer lists `busa-wechat-crm` after its separate PR merges.

## Testing

- Both Kelly templates pass `busabase-cli check` with zero warnings and cover validation.
- The public-account template was installed twice locally; real records, relations, native views, images and browser workflows passed.
- Website Playwright verified cover cards, CRM video playback and keyboard close, Chinese text, mobile layout and older recording pages.
- Three gallery regression tests, five content-app domain tests, scoped typecheck and full-repository lint pass.
- Full-repository TypeScript checking and lint pass after integrating the latest main branch.
