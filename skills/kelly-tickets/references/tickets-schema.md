# Kelly Tickets Schema

Use this schema for `app/.data/tickets_snapshot.json` and the ingest/triage payloads. Keep the shape stable so the local app, scripts, and future providers can evolve independently. Validate with `scripts/validate_ui_schema.mjs` before relying on a snapshot in the UI.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-tickets",
  "property": { "name": "Riverside Gardens", "buildings": 3 },
  "range": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "metrics": {
    "intake_count": 0,
    "unclassified_intake": 0,
    "ticket_count": 0,
    "open_tickets": 0,
    "resolved_tickets": 0,
    "avg_resolution_hours": 0,
    "sla_at_risk": 0,
    "proposal_count": 0,
    "needs_review": 0,
    "intake_by_channel": { "wechat": 0 }
  },
  "intake": [],
  "tickets": [],
  "dispatch_proposals": [],
  "crews": [],
  "sync_log": [],
  "warnings": []
}
```

Metrics are recomputed by `computeMetrics()` in `app/server/store.mjs`; scripts must call it after every merge instead of hand-editing counts.

## Intake Item

One raw complaint/request as it arrived on a channel, before or after triage.

```json
{
  "id": "in-<stable id>",
  "channel": "wechat|phone|form|email|walk_in",
  "external_id": "channel-native id when available",
  "content_hash": "sha1 of channel+unit+text (dedupe fallback)",
  "reporter": "display name",
  "contact_masked": "masked phone/handle, e.g. 138****14",
  "unit": "12B",
  "location": "free-text location when not a unit",
  "text": "one complaint, verbatim or lightly cleaned",
  "received_at": "ISO timestamp",
  "urgency_guess": "urgent|high|normal|low",
  "category_guess": "one of config categories",
  "triage_state": "new|classified|ticketed|ignored",
  "ticket_id": "T-1001 when converted",
  "attachments_note": "optional, e.g. 2 photos in WeChat group",
  "decision": null
}
```

Dedupe key: `channel + external_id` when `external_id` exists, otherwise `channel + content_hash`. PII rule: `contact_masked` must already be masked before it reaches the snapshot; `scripts/ingest_intake.mjs` re-masks long digit runs defensively. Never store raw exports in the snapshot.

## Ticket

```json
{
  "id": "T-1001",
  "title": "Water leak from bathroom ceiling in 12B",
  "category": "plumbing",
  "urgency": "urgent|high|normal|low",
  "unit": "12B",
  "location": "Building 2",
  "reporter": "display name",
  "contact_masked": "masked contact",
  "status": "open|assigned|in_progress|waiting|resolved",
  "crew_id": "crew id or empty until dispatched",
  "assignee": "optional person on the crew",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp",
  "resolved_at": "ISO timestamp or empty",
  "sla_due_at": "ISO timestamp",
  "sla_state": "ok|at_risk|breached|met",
  "intake_ids": ["in-..."],
  "resolution_note": "",
  "history": [
    {
      "event": "intake|classified|dispatch_proposed|dispatch_approved|crew_notified|crew_update|sla_breach|resolved",
      "actor": "kelly-tickets | operator | crew member name",
      "at": "ISO timestamp",
      "note": "short human-readable note"
    }
  ]
}
```

`history` is the auditable trail from intake to resolution; append events, never rewrite them. `sla_state` is derived by `computeSlaState()` (at_risk when less than 25% of the SLA window remains).

## Dispatch Proposal

Review-queue item (see the App-in-Skill Review Model). Stable refs render as `Dispatch #<ref>`.

```json
{
  "id": "dp-<stable id>",
  "ref": 1,
  "ticket_id": "T-1002",
  "title": "Dispatch Electrical Crew to Elevator 2",
  "summary": "one-line ticket summary",
  "proposed_crew_id": "electrical",
  "proposed_assignee": "optional person",
  "priority": "P1|P2|P3|P4",
  "sla_due_at": "ISO timestamp",
  "sla_hours": 24,
  "reason": "why this crew/priority, incl. prior history",
  "note_to_crew": "editable message draft for the crew",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "decision": {
    "action": "approve|request_changes|revise|block",
    "note": "reviewer note",
    "draft": "edited note_to_crew or null",
    "decided_at": "ISO timestamp"
  },
  "execution": {
    "status": "planned|ready_for_agent|executed|blocked|error",
    "operations": [
      { "operation": "notify_crew|update_board", "target": "crew id or ticket id", "detail": "..." }
    ],
    "detail": "result detail",
    "executed_at": "ISO timestamp"
  }
}
```

## Crew

```json
{
  "crew_id": "plumbing",
  "name": "Plumbing & HVAC Crew",
  "skills": ["plumbing", "hvac"],
  "members": "optional lead/members display string",
  "contact_env": "KELLY_TICKETS_CREW_PLUMBING_CONTACT",
  "open_tickets": 0,
  "active": true
}
```

Contacts are env var references only — never store phone numbers or webhook URLs in the snapshot or config committed to git.

## Sync Log Entry

```json
{
  "at": "ISO timestamp",
  "source": "wechat_export|phone_log|form|email|kelly-tickets",
  "action": "ingest|triage|execute",
  "detail": "human-readable summary",
  "count": 6
}
```

## Warning

```json
{
  "id": "stable id",
  "severity": "info|warning|error",
  "ticket_id": "optional",
  "message": "short message",
  "detail": "optional detail"
}
```

## Ingest Payload (`scripts/ingest_intake.mjs <payload.json>`)

The agent parses WeChat group exports, call logs, front-desk forms, and mailbox items into this shape; the script is the only write path into `intake[]`.

```json
{
  "source": "wechat_export",
  "items": [
    {
      "channel": "wechat",
      "external_id": "W-88121",
      "reporter": "Mrs. Tang",
      "contact": "13800002214",
      "unit": "12B",
      "location": "Building 2",
      "text": "Water dripping from the bathroom ceiling...",
      "received_at": "2026-07-03T07:36:00Z",
      "urgency_guess": "urgent",
      "category_guess": "plumbing",
      "attachments_note": "2 photos in WeChat group"
    }
  ]
}
```

## Triage Payload (`scripts/apply_triage.mjs <payload.json>`)

Classification and dispatch proposals are LLM work; this script is the deterministic merge and computes `sla_due_at` from config `sla_rules`.

```json
{
  "classifications": [
    {
      "intake_id": "in-...",
      "action": "ticket|ignore",
      "category": "plumbing",
      "urgency": "urgent",
      "unit": "12B",
      "location": "Building 2",
      "title": "Water leak from bathroom ceiling in 12B",
      "note": "optional classification note"
    }
  ],
  "proposals": [
    {
      "ticket_id": "T-1001",
      "crew_id": "plumbing",
      "assignee": "",
      "priority": "P1",
      "reason": "water leak → plumbing crew; unit 12B has 2 prior leak reports",
      "note_to_crew": "Check the riser valve first."
    }
  ],
  "ticket_updates": [
    { "ticket_id": "T-1001", "status": "in_progress", "actor": "Sam Porter", "note": "Riser valve shut, drying." }
  ]
}
```

## Other Handoff Files

- `app/.data/decisions.json`: `{ "updated_at": "...", "decisions": { "<id>": { "action", "note", "draft", "fields", "decided_at" } } }` — ids may be dispatch proposals (`approve|request_changes|revise|block`), intake items (`convert_to_ticket|ignore`), or tickets (`revise` = resolution note).
- `app/.data/agent_tasks.json`: `{ "updated_at": "...", "tasks": [ { "id", "type": "revise_dispatch|convert_intake", "note", "fields", "requested_at" } ] }`.
- `app/.data/execution_report.json`: written by `scripts/execute_decisions.mjs`; `results[]` keyed by proposal id with `operations[]` (`notify_crew`, `update_board`).
- `app/.data/onboarding.json`: `{ "completed": true, "completed_at": "...", "config_version": "..." }`.
- `app/.data/agent.lock`: `{ "owner": "kelly-tickets", "message": "...", "started_at": "..." }` — the app rejects `POST /api/decision` with HTTP 423 while it exists.
