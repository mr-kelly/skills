# Kelly Brand Schema

Use this schema for the handoff files under `app/.data/`. Keep the shapes stable so the local app, scripts, and the skill can evolve independently. Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

Everything is organized around the **TALE** framework — every narrative asset carries a `phase` (`trace` / `architect` / `land` / `evaluate`) and a `sub_skill` naming which of the 16 TALE sub-skills produced it.

## Snapshot (`brand_snapshot.json`)

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-brand",
  "brand_name": "Fernpath",
  "framework": "TALE",
  "positioning": {
    "statement": "the canonical or draft positioning statement",
    "status": "needs_review|approved|...",
    "item_id": "positioning-core"
  },
  "metrics": {
    "item_count": 0,
    "canonical_count": 0,
    "needs_review_count": 0,
    "pillar_count": 0,
    "story_count": 0,
    "proof_point_count": 0,
    "overall_nqs": 0,
    "drift_open_count": 0
  },
  "items": [],
  "drift_alerts": [],
  "warnings": []
}
```

`overall_nqs` is the mean Narrative Quality Score across scored items. The overview derives an overall gate from it: `>=80` SHIP, `>=55` FIX, else BLOCK.

## Narrative asset (`items[]`)

The review-queue items. `status` uses the standard workflow states; `approved` means **adopted into the canonical narrative**.

```json
{
  "item_id": "stable local id",
  "ref": 1,
  "type": "positioning|message_pillar|story|proof_point|vocabulary|guardrail",
  "phase": "trace|architect|land|evaluate",
  "sub_skill": "one of the 16 TALE sub-skills, e.g. message-system-architect",
  "title": "human-readable title",
  "draft": "editable body — the pillar statement, the customer story, the vocab list, etc.",
  "nqs": { "score": 88, "gate": "SHIP|FIX|BLOCK" },
  "evidence": {
    "source": "named source (proof points only; null otherwise)",
    "stat": "the supporting statistic",
    "url": "optional source link"
  },
  "risk": ["claim"],
  "status": "needs_review|changes_requested|approved|done|blocked",
  "reason": "why the agent drafted this / what to check",
  "created_at": "ISO timestamp"
}
```

- `nqs` may be `null` before the narrative-quality-auditor has scored the asset. When present, `score` is 0–100 and `gate` is SHIP/FIX/BLOCK.
- `evidence` is required-in-spirit for `proof_point` items; a proof point with `evidence: null` should be `blocked` by the NQS gate until a source is cited (see the demo's `proof-waste-claim`).
- `ref` is a stable per-batch row number so chat comments like "adopt #2" resolve unambiguously. Never renumber refs when regenerating; retire ids instead.

## Drift alert (`drift_alerts[]`)

Cross-channel off-brand usage flagged by the narrative-drift-monitor.

```json
{
  "alert_id": "stable local id",
  "channel_id": "configured channel id, e.g. website",
  "title": "short human-readable summary",
  "offending_usage": "the off-brand copy as it appears on the channel",
  "guardrail_item_id": "the canonical guardrail/vocab item it violates",
  "canonical_guidance": "what the canonical narrative says to do instead",
  "status": "open|resolved|dismissed",
  "severity": "high|medium|low",
  "detected_at": "ISO timestamp"
}
```

## Decisions (`decisions.json`)

Written by the app; read by the skill and `scripts/execute_decisions.ts`. Keyed by `item_id` (for narrative assets) or `alert_id` (for drift alerts).

```json
{
  "updated_at": "ISO timestamp",
  "decisions": {
    "<item_id or alert_id>": {
      "action": "approve|request_changes|block|revise|resolve_drift|dismiss_drift",
      "comment": "review note",
      "draft": "optional user-edited draft; when present it replaces the item draft",
      "decided_at": "ISO timestamp"
    }
  }
}
```

A decision decided after `generated_at` overrides the snapshot status in the UI: `approve` → `approved` (canonical), `request_changes` → `changes_requested`, `block` → `blocked`; `resolve_drift` → `resolved`, `dismiss_drift` → `dismissed`.

## Agent tasks (`agent_tasks.json`)

Queued agent work. The skill polls this to pick up revisions.

```json
{
  "updated_at": "ISO timestamp",
  "tasks": [
    {
      "task_id": "task-<item_id>-<ms>",
      "type": "revise_narrative",
      "item_id": "item id",
      "comment": "what the user asked to change",
      "requested_at": "ISO timestamp",
      "status": "queued"
    }
  ]
}
```

## Execution report (`execution_report.json`)

Written by `scripts/execute_decisions.ts`. Records concrete operations only; no external side effects happen here.

```json
{
  "executed_at": "ISO timestamp",
  "dry_run": false,
  "source": "kelly-brand",
  "results": [
    {
      "item_id": "item or alert id",
      "ref": 1,
      "status": "promoted|resolved|dry_run|skipped",
      "operation": "promote_to_canonical|resolve_drift|export_narrative",
      "registry": "narrative",
      "channel": "optional channel id",
      "target": "canonical/positioning/positioning-core",
      "comment": "review note",
      "reason": "why",
      "executed_at": "ISO timestamp"
    }
  ]
}
```

Execution semantics:

- `operation: promote_to_canonical, registry: narrative` — adopt an approved asset into the canonical brand narrative.
- `operation: export_narrative, format: markdown, path: …` — write the canonical narrative to a file for downstream use.
- `operation: resolve_drift, alert_id: …` — record that an off-brand usage has been fixed.

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
  "owner": "kelly-brand",
  "message": "Drafting narrative assets",
  "started_at": "ISO timestamp"
}
```

While the lock exists the app rejects decision writes (HTTP 423) and renders the workbench read-only.

## Warnings

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "item_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```
