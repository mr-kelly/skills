# Kelly Campaigns Schema

Use this schema for the handoff files under `app/.data/`. Keep the shapes stable so the local app, scripts, and the skill can evolve independently. Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

An **item is one email send** — a campaign, a newsletter issue, or a single sequence step. Sends are grouped by Aaron's SEND **phase** (`setup | engage | nurture | deliver`) and carry a pre-send **quality gate** (EQS score + `ship | fix | block` verdict).

## Snapshot (`campaigns_snapshot.json`)

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-campaigns",
  "list_health": {
    "subscriber_count": 0,
    "bounce_rate": 0,
    "complaint_rate": 0,
    "churn_rate": 0,
    "avg_open_rate": 0,
    "avg_click_rate": 0
  },
  "metrics": {
    "needs_review": 0,
    "approved": 0,
    "done": 0,
    "blocked": 0,
    "scheduled": 0,
    "at_risk": 0
  },
  "segments": [],
  "sends": [],
  "warnings": []
}
```

`bounce_rate`, `complaint_rate`, `churn_rate`, `avg_open_rate`, and `avg_click_rate` are fractions (0–1).

## Segment

```json
{
  "segment_id": "stable local id",
  "name": "New signups (30d)",
  "description": "optional audience description",
  "audience_size": 2140
}
```

## Send (the review-queue item)

`status` uses the standard workflow states. `phase` is the SEND facet.

```json
{
  "send_id": "stable local id",
  "ref": 1,
  "type": "campaign|newsletter|sequence_step|cold_outbound",
  "phase": "setup|engage|nurture|deliver",
  "from_identity_id": "configured identity id",
  "subject": "subject line",
  "preview_text": "inbox preview / preheader",
  "segment_id": "segment id",
  "audience_size": 5630,
  "status": "needs_review|changes_requested|approved|done|blocked",
  "proposed_action": "schedule_send|ab_test|hold|no_action",
  "risk": ["money", "spam-word", "compliance", "deliverability"],
  "send_at": "ISO timestamp",
  "deliverability": {
    "spf_pass": true,
    "dkim_pass": true,
    "dmarc_pass": true,
    "spam_score": 1.4,
    "inbox_readiness": 0.94,
    "risk": "low|medium|high"
  },
  "subject_variants": [
    { "id": "a", "subject": "Variant A subject" },
    { "id": "b", "subject": "Variant B subject" }
  ],
  "reason": "why the agent proposes this send now",
  "body": "editable email body draft",
  "performance": {
    "delivered": 47180,
    "open_rate": 0.421,
    "click_rate": 0.118,
    "unsub_rate": 0.0021,
    "bounce_rate": 0.0064
  },
  "quality_gate": {
    "eqs": 92,
    "verdict": "ship|fix|block",
    "summary": "one-line SEND-audit summary",
    "checks": [
      { "key": "S", "label": "Sender & auth", "pass": true, "note": "SPF/DKIM/DMARC pass." },
      { "key": "E", "label": "Engagement risk", "pass": true, "note": "..." },
      { "key": "N", "label": "Not spammy", "pass": true, "note": "..." },
      { "key": "D", "label": "Deliverability", "pass": true, "note": "..." }
    ]
  },
  "created_at": "ISO timestamp"
}
```

- `ref` is a stable per-batch row number so chat comments like "change #2" resolve unambiguously. Never renumber refs when regenerating the snapshot; retire ids instead.
- `subject_variants` is empty (`[]`) unless the send is an A/B subject test.
- `performance` is `null` until a send is `done`.
- `quality_gate` is `null` until the SEND audit has run. A `block` verdict or `deliverability.risk === "high"` means the send must not be scheduled.
- `deliverability.risk` is derived: `high` when auth fails, `spam_score >= 5`, or `inbox_readiness < 0.6`; `medium` when `spam_score >= 3` or `inbox_readiness < 0.8`; else `low`.

## SEND phases and the EQS gate

Every send is tagged with the SEND phase it belongs to:

- **Setup** — deliverability foundations, segments, list growth and hygiene.
- **Engage** — creative, subject lines, render/dark-mode, dynamic personalization.
- **Nurture** — sequences, newsletters, preference/frequency, reactivation.
- **Deliver** — send experiments (A/B), inbox-placement monitoring, cold outbound, and the pre-send quality gate.

The **quality gate** is `email-quality-auditor`: it runs the **SEND** framework (Sender & auth, Engagement risk, Not spammy, Deliverability) to produce an **EQS** (0–100) and a **SHIP / FIX / BLOCK** verdict. Sending stays approval-required regardless of verdict; `block` is a hard stop.

## Decisions (`decisions.json`)

Written by the app; read by the skill and `scripts/execute_decisions.ts`.

```json
{
  "updated_at": "ISO timestamp",
  "decisions": {
    "<send_id>": {
      "action": "approve|request_changes|block|revise",
      "comment": "review note",
      "body": "optional user-edited body; when present it replaces the draft",
      "chosen_variant": "optional A/B variant id the user picked",
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
      "task_id": "task-<send_id>-<ms>",
      "type": "revise_send",
      "send_id": "send id",
      "comment": "what the user asked to change",
      "requested_at": "ISO timestamp",
      "status": "queued"
    }
  ]
}
```

## Execution Report (`execution_report.json`)

Written by `scripts/execute_decisions.ts`. Records concrete ESP handoff operations only; no external side effects happen here.

```json
{
  "executed_at": "ISO timestamp",
  "dry_run": false,
  "source": "kelly-campaigns",
  "esp": "configured-esp",
  "results": [
    {
      "send_id": "send id",
      "ref": 1,
      "status": "scheduled|dry_run|skipped|blocked",
      "operation": "schedule_send|ab_test|none",
      "esp": "configured-esp",
      "segment_id": "segment id",
      "send_at": "ISO timestamp",
      "variants": 2,
      "chosen_variant": "b",
      "reason": "send reason",
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
  "owner": "kelly-campaigns",
  "message": "Drafting sends",
  "started_at": "ISO timestamp"
}
```

While the lock exists the app rejects decision writes (HTTP 423) and renders the queue read-only.

## Warnings

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "send_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```
