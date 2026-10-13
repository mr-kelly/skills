---
title: 2026-10-13 Add kelly-dog-walk (遛狗不淋雨), the self-evolving agent lesson
---

# Add kelly-dog-walk (遛狗不淋雨)

Date: 2026-10-13
Author: AI Assistant
AI Agent: Claude

## Prompts & Instructions

**Original Request:**
> Build a new skill, `kelly-dog-walk` (遛狗不淋雨), the demo for 风变第二期第 10 节《打造自我进化的 Agent》.
> An agent can only self-evolve if it has a trustworthy judge. What evolves is a playbook, not the model;
> the agent may only propose playbook changes as Busabase ChangeRequests, a human merges them, and
> permissions are the gate. Reproduce the brief's real Shanghai 2026 replay numbers from real Open-Meteo data.

**Refined Instructions:**
- Port the course's `walk-story.py` rules faithfully into one shared, pure module used by the scripts and the AirApp.
- Ship a Busabase template: folder 遛狗不淋雨 with the 遛狗手册 Skill (v1 with a parseable 规则卡), the
  裁判规则 Doc (v1 with a parseable threshold block), the 每天的决定 and 天气数据 Bases, and a read-only AirApp.
- Trusted scripts for weather, replay (with same-month control), daily mode, proposals and setup; recorded
  Open-Meteo fixtures so the numbers are pinned offline.
- Never write the playbook directly, never edit the judge, never write to the operator's real Space.

## What Changed

- `skills/kelly-dog-walk/`: SKILL.md (Chinese operating procedure: setup and permissions, daily mode, replay,
  monthly review, proposal, rollback, Goodhart), the template sidecars, playbook v1–v4 and judge v1/v2 texts,
  recorded Open-Meteo fixtures for Shanghai May–September 2026 (hours 6–22), and the scripts
  `weather.mjs`, `replay.mjs`, `today.mjs`, `propose.mjs`, `setup.mjs`, `sync-content.mjs`,
  `build-demo.mjs`, `publish_airapp.mjs`.
- `content/kelly-dog-walk-app/`: the read-only 遛狗日历 AirApp — month calendar with verdicts, per-month
  summary, playbook version timeline, and a "still on v1" control chart; `?demo=1` replays the real
  Shanghai June–September story; zh/en chrome; editorial `ink-paper` / `desk`.
- `tests/app-skills/kelly-dog-walk/`: numbers pinned to the fixtures, template contract, local server,
  browser UI at desktop and phone, and a real local Busabase round trip.
- README tables and galleries, the generated site, and the root test chain include the new skill.
- `scripts/capture-app-screenshots.mjs`: route overrides for the new skill's screenshots.
- `tests/base-ui-rollout.test.mjs`: the AirApp count is now 73 (it was already 72 on main against an assertion of 71).
- `AGENTS.md`: `open-meteo` added to the surfaces in use.

## Why

The lesson needs a demo whose judge cannot be argued with (did it rain at that hour) and whose failure
mode is visible: a rule that wins on the only metric the judge counts (淋雨) while walking the dog in
working hours and at a scorching noon. Every number the lecture quotes is reproduced from real weather.

## Files Affected

- `skills/kelly-dog-walk/**` — the new skill, template and AirApp.
- `tests/app-skills/kelly-dog-walk/**` — tests.
- `README.md`, `docs/README-zh-CN.md`, `docs/index.html`, `docs/s/kelly-dog-walk.html`, `docs/sitemap.xml` — listings.
- `package.json` — `test:app-skills:oss:kelly-dog-walk`, chained into `test:app-skills:oss`.
- `scripts/capture-app-screenshots.mjs`, `tests/base-ui-rollout.test.mjs`, `AGENTS.md`.

## Breaking Changes

None.

## Testing

- `npm run test:app-skills:oss:kelly-dog-walk`: app checks and unit tests, contract/replay/local-server node
  tests, and `ui_test.py` (demo UI at 1440×900, 390×844, 360×740; then a throwaway local Busabase 0.95.1:
  template install, setup, weather and replay writes, three ChangeRequests that stay pending until the
  test merges them as the human, a forged playbook that deletes a retired rule is refused, live AirApp).
- Live Open-Meteo: Shanghai June–September replayed from the API matches the brief and the fixtures
  (0 of 2,601 hour-cells differ). Beijing replays too.
- `npm run lint`, `npm run typecheck`, `node scripts/build-site.mjs`, `gh skill publish --dry-run`.

## Follow-up Tasks

- No Cloud OAuth suite yet (`test:app-skills:cloud:kelly-dog-walk`); the member-account permission gate
  (限制访问 + 可提交变更) was not exercised — OSS Busabase has a single local user.
- Pre-existing on main, not touched here: kelly-wechat-content's editorial.css is stale and its base-ui.css
  path fails `tests/base-ui-rollout.test.mjs` / `tests/editorial-rollout.test.mjs`.
