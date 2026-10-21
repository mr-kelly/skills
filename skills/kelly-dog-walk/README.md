# Kelly Dog Walk — 遛狗不淋雨

An agent decides every day which hour to walk the dog, and **real weather is the judge**: did it
rain at that hour. It is the demo for 风变第二期第 10 节《打造自我进化的 Agent》, and it teaches one
thing: an agent can only improve itself if it has a judge it cannot fool.

What evolves is not the model but a **playbook** (遛狗手册, a Busabase Skill node). The agent may only
*propose* a playbook change, as a Busabase ChangeRequest; a person merges it. The merge is the gate:
proposals are always submitted with `autoMerge: false`, so they wait for review even when the agent
runs on the owner's own account — which is what an integration like Buda connects with. Give the agent
its own member account and the server enforces it too: **可提交变更** on the playbook, **只读** on the
judge (裁判规则, a Doc), and **可写入** on its two Bases. Owners and admins bypass 限制访问, so those
grants only bind a member account.

## What It Shows

- **Calendar**: one cell per day with the chosen hour and the verdict — 没淋 / 淋雨 / 太热 / 不方便 —
  the month's counts, the rule sentence behind any day, and a control chart: the playbook that was in
  force versus "still on v1" on the same weather.
- **Playbook timeline**: v1 → v4 read from the playbook's own 版本记录 and 已退休 sections — what each
  version changed and why, the month it was in force, the retired rule, a proposal that was closed, and
  the moment the owner changed the judge.
- **Read-only**: there is no approve button. Approval happens in Busabase, on the ChangeRequest.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/calendar.webp" alt="Dog-walk calendar for July 2026"></td>
    <td width="50%"><img src="assets/screenshots/timeline.webp" alt="Playbook timeline v1 to v4"></td>
  </tr>
  <tr>
    <td><strong>Calendar</strong><br>July 2026 under playbook v2: 5 wet walks against 9 if it had stayed on v1, and 15 hot evenings the judge v1 does not count.</td>
    <td><strong>Playbook timeline</strong><br>Four versions on real Shanghai weather: the bad rule that won on rain alone, its retirement, and the judge's guardrails.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/calendar-zh-CN.webp" alt="遛狗日历 2026 年 7 月"></td>
    <td width="50%"><img src="assets/screenshots/mobile-month-zh-CN.webp" alt="遛狗日历手机版 2026 年 8 月"></td>
  </tr>
  <tr>
    <td><strong>遛狗日历</strong><br>中文界面，适合投影：每格一个钟点、一个结论。</td>
    <td><strong>手机版</strong><br>8 月用了坏规则 v3：只淋 2 次雨，但 14 天不在方便时段（早上 6 点、晚上 10 点、上班时间）。</td>
  </tr>
</table>

A recorded walkthrough (87 s, Chinese) runs the whole loop on a real local Busabase: replay June, the
agent's ChangeRequest approved and merged, July's "driest hour of the whole day" rule merged on rain
alone, August's hot and out-of-hours walks, the owner editing the judge, the rollback merged, and the
playbook timeline from v1 to v4. It is at
[`docs/demo-recordings/kelly-dog-walk/kelly-dog-walk-demo-zh-CN.mp4`](../../docs/demo-recordings/kelly-dog-walk/kelly-dog-walk-demo-zh-CN.mp4).

## The Course Data — Shanghai 2026, Four Reviews

Recorded once from the live Open-Meteo API (`references/open-meteo/`), replayed offline:

| Month | Playbook in force | Wet | Hot | Off-hours | Still on v1 |
| --- | --- | --- | --- | --- | --- |
| June | v1 — walk at 6 pm | 7/30 | 0 | 0 | 7 / 0 / 0 |
| July | v2 — switch hours when 6 pm rain chance ≥ 50% | 5/31 | 15 | 0 | 9 / 15 / 0 |
| August | v3 — the whole day, driest hour (bad rule) | 2/31 | 5 | 14 | 5 / 3 / 0 |
| September | v4 — roll back v3, skip hours forecast ≥ 32°C | 3/30 | 0 | 0 | 6 / 0 / 0 |

```bash
node skills/kelly-dog-walk/scripts/replay.mjs --city 上海 --month 2026-06 --month 2026-05 \
  --playbook v1 --compare v2 --source fixtures
```

## Run It

```bash
npx busabase-cli@latest install skills/kelly-dog-walk          # the owner installs the template
node skills/kelly-dog-walk/scripts/setup.mjs --apply            # folder name, judge stamp, calendar + kanban
node skills/kelly-dog-walk/scripts/today.mjs --city 上海 --write # daily: decide today, judge yesterday
node skills/kelly-dog-walk/scripts/propose.mjs --file new.md --city 上海 --month 2026-07 --month 2026-06
pnpm --dir skills/kelly-dog-walk/content/kelly-dog-walk-app dev  # local preview; open /?demo=1
```

`SKILL.md` is the agent's operating procedure (in Chinese): setup and permissions, daily mode, replay,
monthly review, proposals, rollback, and why the guardrails exist.

## Boundary

Writes only its own two Bases. Reads Open-Meteo (public, keyless) and its own nodes. Never writes the
playbook (only proposes), never edits the judge, never merges a ChangeRequest, and never counts text
from a web page as evidence — only the judge's data.
