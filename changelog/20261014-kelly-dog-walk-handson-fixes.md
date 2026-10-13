---
title: 2026-10-14 kelly-dog-walk — calendar cards, playbook attribution, readable evidence
---

# kelly-dog-walk: four fixes found by a hands-on run

Date: 2026-10-14
Author: AI Assistant
AI Agent: Claude

## Prompts & Instructions

**Original Request:**
> Reproduce the hands-on part of 风变第二期第 10 节 for real, on a throwaway local Busabase (0.95.1),
> as a student following the tutorial, and capture screenshots and exact steps. Fix real skill bugs
> on `feat/kelly-dog-walk` and re-run the skill's test entry.

**Refined Instructions:**
- Only fix what stops a lesson step from working on the pinned Busabase; report the rest.

## What Changed

- **每天的决定 has a first field 摘要 (`summary`, e.g. `18 点 · 淋雨`).** Busabase's calendar and kanban
  cards show only the record title, which is the lowest-position field. The title used to be 日期, so
  the 遛狗日历 calendar view showed each day's own date and nothing else, and the lesson's "切到日历
  视图，7 天淋雨" could not be seen. `decisionFields` writes it; `today.mjs` rewrites it when it judges
  yesterday.
- **Decisions made from the Busabase 遛狗手册 cite it.** `replay.mjs --write` and `today.mjs --write` now
  write 每天的决定 through a client that sends `x-busabase-playbook: skill:<遛狗手册>`. Busabase records
  it on the ChangeRequest (shown as 通过做事手册「遛狗手册」 in review) and counts it on the 做事手册
  page, which otherwise said 近 30 天没有智能体使用过 forever. Replays of a course version or a local
  file cite nothing.
- **Proposal evidence is one sentence per month, not a Markdown table.** The review page shows the
  ChangeRequest message as plain text with line breaks collapsed, so the table read as one run of pipes.

- **SKILL.md says to install the scripts' dependency first.** A skill installed from GitHub
  (`npx skills add mr-kelly/skills --skill kelly-dog-walk`) has no `node_modules`, and every script then
  fails with `Cannot find package 'busabase-sdk'`. Step 0 of 安装 and the cheat sheet now say
  `npm install --prefix <skill dir> --no-package-lock` (no lockfile, so a later template install does not upload one).

## Files Affected

- `skills/kelly-dog-walk/content/kelly-dog-walk-app/app/js/config.js`, `view-model.js` — 摘要 field and `decisionSummary`
- `skills/kelly-dog-walk/content/decisions/base.json`, `app/demo-data.json` — regenerated
- `skills/kelly-dog-walk/scripts/lib/busabase.mjs` — `connect({ playbook })`, `playbookClient`
- `skills/kelly-dog-walk/scripts/replay.mjs`, `today.mjs`, `propose.mjs`
- `skills/kelly-dog-walk/SKILL.md`, `references/dog-walk-schema.md`
- `tests/app-skills/kelly-dog-walk/ui_test.py`, `busabase_probe.mjs` — assert 摘要 and the playbook citation

## Breaking Changes

- None for users: the template is not released yet. An existing install made before this change has no
  摘要 field; reinstall the template.

## Testing

- `npm run test:app-skills:oss:kelly-dog-walk`: 20/20 node tests, demo UI and the local Busabase round
  trip pass; the round trip now also checks every row's 摘要 and that the replay's ChangeRequest cites
  遛狗手册.
