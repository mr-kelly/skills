# Kelly Standup Schema

Use this schema for `app/.data/standup_snapshot.json` and the ingest payload consumed by `scripts/ingest_updates.mjs`. Keep the shape stable so the local app, scripts, and future connectors can evolve independently. Validate with `node scripts/validate_ui_schema.mjs app/.data/standup_snapshot.json`.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-standup",
  "team": {
    "name": "Team name",
    "timezone": "IANA timezone",
    "workdays": ["mon", "tue", "wed", "thu", "fri"]
  },
  "today": "YYYY-MM-DD",
  "members": [],
  "days": [],
  "blockers": [],
  "reminders": [],
  "metrics": {
    "member_count": 0,
    "active_member_count": 0,
    "submitted_today": 0,
    "expected_today": 0,
    "on_leave_today": 0,
    "missing_today": 0,
    "open_blockers": 0,
    "high_open_blockers": 0,
    "reminders_needs_review": 0,
    "avg_participation_30d": 0
  },
  "sync_log": [],
  "warnings": []
}
```

`today` is the most recent recorded date. `metrics` and all per-member derived fields (streak, participation, blocker counts, day participation) are recomputed by `recomputeDerived` in `app/server/store.mjs` — never hand-edit them.

## Member

```json
{
  "member_id": "stable local id",
  "name": "Display name",
  "role": "Engineer",
  "timezone": "IANA timezone",
  "channel": "slack|wecom|discord|whatsapp|email",
  "active": true,
  "streak": 0,
  "participation_30d": 0.9,
  "open_blockers": 0,
  "last_submitted_date": "YYYY-MM-DD or empty",
  "notes": "optional per-member notes"
}
```

The roster is seeded from private config (`config.members[]`) on ingest and upserted by `member_id`. Contact details never enter the snapshot; they live only in env vars referenced by `contact_env` in config. `streak` counts consecutive recorded days with a submission, skipping days the member was on leave; `participation_30d` is submissions divided by expected days in the trailing 30 calendar days.

## Day

```json
{
  "date": "YYYY-MM-DD",
  "digest": "agent-written summary paragraph for the day",
  "on_leave": ["member_id"],
  "updates": [],
  "participation": { "submitted": 6, "expected": 8, "on_leave": 1 }
}
```

One entry per recorded standup day, unique by `date`. `participation` is derived.

## Update (per member per day)

```json
{
  "member_id": "stable local id",
  "yesterday": ["what got done"],
  "today": ["what is planned"],
  "blockers": [
    { "blocker_id": "bl-…", "text": "short description", "severity": "high|medium|low", "status": "open|resolved" }
  ],
  "mood": "good|ok|stuck or empty",
  "submitted_at": "ISO timestamp",
  "source": "slack|wecom|discord|whatsapp|doc|manual",
  "raw_excerpt": "short verbatim excerpt of the original message"
}
```

At most one update per member per day; re-ingesting replaces the existing update (idempotent). `raw_excerpt` keeps a short provenance trail only — never store whole chat logs.

## Blocker (registry)

```json
{
  "blocker_id": "bl-<sha1(member|normalized text)[0:10]>",
  "member_id": "owner",
  "raised_date": "YYYY-MM-DD",
  "severity": "high|medium|low",
  "status": "open|resolved",
  "text": "short description",
  "suggested_action": "agent-suggested next action",
  "resolved_date": "YYYY-MM-DD or empty"
}
```

The top-level registry deduplicates blockers across days by content hash. When an ingested update carries the same blocker text with `status: "resolved"`, the registry entry transitions to resolved with `resolved_date` set. `suggested_action` is agent-written advice for the team lead, not an executed action.

## Reminder (review-queue item)

```json
{
  "id": "rem-<sha1(type|member|date)[0:10]>",
  "ref": 1,
  "type": "missing_checkin|blocker_escalation",
  "member_id": "target member",
  "channel": "slack|wecom|discord|whatsapp|email",
  "title": "short human title",
  "reason": "why the agent drafted this",
  "draft": "editable outbound message draft",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "created_at": "ISO timestamp",
  "decision": null,
  "execution": null
}
```

Reminders follow the standard review model. Decisions land in `decisions.json` via `POST /api/decision` (`approve` / `request_changes` / `revise` / `block`); `request_changes` enqueues a `revise_reminder` task in `agent_tasks.json`. `scripts/execute_decisions.mjs` turns approved reminders into `send_reminder` operations in `execution_report.json` — the app and scripts never send anything.

## Ingest payload (`scripts/ingest_updates.mjs`)

```json
{
  "source": "slack",
  "date": "2026-07-03",
  "digest": "optional digest paragraph for the day",
  "on_leave": ["member_id"],
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

`updates[].source` defaults to the payload `source`. Update blockers only need `text` (+ optional `severity`/`status`); ids are derived. Reminder ids default to `rem-<sha1(type|member|date)>`, so re-drafting the same reminder on the same day updates it in place.

## Sync log entry

```json
{ "at": "ISO timestamp", "source": "slack", "action": "ingest", "detail": "human-readable", "count": 6 }
```

## Warning

```json
{ "id": "stable id", "severity": "info|warning|error", "message": "short message", "detail": "optional" }
```
