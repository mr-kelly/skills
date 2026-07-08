# Kelly CRM Schema

Use this schema for the handoff files under `app/.data/`. Keep the shapes stable so the local app, scripts, and the skill can evolve independently. Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

## Snapshot (`crm_snapshot.json`)

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-crm",
  "base_currency": "USD",
  "pipeline_stages": ["lead", "qualified", "proposal", "negotiation", "won", "lost"],
  "metrics": {
    "contact_count": 0,
    "company_count": 0,
    "deal_count": 0,
    "open_deal_count": 0,
    "pipeline_value": 0,
    "weighted_pipeline_value": 0,
    "followups_needs_review": 0,
    "followups_due": 0
  },
  "companies": [],
  "contacts": [],
  "deals": [],
  "interactions": [],
  "followups": [],
  "warnings": []
}
```

`pipeline_value` is the sum of open deal amounts in the base currency; `weighted_pipeline_value` is `sum(amount * probability)` over open deals.

## Company

```json
{
  "company_id": "stable local id",
  "name": "Brightpath Labs",
  "domain": "optional domain",
  "industry": "optional",
  "size": "optional headcount text",
  "location": "optional",
  "notes": "optional"
}
```

## Contact

```json
{
  "contact_id": "stable local id",
  "name": "Mira Solano",
  "company_id": "optional company id",
  "role": "optional title",
  "email": "optional email",
  "relationship": "strong|warm|cool|new",
  "tags": ["pilot", "champion"],
  "last_touch_at": "ISO timestamp or empty",
  "next_followup_at": "YYYY-MM-DD or empty",
  "agent_notes": "short agent-maintained context for this person",
  "channels": ["email"]
}
```

## Deal

```json
{
  "deal_id": "stable local id",
  "name": "Enterprise pilot",
  "company_id": "company id",
  "primary_contact_id": "contact id",
  "contact_ids": ["contact ids incl. primary"],
  "stage": "one of pipeline_stages",
  "amount": 48000,
  "currency": "USD",
  "probability": 0.7,
  "next_step": "human-readable next step",
  "owner": "operator name",
  "opened_at": "YYYY-MM-DD",
  "expected_close": "YYYY-MM-DD",
  "last_activity_at": "ISO timestamp",
  "status": "open|won|lost",
  "agent_next_action": "agent-suggested next action shown in the deal detail",
  "notes": "optional"
}
```

`stage` must be one of `pipeline_stages`. Won/lost deals keep their stage (`won`/`lost`) and set `status` accordingly.

## Interaction

```json
{
  "interaction_id": "stable local id",
  "contact_id": "contact id",
  "company_id": "optional company id",
  "deal_id": "optional deal id",
  "type": "email|meeting|call|chat|social|note",
  "occurred_at": "ISO timestamp",
  "direction": "inbound|outbound|internal",
  "summary": "one- or two-sentence summary",
  "source": "email|meeting notes|call notes|linkedin|note"
}
```

Store only summaries, never raw email bodies or attachments.

## Follow-up

Follow-ups are the review-queue items. `status` uses the standard workflow states.

```json
{
  "followup_id": "stable local id",
  "ref": 1,
  "contact_id": "contact id",
  "deal_id": "optional deal id",
  "channel_id": "configured channel id, e.g. email-main",
  "channel_type": "email|linkedin|chat",
  "subject": "optional subject line",
  "reason": "why the agent proposes this follow-up now",
  "risk": ["money", "legal", "commitment", "privacy"],
  "due_at": "YYYY-MM-DD",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "suggested_reply": "editable draft message",
  "created_at": "ISO timestamp"
}
```

`ref` is a stable per-batch row number so chat comments like "change #2" resolve unambiguously. Never renumber refs when regenerating the snapshot; retire ids instead.

## Decisions (`decisions.json`)

Written by the app; read by the skill and `scripts/execute_decisions.ts`.

```json
{
  "updated_at": "ISO timestamp",
  "decisions": {
    "<followup_id>": {
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
      "task_id": "task-<followup_id>-<ms>",
      "type": "revise_followup",
      "followup_id": "followup id",
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
  "source": "kelly-crm",
  "results": [
    {
      "followup_id": "followup id",
      "ref": 1,
      "status": "handed_off|dry_run|skipped",
      "operation": "handoff_to_email",
      "channel": "email-main",
      "target": "contact email",
      "draft": "approved draft that was handed off",
      "comment": "review note",
      "reason": "follow-up reason",
      "executed_at": "ISO timestamp"
    }
  ]
}
```

## Onboarding (`onboarding.json`)

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Lock (`agent.lock`)

```json
{
  "owner": "kelly-crm",
  "message": "Updating CRM snapshot",
  "started_at": "ISO timestamp"
}
```

While the lock exists the app rejects decision writes (HTTP 423) and renders the queue read-only.

## Warnings

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "deal_id": "optional",
  "contact_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```
