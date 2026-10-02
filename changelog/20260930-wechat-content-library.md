---
title: 2026-09-30 WeChat Content Library Template
---

# WeChat Content Library Template

Date: 2026-09-30
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> Build the forum's content-library scenario as an installable example with demo data,
> tables, board/calendar views and real screenshots. Add it to mr-kelly/skills and
> follow the busabase-template-creator publishing standard.

**Refined Instructions:**
- Keep source material and article planning in two linked business Bases.
- Include a read-only AirApp, a manual, node-specific prompts and realistic sample records.
- Verify the same resources and relations in an isolated local Busabase instance.
- Capture the real workflow, then generate the catalog cover from the final screenshot.

## What Changed

- Added the kelly-wechat-content template, with 8 sources and 10 linked article records.
- Added table, source-check and review views in the package, plus scoped setup for native
  gallery, kanban and calendar views that the current package format cannot serialize.
- Added source/article browsing, search, filters, board, calendar and linked detail pages.
- Added an editorial guide, portable asset Drive and specific agent scenarios.
- Registered the skill in the repository's bilingual catalog.
- Removed the fixed AirApp port after a restart exposed a conflict with another
  local instance; the local runner now assigns an available port.

## Why

The example turns the advice to split reusable materials from article schedules into a
working installation that editors and agents can inspect together.

## Files Affected

- `skills/kelly-wechat-content/` - Template resources, manual, app, tests and gallery.
- `README.md` and `docs/README-zh-CN.md` - New catalog entry.
- `docs/` - Generated catalog output; the aggregate marketplace already covers the skills directory.

## Breaking Changes

None.

## Testing

- Template check: 0 errors and 0 warnings; cover validation passed.
- Installed twice into an isolated local workspace; both instances had 8 sources,
  10 articles and valid relation targets. All eight Drive images downloaded.
- Native-view setup remained idempotent; installed AirApps read their own folders.
- Playwright exercised search, combined filters, native links and the real SDK
  workflow at desktop and phone viewports, with no page errors or overflow.
- Scoped TypeScript and five app domain tests passed. Root typecheck has unrelated
  unresolved packages; see `skills/kelly-wechat-content/references/verification.md`.
