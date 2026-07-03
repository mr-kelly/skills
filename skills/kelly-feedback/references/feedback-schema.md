# Kelly Feedback Snapshot Schema

Use this schema for `app/.data/feedback_snapshot.json`. Keep the shape stable so the local app, scripts, and sibling-skill handoffs can evolve independently. Validate with `scripts/validate_ui_schema.mjs` before relying on a snapshot.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-feedback",
  "products": [],
  "sources": [],
  "feedback": [],
  "requests": [],
  "roadmap": { "now": [], "next": [], "later": [] },
  "proposals": [],
  "metrics": {
    "feedback_count": 0,
    "new_feedback": 0,
    "request_count": 0,
    "proposals_needs_review": 0,
    "requests_needs_info": 0,
    "week_inflow": { "email": 0 },
    "sentiment": { "positive": 0, "neutral": 0, "negative": 0 }
  },
  "sync_log": []
}
```

`metrics`, request `frequency`, and request `weighted_score` are derived from the raw feedback stream by `recomputeDerived` in `app/server/store.mjs`; every script that mutates the snapshot must call it before writing.

## Product

```json
{
  "product_id": "stable local id",
  "display_name": "Product Name",
  "tagline": "optional one-liner"
}
```

## Source

```json
{
  "source_id": "stable local id",
  "channel": "email|discord|slack|x|appstore|survey|interview",
  "name": "Support inbox",
  "collection": "kelly-email handoff | manual export | ...",
  "last_ingest_at": "ISO timestamp",
  "item_count": 0,
  "status": "ok|warning|error"
}
```

## Feedback Item

```json
{
  "feedback_id": "fb-<source_id>-<external_id>",
  "source_id": "source id",
  "channel": "email|discord|slack|x|appstore|survey|interview",
  "product": "product id or \"\"",
  "user": {
    "handle": "email, @handle, reviewer name, or respondent label",
    "plan": "free|pro|team|... (free-form, mapped by scoring.plan_weights)",
    "tenure_months": 0,
    "weight": 1
  },
  "text": "full raw feedback text (original language)",
  "sentiment": "positive|neutral|negative",
  "received_at": "ISO timestamp",
  "permalink": "optional source URL",
  "request_id": "linked request id or \"\"",
  "triage": "new|clustered|ignored|insight",
  "agent_note": "optional short agent annotation"
}
```

`weight` is the user's revenue weight (usually the plan weight from scoring config). A request's `weighted_score` is the sum of linked feedback weights, so weighted score = frequency × average user weight.

Triage states: `new` (untriaged), `clustered` (linked to a request), `ignored` (spam/no signal), `insight` (useful signal that is not a feature request — bug reports, power-user patterns, docs ideas).

## Request (Cluster)

```json
{
  "request_id": "stable local id",
  "title": "human-readable feature request title",
  "product": "product id or \"\"",
  "status": "candidate|roadmap|declined|needs_info",
  "trend": "up|flat|down",
  "frequency": 0,
  "weighted_score": 0,
  "problem_statement": "agent-drafted problem statement",
  "spec_summary": "agent-drafted proposed spec summary",
  "effort_estimate": "free-form, e.g. M (1-2 weeks)",
  "representative_feedback_ids": ["fb-..."],
  "decision_history": [
    { "at": "ISO timestamp", "actor": "agent|kelly", "action": "created|updated|promoted|shipped|needs_info|proposed_decline", "note": "short note" }
  ],
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

## Roadmap Item

```json
{
  "item_id": "stable local id",
  "title": "roadmap item title",
  "request_id": "optional linked request id",
  "note": "optional short note"
}
```

The roadmap object has three lanes: `now`, `next`, `later`. The app renders them read-only; lanes change only through approved proposals executed by `scripts/execute_decisions.mjs`.

## Proposal (Decision Queue Item)

```json
{
  "proposal_id": "stable local id",
  "ref": 1,
  "type": "promote_request|decline_request|merge_requests|publish_changelog",
  "title": "agent-proposed roadmap change",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "request_id": "primary linked request id or \"\"",
  "request_ids": ["for merge_requests: all involved request ids"],
  "target_lane": "now|next|later or \"\" (promote_request only)",
  "reason": "why the agent proposes this",
  "evidence": "feedback counts, weights, accounts, trend",
  "draft_kind": "changelog_note|decline_reply|merge_note or \"\"",
  "draft": "editable public text (changelog note, decline reply, ...)",
  "review_note": "Kelly's note from the review UI",
  "created_at": "ISO timestamp",
  "decided_at": "ISO timestamp or \"\""
}
```

`ref` is the stable per-snapshot number rendered as `Proposal #1` so chat comments like "approve #2" resolve unambiguously. Statuses follow the standard App-in-Skill workflow states; `changes_requested` enqueues an agent task and returns to `needs_review` after revision.

## Sync Log Entry

```json
{
  "at": "ISO timestamp",
  "actor": "kelly-feedback|agent|kelly",
  "action": "ingest|cluster|execute|init",
  "detail": "short human-readable description",
  "count": 0
}
```

## Handoff Files

- `app/.data/decisions.json` — UI-written verdicts keyed by id: `proposals{}` (`approve|request_changes|block` + `review_note` + edited `draft`), `feedback{}` (`assign|ignore|insight` + `request_id`), `requests{}` (`effort_estimate`).
- `app/.data/agent_tasks.json` — queued agent work (`revise_proposal` etc.), appended when a proposal gets `request_changes`.
- `app/.data/execution_report.json` — output of `scripts/execute_decisions.mjs` with concrete operations (`update_roadmap`, `publish_changelog_note`, `send_decline_reply`, `merge_requests`).
- `app/.data/onboarding.json` — onboarding completion marker.
- `app/.data/agent.lock` — write lock; the UI rejects decision writes and disables editing while it exists.

## Ingest Payload (input to `scripts/ingest_feedback.mjs`)

```json
{
  "source": {
    "source_id": "support-email",
    "channel": "email",
    "name": "Support inbox",
    "collection": "kelly-email handoff"
  },
  "items": [
    {
      "external_id": "stable id in the source system (dedupe key)",
      "product": "optional product id",
      "user": { "handle": "...", "plan": "pro", "tenure_months": 3, "weight": 3 },
      "text": "raw feedback text",
      "sentiment": "positive|neutral|negative (optional, defaults neutral)",
      "received_at": "ISO timestamp",
      "permalink": "optional URL",
      "agent_note": "optional"
    }
  ]
}
```

Feedback ids are derived as `fb-<source_id>-<external_id>`; re-ingesting the same payload is idempotent.

## Cluster Assignment Payload (input to `scripts/apply_clusters.mjs`)

```json
{
  "requests": [
    {
      "request_id": "req-csv-export",
      "title": "CSV export for dashboard data",
      "product": "product id",
      "status": "candidate",
      "trend": "up",
      "problem_statement": "...",
      "spec_summary": "...",
      "effort_estimate": "M (1-2 weeks)",
      "representative_feedback_ids": ["fb-..."],
      "note": "optional history note"
    }
  ],
  "assignments": [
    { "feedback_id": "fb-...", "request_id": "req-csv-export" },
    { "feedback_id": "fb-...", "request_id": "", "triage": "insight", "agent_note": "bug report, not a request" }
  ]
}
```

An empty `request_id` unassigns; combine with `triage` to mark `ignored` or `insight`.
