# Kelly Launch Schema

Use this schema for the handoff files under `app/.data/`. Keep the shapes stable so the local app, scripts, and the skill can evolve independently. Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

## Snapshot (`launch_snapshot.json`)

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-launch",
  "product": { "name": "Trailhead", "tagline": "…", "homepage": "https://…", "category": "…" },
  "launch": { "target_date": "YYYY-MM-DD", "timezone": "UTC" },
  "phases": ["research", "assemble", "mobilize", "prove"],
  "readiness": {
    "verdict": "SHIP|FIX|BLOCK",
    "lqs": 72,
    "ship": 0,
    "fix": 0,
    "block": 0,
    "blockers": [{ "item_id": "…", "ref": 5, "title": "…", "phase": "assemble" }]
  },
  "metrics": {
    "item_count": 0,
    "needs_review": 0,
    "approved": 0,
    "done": 0,
    "blocked": 0,
    "ship": 0,
    "fix": 0,
    "block": 0
  },
  "phase_progress": [{ "phase": "research", "total": 3, "done": 2 }],
  "channels": [],
  "items": [],
  "runbook": [],
  "warnings": []
}
```

`readiness` is the **launch-readiness gate** (RAMP → LQS → SHIP/FIX/BLOCK). `lqs` (Launch Quality Score, 0–100) counts SHIP items full, FIX items half, BLOCK items zero. `verdict` is `BLOCK` if any item is BLOCK, `FIX` if any blockers remain, else `SHIP`.

## Item (a launch task or asset)

Items are the review-queue rows. `status` uses the standard workflow states. An item with a non-empty `draft` is treated as an **asset** and appears in the Assets approval queue.

```json
{
  "item_id": "stable local id",
  "ref": 1,
  "phase": "research|assemble|mobilize|prove",
  "title": "human-readable task or asset name",
  "owner": "operator name",
  "channel_id": "optional channel id (product_hunt|hacker_news|press|email|changelog)",
  "readiness": "SHIP|FIX|BLOCK",
  "proposed_action": "publish_asset|submit_channel|send_pitch|no_action",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "draft": "editable asset copy / submission text / pitch (present for assets)",
  "suggested_reply": "reuse of the drafted submission/pitch for review-first items",
  "reason": "why the agent proposes this now / why it is blocked",
  "format": "markdown|text (for publish_asset items)",
  "risk": ["public", "outreach", "press", "commitment"],
  "created_at": "ISO timestamp"
}
```

`ref` is a stable per-batch row number so chat comments like "fix #8" resolve unambiguously. Never renumber refs when regenerating; retire ids instead. Public submissions (`product_hunt`, `hacker_news`) and press outreach are always approval-required.

## Channel

```json
{
  "channel_id": "product_hunt",
  "type": "product_hunt|hacker_news|press|email|changelog",
  "display_name": "Product Hunt",
  "submission_status": "queued|drafting|scheduled|submitted|live"
}
```

## Runbook step (launch-day)

```json
{
  "step_id": "run-01",
  "offset": "T-60m|T-0|T+30m",
  "at": "08:00",
  "title": "ordered launch-day action",
  "owner": "on-call owner",
  "note": "war-room note for this step"
}
```

## Decisions (`decisions.json`)

Written by the app; read by the skill and `scripts/execute_decisions.ts`.

```json
{
  "updated_at": "ISO timestamp",
  "decisions": {
    "<item_id>": {
      "action": "approve|request_changes|block|revise",
      "comment": "review note",
      "draft": "optional user-edited draft; when present it replaces the item draft",
      "decided_at": "ISO timestamp"
    }
  }
}
```

A decision decided after `generated_at` overrides the snapshot status in the UI: `approve` → `approved`, `request_changes` → `changes_requested`, `block` → `blocked`.

## Agent Tasks (`agent_tasks.json`)

Queued agent work — items in `changes_requested`. The skill polls this to pick up revisions.

```json
{
  "updated_at": "ISO timestamp",
  "tasks": [
    {
      "task_id": "task-<item_id>-<ms>",
      "type": "revise_item",
      "item_id": "item id",
      "comment": "what the user asked to change",
      "requested_at": "ISO timestamp",
      "status": "queued"
    }
  ]
}
```

## Execution Report (`execution_report.json`)

Written by `scripts/execute_decisions.ts`. Records concrete operations only; no external side effects happen here.

```json
{
  "executed_at": "ISO timestamp",
  "dry_run": false,
  "source": "kelly-launch",
  "results": [
    {
      "item_id": "item id",
      "ref": 8,
      "status": "published|submitted|handed_off|dry_run|skipped",
      "operation": "publish_asset|submit_channel|send_pitch",
      "channel": "product_hunt",
      "scheduled_for": "YYYY-MM-DD",
      "list": "press_tier1",
      "format": "markdown",
      "target": ".data/exports/<item_id>.md",
      "draft": "approved draft that was handed off",
      "comment": "review note",
      "reason": "item reason",
      "executed_at": "ISO timestamp"
    }
  ]
}
```

Execution semantics by `proposed_action`:

- `submit_channel` → `operation: submit_channel, channel: product_hunt, scheduled_for: <target_date>`.
- `send_pitch` → `operation: send_pitch, list: press_tier1`.
- `publish_asset` → `operation: publish_asset, format: markdown, path: .data/exports/<item_id>.md`.

## Onboarding (`onboarding.json`)

```json
{ "completed": true, "completed_at": "ISO timestamp", "config_version": "1" }
```

## Lock (`agent.lock`)

```json
{ "owner": "kelly-launch", "message": "Assembling launch checklist", "started_at": "ISO timestamp" }
```

While the lock exists the app rejects decision writes (HTTP 423) and renders the queue read-only.

## Warnings

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```
