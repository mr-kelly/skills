# Kelly Standup Schema

Use this schema when reading or writing Kelly Standup's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`content/kelly-standup-app/app/js/providers/busabase-provider.js`, `content/kelly-standup-app/app/js/standup-model.js`).
Streaks, per-day participation, 30-day participation, and the missing-
today/open-blockers metrics are all computed client-side from these Bases on
every read — they are never stored.

Sources: `slack`, `wecom`, `discord`, `whatsapp`, `doc`, `manual`.
Moods: `good`, `ok`, `stuck` (or empty).
Severities: `high`, `medium`, `low`.
Blocker statuses: `open`, `resolved`.
Reminder types: `missing_checkin`, `blocker_escalation`.
Reminder channels: `slack`, `wecom`, `discord`, `whatsapp`, `email`.
Reminder statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.
Decision actions: `approve`, `request_changes`, `revise`, `block`.

## Members (`kelly-standup-members`)

The team roster.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `member-id` | `member_id` | text | stable local id, required |
| `name` | `name` | text | display name |
| `role` | `role` | text | e.g. `Engineer` |
| `timezone` | `timezone` | text | IANA timezone |
| `channel` | `channel` | text | `slack\|wecom\|discord\|whatsapp\|email\|doc` |
| `active` | `active` | text | `"true"\|"false"` |
| `contact-env` | `contact_env` | text | env var *name* holding this member's contact for reminders — never the value itself |
| `notes` | `notes` | longtext | optional per-member notes |

`streak`, `participation_30d`, `open_blockers`, and `last_submitted_date` are
never stored on this record — `recomputeDerived()` computes them from
`days`/`checkins`/`blockers` on every read.

## Days (`kelly-standup-days`)

One row per recorded standup day, unique by `date`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `date` | `date` | text | `YYYY-MM-DD`, required |
| `digest` | `digest` | longtext | agent-written summary paragraph for the day |
| `on-leave` | `on_leave` | longtext | JSON array of `member_id` |

`participation` (`submitted`/`expected`/`on_leave` counts) is derived, never
stored.

## Check-ins (`kelly-standup-checkins`)

One row per member per day; unique by `checkin-id` (`"<member_id>|<date>"`).
Re-ingesting the same member + date replaces the existing row (idempotent).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `checkin-id` | `checkin_id` | text | `"<member_id>|<date>"`, required |
| `member-id` | `member_id` | text | |
| `date` | `date` | text | `YYYY-MM-DD` |
| `yesterday` | `yesterday` | longtext | JSON array of strings |
| `today` | `today` | longtext | JSON array of strings |
| `blockers` | `blockers` | longtext | JSON array of `{blocker_id, text, severity, status}` — nested per-update snapshot, kept in sync with the `blockers` registry below |
| `mood` | `mood` | text | `good\|ok\|stuck` or empty |
| `submitted-at` | `submitted_at` | text | ISO timestamp |
| `source` | `source` | text | `slack\|wecom\|discord\|whatsapp\|doc\|manual` |
| `raw-excerpt` | `raw_excerpt` | longtext | short verbatim excerpt of the original message, provenance only — never a whole chat log |

## Blockers (`kelly-standup-blockers`)

The top-level registry, deduplicating blockers across days by content hash.
Unique by `blocker-id` (`"bl-<sha1(member|normalized text)[0:10]>"`). When an
ingested check-in carries the same blocker text with `status: "resolved"`,
the registry entry transitions to resolved with `resolved-date` set (and back
to open if a later day reports it open again).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `blocker-id` | `blocker_id` | text | `"bl-<sha1(member|text)[0:10]>"`, required |
| `member-id` | `member_id` | text | owner |
| `raised-date` | `raised_date` | text | `YYYY-MM-DD` |
| `severity` | `severity` | text | `high\|medium\|low` |
| `status` | `status` | text | `open\|resolved` |
| `text` | `text` | longtext | short description |
| `suggested-action` | `suggested_action` | longtext | agent-written advice for the team lead, not an executed action |
| `resolved-date` | `resolved_date` | text | `YYYY-MM-DD` or empty |

## Reminders (`kelly-standup-reminders`)

The review-queue: approval-gated nudges for missing check-ins and blocker
escalations. Unique by `reminder-id` (`"rem-<sha1(type|member|date)[0:10]>"`),
so re-drafting the same reminder on the same day updates it in place. `ref`
(`Reminder #N`) is assigned client-side by `created-at` ascending, never
stored.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `reminder-id` | `reminder_id` (`id`) | text | required |
| `type` | `type` | text | `missing_checkin\|blocker_escalation` |
| `member-id` | `member_id` | text | target member |
| `channel` | `channel` | text | `slack\|wecom\|discord\|whatsapp\|email` |
| `title` | `title` | text | short human title |
| `reason` | `reason` | longtext | why the agent drafted this |
| `draft` | `draft` | longtext | editable outbound message draft |
| `status` | `status` | text | workflow status |
| `created-at` | `created_at` | text | ISO timestamp |
| `revised-at` | `revised_at` | text | set by `scripts/ingest_updates.mjs` when a re-ingest changes title/reason/draft/channel |
| `decision-action` | `decision_action` | text | `approve\|request_changes\|revise\|block` |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent`, written by `scripts/execute_decisions.mjs` |
| `execution-operations` | `execution_operations` | longtext | JSON array, one `send_reminder` operation |
| `execution-detail` | `execution_detail` | longtext | human-readable plan detail |
| `executed-at` | `executed_at` | text | ISO timestamp of the last plan write |

`revise` (labeled "Save note" in the UI) never changes `status`; it only
updates `draft`/`decision-note`/`decided-at`. `approve`/`request_changes`/
`block` map to `status` `approved`/`changes_requested`/`blocked` via
`statusForAction()` in `standup-model.js`.

## Settings (`kelly-standup-settings`)

One row, `record-id: "team"`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"team"`, required |
| `team-name` | `team_name` | text | |
| `team-timezone` | `team_timezone` | text | IANA timezone |
| `team-workdays` | `team_workdays` | longtext | JSON array, e.g. `["mon","tue","wed","thu","fri"]` |
| `digest-style` | `digest_style` | text | e.g. `concise` |
| `standup-questions` | `standup_questions` | longtext | JSON array of strings |

## Ingest payload (`scripts/ingest_updates.mjs`)

```json
{
  "source": "slack",
  "date": "2026-07-03",
  "digest": "optional digest paragraph for the day",
  "on_leave": ["member_id"],
  "team": { "name": "Nimbus team", "timezone": "Asia/Shanghai", "workdays": ["mon","tue","wed","thu","fri"] },
  "members": [
    { "member_id": "alice", "name": "Alice Chen", "role": "Engineer", "timezone": "Asia/Shanghai", "channel": "slack", "contact_env": "KELLY_STANDUP_MEMBER_ALICE_CONTACT" }
  ],
  "updates": [
    {
      "member_id": "alice",
      "yesterday": ["Shipped the billing page"],
      "today": ["Wire up live payments"],
      "blockers": [
        { "text": "Waiting on production API keys", "severity": "high", "status": "open", "suggested_action": "optional" }
      ],
      "mood": "ok",
      "submitted_at": "2026-07-03T00:51:00Z",
      "source": "slack",
      "raw_excerpt": "yday: billing page shipped…"
    }
  ],
  "reminders": [
    {
      "type": "missing_checkin",
      "member_id": "bob",
      "channel": "wecom",
      "title": "Nudge Bob for today's check-in",
      "reason": "No check-in by 10:30 team time",
      "draft": "Hi Bob — quick nudge…"
    }
  ]
}
```

`team` and `members` are optional and only needed for onboarding or roster
changes — a daily ingest omits them. `updates[].source` defaults to the
payload `source`. Update blockers only need `text` (+ optional
`severity`/`status`); ids are derived. Reminder ids default to
`rem-<sha1(type|member|date)>`, so re-drafting the same reminder on the same
day updates it in place. `date` is always required (even an onboarding-only
payload needs one, e.g. today's date).

## Decisions

A human verdict writes `status`, `decision-action`, `decision-note`, and
`decided-at` directly onto the reminder record through `busabase-sdk` (and,
for any action, the current draft-textarea value onto `draft`). There is no
separate decisions file: the reminder record is the single source of truth.
From a standalone local preview the write merges immediately (trusted
operator); from the deployed AirApp it creates a pending ChangeRequest for
the trusted process to merge.
