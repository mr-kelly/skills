# Kelly Creators Schema

Use this schema for the handoff files under `app/.data/`. Keep the shapes stable so the local app, scripts, and the skill can evolve independently. Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

An **item is a creator engagement** (or a **quality gate** on a live post). The review-queue lifecycle uses the standard workflow states.

## Snapshot (`creator_snapshot.json`)

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-creators",
  "base_currency": "USD",
  "pipeline_stages": ["discovery", "outreach", "negotiating", "live", "measured"],
  "metrics": {
    "creator_count": 0,
    "needs_review": 0,
    "approved": 0,
    "done": 0,
    "blocked": 0,
    "total_reach": 0,
    "budget_total": 0,
    "budget_allocated": 0,
    "est_value": 0
  },
  "creators": [],
  "warnings": []
}
```

`total_reach` sums followers over non-blocked engagements; `budget_allocated` sums `est_rate` over approved/done/live engagements; `est_value` sums `est_value` over engagements. Quality-gate items are excluded from these rollups.

## Creator engagement (item)

```json
{
  "creator_id": "stable local id",
  "ref": 1,
  "handle": "@invented.handle",
  "name": "Display Name",
  "platform": "tiktok|instagram|youtube|xiaohongshu|twitter|twitch",
  "niche": "beauty|fitness|tech|lifestyle|food|wellness|parenting",
  "followers": 184000,
  "engagement_rate": 0.062,
  "fit_score": 92,
  "fit_breakdown": {
    "content": 95, "community": 90, "credibility": 88,
    "audience": 96, "cost": 90, "engagement": 93
  },
  "stage": "discovery|outreach|negotiating|live|measured",
  "phase": "discover|plan|activate|measure",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "proposed_action": "send_outreach|send_brief|draft_contract|no_action",
  "est_rate": 1800,
  "risk": ["money", "contract"],
  "channel": "instagram_dm|tiktok_dm|email",
  "reason": "why this action is proposed now",
  "audience_note": "short audience-fit note",
  "suggested_reply": "editable outreach DM / email / brief draft",
  "est_value": 5200,
  "spend": 0,
  "cpm": 9.78,
  "item_type": "engagement",
  "created_at": "ISO timestamp"
}
```

- `fit_score` is the objective **C³ ACE** matching score (0-100): **C**ontent / **C**ommunity / **C**redibility × **A**udience / **C**ost / **E**ngagement, expanded in `fit_breakdown`.
- `phase` tags the engagement with Aaron's discipline phase (Discover / Plan / Activate / Measure); it is derived from `stage`.
- `est_rate` and `risk: ["money"|"contract"]` drive the money/contract risk badges. Any engagement carrying money or contract risk is **approval-required** before a contract is drafted.
- `ref` is a stable per-batch row number so chat comments like "change #2" resolve unambiguously. Never renumber refs; retire ids instead.

## Quality-gate item (content-reviewer)

A pre-publication decision gate on a live creator's draft post. Same item shape plus:

```json
{
  "item_type": "quality_gate",
  "gate_verdict": "ship|fix|block",
  "gate_checks": [
    { "check": "ftc_disclosure", "result": "ship|fix|block", "note": "..." },
    { "check": "claim_authenticity", "result": "ship|fix|block", "note": "..." },
    { "check": "brand_safety", "result": "ship|fix|block", "note": "..." }
  ]
}
```

The gate outputs **SHIP / FIX / BLOCK** by checking FTC disclosure placement and claim authenticity before the post publishes. `est_rate`, `est_value`, and `followers` on a gate item are informational only and excluded from metric rollups.

## Decisions (`decisions.json`)

Written by the app; read by the skill and `scripts/execute_decisions.ts`.

```json
{
  "updated_at": "ISO timestamp",
  "decisions": {
    "<creator_id>": {
      "action": "approve|request_changes|block|revise",
      "comment": "review note",
      "draft": "optional user-edited draft; when present it replaces suggested_reply",
      "decided_at": "ISO timestamp"
    }
  }
}
```

A decision decided after `generated_at` overrides the snapshot status in the UI: `approve` → `approved`, `request_changes` → `changes_requested`, `block` → `blocked`.

## Agent Tasks (`agent_tasks.json`)

Queued agent work. The skill polls this to pick up revisions.

```json
{
  "updated_at": "ISO timestamp",
  "tasks": [
    {
      "task_id": "task-<creator_id>-<ms>",
      "type": "revise_outreach",
      "creator_id": "creator id",
      "comment": "what the user asked to change",
      "requested_at": "ISO timestamp",
      "status": "queued"
    }
  ]
}
```

## Execution Report (`execution_report.json`)

Written by `scripts/execute_decisions.ts`. Records concrete handoff operations only; no external side effects happen here.

```json
{
  "executed_at": "ISO timestamp",
  "dry_run": false,
  "source": "kelly-creators",
  "results": [
    {
      "creator_id": "creator id",
      "ref": 1,
      "status": "handed_off|dry_run|skipped",
      "operation": "send_outreach|send_brief|draft_contract",
      "channel": "instagram_dm|tiktok_dm|email",
      "format": "pdf",
      "draft_id": "stable local id",
      "target": "@handle",
      "draft": "approved draft that was handed off",
      "comment": "review note",
      "reason": "engagement reason",
      "executed_at": "ISO timestamp"
    }
  ]
}
```

## Onboarding (`onboarding.json`)

```json
{ "completed": true, "completed_at": "ISO timestamp", "config_version": "1" }
```

## Lock (`agent.lock`)

```json
{ "owner": "kelly-creators", "message": "Sweeping and scoring creators", "started_at": "ISO timestamp" }
```

While the lock exists the app rejects decision writes (HTTP 423) and renders the queue read-only.

## Warnings

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "creator_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```
