# Kelly Followups

Kelly Followups is a Busabase-backed App-in-Skill that does one thing: after
a meeting, record who you need to follow up with; open the app any morning
and see today's list; mark each one done.

## What It Shows

- Today: everything pending and due today or overdue — the screen you check
  every morning.
- All: every followup, pending and done.
- Marking an item done removes it from "Today" immediately.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/today.webp" alt="Kelly Followups today view"></td>
  </tr>
</table>

## Origin

This skill is a worked example of the `$kelly-ideas` → `$kelly-app-creator`
handoff. A real idea — "周会太多我总忘记谁该跟进" (too many weekly meetings,
can never remember who to follow up with) — was interrogated through
`$kelly-ideas`'s BRD → MRD → PRD ladder. The resulting PRD's own non-goals
(no full project management, no calendar sync, no notifications, no
per-user permissions) are exactly this app's scope. See `SKILL.md` for the
full non-goals list and why they are kept deliberately, not filled in over
time.

## Run It

```bash
cd content/kelly-followups-app
pnpm install
pnpm dev
```

Add `?demo=1` to see deterministic mock data without a Busabase connection:

```text
/?demo=1&lang=zh#/today
/?demo=1&lang=zh#/all
```

Demo mode never reads or writes Busabase.

## Data

All persistent data — followups — lives in one Busabase Base under the
`kelly-followups` Folder. See `SKILL.md` for the resource map. Connects with
`BUSABASE_BASE_URL` / `BUSABASE_API_KEY` / `BUSABASE_SPACE_ID`; performs no
external send, notification, or side effect outside the app itself.
