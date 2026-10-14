---
title: 2026-10-14 kelly-dog-walk — demo recording, and the August numbers told right
---

# kelly-dog-walk: a demo recording, and the August numbers told right

Date: 2026-10-14
Author: AI Assistant
AI Agent: Claude

## Prompts & Instructions

**Original Request:**
> 新 skill 的 demo 视频有了吗？ — 做

**Refined Instructions:**
- One Chinese recording at `docs/demo-recordings/kelly-dog-walk/kelly-dog-walk-demo-zh-CN.mp4` with a
  `.webp` poster, following `skills/kelly-app-skill-creator/references/demo-recording.md` and the
  kelly-support recording: a real local Busabase, real decisions, 1440×900, H.264, no audio.
- Tell the whole loop on one subject, the 遛狗手册, from v1 to v4.

## What Changed

- **New demo recording** (87 s, 3.4 MB) and poster. A fresh local Busabase 0.95.1 with the skill
  installed by `npx skills add`, the template, `setup.mjs --apply`, and Shanghai 2026 weather from
  Open-Meteo. Between shots the skill's own scripts ran exactly as SKILL.md has the agent run them
  (`weather.mjs`, `replay.mjs --write`, `replay.mjs --compare`, `propose.mjs`); every approval, merge
  and the judge edit was done in the Busabase UI. Shots:
  1. 遛狗手册 v1.
  2. June in the 遛狗日历 AirApp: 7 wet walks.
  3. The 19 June decision: forecast 100%, walked at 18:00 anyway.
  4. The agent's ChangeRequest with its evidence (7 → 3, May 3 → 1), approved and merged: v2.
  5. July's "driest hour of the whole day" proposal, which itself warns that 不方便 goes up, merged on
     rain alone: v3.
  6. August in the AirApp: red and brown cells.
  7. The judge edited by hand to v2 and saved.
  8. The rollback, approved and merged: v4.
  9. The playbook timeline, v1 to v4.

  Captions are a browser overlay added at capture time; the app itself is unchanged.
- **The August story now says what the data says.** Under v3, the 14 out-of-hours walks were 6 at
  6 am, 4 at 10 pm and 4 in working hours, and the 5 hot ones were at 33–37°C (10:00, 11:00, 15:00,
  18:00). "14 天遛在上班时间、5 天在正午烫脚" was wrong on both counts. Fixed in `SKILL.md`, `README.md`,
  `references/judge-rules-v2.md`, `references/playbooks/v4.md`, and `demo-data.json` (rebuilt with
  `scripts/build-demo.mjs`).
- README links the recording.

## Testing

- `ffprobe`: H.264, 1440×900, `yuv420p`, `color_range=tv`, 30 fps, no audio.
- Watched end to end via a frame every 2 s; every click lands, and every caption matches the screen.
- `node scripts/build-site.mjs` puts the recording card first on `docs/s/kelly-dog-walk.html`. The
  MP4 is LFS and the poster is a plain git object (`git check-attr`).
- `tests/pages-assets.test.mjs` passes. `tests/site-recordings.test.mjs` passes everything except
  "kelly-wechat-crm.html: has a video card but no recording", which fails the same way on a clean
  `main`.
- `npm run test:app-skills:oss:kelly-dog-walk` (18 + 20 tests), `node scripts/sync-content.mjs --check`,
  and `biome check skills/kelly-dog-walk` all pass.
