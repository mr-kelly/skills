---
name: kelly-standup
license: MIT
description: Team standup board App-in-Skill for team leads. Use when the user invokes $kelly-standup or /kelly-standup, or asks for standup, daily standup, 晨会, daily check-in, team status board, 团队日报, blockers, who's working on what, team digest, check-in streaks, missing check-in reminders, or collecting async updates from Slack/WeCom/Discord/WhatsApp/docs into one board.
---

# Kelly Standup

## Overview

Use this skill as Kelly's team standup desk: see at a glance what everyone is working on each day. Team members post async updates wherever they already talk — Slack, WeCom, Discord, WhatsApp, a shared doc, or pasted text; the agent collects and parses them into structured updates (yesterday / today / blockers / mood), writes them into the local snapshot, and drafts a team digest. The local App-in-Skill board shows today's per-member cards, participation, the blocker list, past days, and a reminder review queue for chasing missing check-ins. The demo persona is an 8-person product team ("Nimbus team"), but the flow fits any team lead running async standups.

There is deliberately **no scheduling or cron inside this skill**. It is invoked on demand: when the user asks for standup, the agent collects whatever updates exist at that moment, ingests them, and opens the board. Recurring behavior belongs to the user's own habits or external schedulers, never to this skill.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, collect and ingest the latest updates, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; then present the board as text and reminders as numbered items (`Reminder #1`) directly in the conversation.

## Boundary

- The skill may read team-consented channels only (kelly-messenger snapshots, chat exports the user provides, shared docs, pasted text), parse them locally, write local handoff files, and draft digests and reminders.
- Collection parses only what the team has agreed to share for standup. Store the minimum: structured items plus a short `raw_excerpt` for provenance — never whole chat logs, and no member PII beyond name/role/timezone/channel that the team shares.
- The app reads and writes local files only. It never sends messages, calls webhooks, or touches any network beyond `127.0.0.1`.
- Reminders (nudges for missing check-ins, blocker escalations) are approval-required: the agent drafts them, the human approves in the app, and sending happens outside the app via kelly-messenger / kelly-email. Member contacts live only in env vars referenced by `contact_env` in private config.
- Do not commit `config.local.json`, env files, `app/.data/`, chat exports, or member contact details.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before collecting real updates.

Private config priority:

1. `KELLY_STANDUP_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-standup/config.local.json`
3. `~/.config/kelly-standup/config.json`
4. `skills/kelly-standup/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_STANDUP_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-standup/.env.local`
5. `~/.config/kelly-standup/.env`

Onboarding asks, turn by turn, for: team profile (name, timezone, workdays), members (name, role, timezone, and which channel each posts standups in, plus which env var holds their contact for reminders), the standup questions (default: yesterday / today / blockers), and digest style. Never ask the user to paste contact values or secrets into chat; they belong only in local env files, referenced by `contact_env` names.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the board with:

```bash
skills/kelly-standup/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring ports `3000` through `4000` (reusing a port only when `/api/state` proves it is the same app, `app: "kelly-standup"`), or `KELLY_STANDUP_UI_PORT` when set. Always report the URL the launcher prints.

Required app views (hash routes):

- `#/today` (default): today's board — human-attention panel (missing check-ins, open blockers, reminders awaiting approval), the agent-written team digest paragraph, participation stat (e.g. `6/8 submitted`) with an inline bar, then per-member cards: avatar initial, name + role, submitted time + source badge, Yesterday / Today / Blockers sections (blockers highlighted by severity), mood dot. Missing members get a visually distinct "not submitted" card with their last check-in date and a link to the drafted reminder; on-leave members get an on-leave card.
- `#/members` and `#/members/<id>`: roster — name, role, timezone, channel, check-in streak, 30-day participation, open blocker count, last submission. Detail shows a day-by-day timeline of recent updates, the member's open blockers, and notes.
- `#/blockers`: all blockers across the team — severity badge, owner, raised date, age, status (`open`/`resolved`, filterable), the linked day, and the agent-suggested next action per blocker.
- `#/reminders`: the review queue with workflow states `needs_review / changes_requested / approved / done / blocked`. Each card shows the stable ref (`Reminder #1`), type badge (missing check-in / blocker escalation), target member, channel badge, the reason, an editable message draft, a `Review note`, and approve / request changes / block buttons. Approved items are executed by the agent outside the app via kelly-messenger / kelly-email.
- `#/history` and `#/history/<date>`: recent days with an inline-SVG participation bar and one-line digest; selecting a date shows that day's full board (same card layout as today).
- `#/settings`: sanitized config — team profile, members with `contact_env` readiness booleans, standup questions, workdays, digest style, data provider, and onboarding state. Never expose contact values or secrets.

Demo mode:

- `?demo=today`, `?demo=members`, `?demo=blockers`, `?demo=history`, and `?demo=detail` (a member's update timeline) select named mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language; with `lang=zh` the demo content itself (中文姓名、角色、日报内容、阻塞、摘要、提醒草稿) is meaningfully localized for Chinese screenshots.
- Deep links such as `/?demo=today&lang=zh#/today` must work.
- Demo API responses never read or write `app/.data/` or private config; demo decisions stay in the browser tab.

UI language: English and Chinese chrome with `Auto` default (browser language), plus an explicit selector persisted locally. Keep real member names and update content in their original language.

## File Contract

Read `references/standup-schema.md` before editing the app, scripts, or any generated JSON.

Primary local files (all under `app/.data/`, gitignored):

- `standup_snapshot.json`: canonical snapshot — `team{}`, `members[]`, `days[]` (each with `date`, `digest`, `updates[]`, participation), `blockers[]`, `reminders[]`, `metrics`, `sync_log[]`, `warnings[]`.
- `decisions.json`: user verdicts on reminders keyed by id.
- `agent_tasks.json`: queued agent work — `revise_reminder` entries created by `request_changes`. Poll this to pick up revisions, re-draft, and re-ingest so the item returns to `needs_review`.
- `execution_report.json`: latest dry-run/apply plan from `scripts/execute_decisions.mjs`.
- `onboarding.json`: onboarding completion marker.
- `agent.lock`: temporary lock while the skill is ingesting or executing. While it exists the app disables editing and `POST /api/decision` returns HTTP 423.

Use `node scripts/validate_ui_schema.mjs app/.data/standup_snapshot.json` before relying on a snapshot in the UI. The app shows an empty setup state when no snapshot exists.

## Collection Workflow

Invoked on demand — there is NO cron and NO scheduler in this skill. Each run:

1. Ask where today's updates live (or use what the user already provided): the kelly-messenger local snapshot, a Slack/WeCom/Discord/WhatsApp export, a shared doc, or text pasted into chat. Raw material stays outside git.
2. Parsing is LLM work: split the raw material into one update per member, mapped to the configured `member_id`s — `yesterday[]`, `today[]`, `blockers[]` (each with severity, and `status: "resolved"` when a member says a previous blocker is cleared), optional `mood`, `submitted_at`, `source`, and a short `raw_excerpt`. Note members on leave in `on_leave[]`.
3. Write the digest: a short agent-written paragraph summarizing the day (what shipped, what is blocked, who is missing), included as `digest` in the payload.
4. Draft reminders for missing check-ins or aging high blockers as `reminders[]` payload items (`needs_review`). Drafting is agent work; sending is not — see the reminder workflow.
5. Merge deterministically with `node scripts/ingest_updates.mjs <payload.json>`. The script validates against config, upserts by member + date (re-ingesting is idempotent), dedupes blockers by content hash and applies resolve transitions, upserts reminders with stable refs, recomputes participation/streaks/metrics, and appends `sync_log`. It refuses to run while `agent.lock` exists and takes the lock while writing.
6. Validate, then start/reuse the app and send the user to `#/today` with the actual URL.

## Reminder Workflow

1. The user reviews drafted reminders in `#/reminders` and decides via `POST /api/decision` (`approve` / `request_changes` / `revise` / `block`), persisted in `decisions.json`.
2. Poll `agent_tasks.json`: for `revise_reminder`, re-draft the message per the review note and re-ingest so the item returns to `needs_review`.
3. After approvals, run `node scripts/execute_decisions.mjs` (dry-run) and show the plan; with user confirmation run `--apply`, then send the actual messages via kelly-messenger / kelly-email using the `contact_env` referenced contacts, and record outcomes back into the report. The app and scripts themselves never send anything.
4. Re-read `decisions.json` immediately before executing, and never send reminders that are not `approved`.

## Safety Defaults

- Treat every outbound nudge as approval-required, human-visible communication: friendly tone, no shaming, no manager-speak the user did not approve.
- Store only structured updates and short excerpts; keep raw exports outside git.
- Expose only env-var readiness booleans for member contacts in UI state, logs, and reports.
- Keep merges idempotent: stable member ids, blocker hashes, reminder ids/refs, so repeated ingests do not duplicate work.
- If the UI and schema disagree, stop and fix the schema or UI before executing anything.
