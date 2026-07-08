# Kelly Ads Snapshot Schema

Use this schema for `app/.data/ads_snapshot.json`. Keep the shape stable so the local app, scripts, and future connectors can evolve independently. Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-ads",
  "currency": "USD",
  "range": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "targets": { "acos_target_pct": 25, "roas_target": 4 },
  "metrics": {},
  "platforms": [],
  "campaigns": [],
  "anomalies": [],
  "adjustments": [],
  "sync_log": [],
  "warnings": []
}
```

All money amounts are decimal numbers in the snapshot base `currency`; `scripts/ingest_reports.ts` normalizes other currencies via `config.currency_rates` at ingest time.

## Metrics

Recomputed by `recomputeDerived()` in `app/server/store.ts` (shared by all write-path scripts). Do not hand-edit except `spend_last_month`, which comes from the ingest payload.

```json
{
  "spend_mtd": 0,
  "spend_last_month": 0,
  "revenue_mtd": 0,
  "spend_14d": 0,
  "revenue_14d": 0,
  "blended_roas": 0,
  "blended_acos_pct": 0,
  "acos_target_pct": 25,
  "conversions_14d": 0,
  "campaigns_total": 0,
  "campaigns_active": 0,
  "anomalies_open": 0,
  "anomalies_critical": 0,
  "adjustments_needing_review": 0,
  "budget_at_risk_today": 0
}
```

## Platform

```json
{
  "platform_id": "amazon|meta|tiktok|google",
  "name": "Amazon Ads US",
  "account_id": "display-safe account id",
  "status": "ok|warning|error",
  "currency": "USD",
  "last_sync_at": "ISO timestamp",
  "campaign_count": 0,
  "spend_14d": 0,
  "revenue_14d": 0,
  "conversions_14d": 0,
  "roas": 0,
  "acos_pct": 0
}
```

Rollup fields (`campaign_count` and below) are recomputed from campaigns.

## Campaign

```json
{
  "campaign_id": "stable local id",
  "platform": "amazon|meta|tiktok|google",
  "name": "SP Manual — Lunchbox Keywords",
  "product": "optional product name",
  "sku": "optional SKU",
  "status": "active|paused|rejected",
  "daily_budget": 45,
  "budget_spent_today_pct": 88,
  "acos_target_pct": 25,
  "currency": "USD",
  "daily": [
    { "date": "YYYY-MM-DD", "spend": 0, "impressions": 0, "clicks": 0, "conversions": 0, "revenue": 0 }
  ],
  "targets": [],
  "totals_7d": { "spend": 0, "impressions": 0, "clicks": 0, "conversions": 0, "revenue": 0, "roas": 0, "acos_pct": 0, "cpc": 0 },
  "trend": "up|down|flat",
  "last_sync_at": "ISO timestamp"
}
```

`daily` is keyed by date: re-ingesting the same date replaces the row (idempotent). `totals_7d` and `trend` are derived.

## Target (search term / audience / creative / asset group)

```json
{
  "target_id": "stable local id (unique across the snapshot)",
  "type": "search_term|audience|creative|asset_group",
  "text": "lunch box kids",
  "match_type": "broad|phrase|exact|auto|",
  "state": "enabled|paused|negative|rejected",
  "spend_14d": 142.0,
  "clicks": 86,
  "conversions": 0,
  "revenue": 0,
  "cpc": 1.65,
  "acos_pct": 0
}
```

## Anomaly

```json
{
  "anomaly_id": "anm-<type>-<campaign_id>[-<target_id>]",
  "type": "acos_breach|budget_exhausted|zero_conversion_spend|cpc_spike|rejected",
  "severity": "critical|warning|info",
  "state": "open|actioned|dismissed|resolved",
  "campaign_id": "campaign id",
  "platform": "amazon|meta|tiktok|google",
  "target_id": "optional target id",
  "evidence": "one-line, numeric evidence",
  "detected_at": "ISO timestamp of the latest check",
  "first_seen_at": "ISO timestamp of the first detection",
  "adjustment_id": "optional linked adjustment"
}
```

Anomaly ids are stable so `run_checks.ts` can upsert: re-detection updates `evidence`/`detected_at`, a cleared condition flips `open|actioned` to `resolved`, and `dismissed` stays dismissed.

## Adjustment

```json
{
  "adjustment_id": "stable local id",
  "ref": 1,
  "type": "negative_keyword|bid_down|bid_up|pause_target|budget_shift|creative_refresh",
  "title": "human-readable proposal",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "campaign_id": "campaign id",
  "platform": "amazon|meta|tiktok|google",
  "target": { "kind": "term|campaign|creative|budget", "id": "target or campaign id", "text": "display text" },
  "current_value": "current state, human-readable",
  "proposed_value": "proposed state, human-readable",
  "reason": "why the agent proposes this",
  "evidence": ["numeric evidence lines"],
  "expected_impact": "estimated effect on spend/ACOS/ROAS",
  "anomaly_id": "optional source anomaly",
  "note": "editable review note",
  "created_at": "ISO timestamp",
  "decision": { "verdict": "approve|request_changes|block|note", "note": "", "decided_at": "ISO timestamp" },
  "execution": { "status": "executed", "operation": "add_negative_keyword|set_bid|pause_target|shift_budget|refresh_creative", "target": {}, "detail": "", "executed_at": "ISO timestamp" }
}
```

`ref` is a stable, unique per-snapshot number so chat can reference `Adjustment #2`. `status: "done"` requires an `execution` record (written after the agent executes the approved operation outside the app). `decision` and `execution` are `null` until they exist.

## Sync Log Entry

```json
{
  "sync_id": "sync-<platform>-<date>",
  "at": "ISO timestamp",
  "platform": "amazon|meta|tiktok|google or empty",
  "kind": "ingest|checks|execution",
  "message": "short human-readable line",
  "rows": 14
}
```

## Warning

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "campaign_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```

## Sibling files

- `app/.data/decisions.json`: `{ "updated_at": "...", "decisions": { "<adjustment_id>": { "verdict": "...", "note": "...", "decided_at": "..." } } }`
- `app/.data/agent_tasks.json`: `{ "updated_at": "...", "tasks": [ { "task_id": "...", "adjustment_id": "...", "type": "...", "title": "...", "request": "...", "status": "queued", "created_at": "..." } ] }` — written on `request_changes`; the agent polls it, revises the card, sets it back to `needs_review`, and clears the task.
- `app/.data/execution_report.json`: dry-run plan from `scripts/execute_decisions.ts`; every entry carries `dry_run: true` and `handoff_to_agent: true`.
- `app/.data/onboarding.json`: `{ "completed": true, "completed_at": "...", "config_version": "..." }`.
- `app/.data/agent.lock`: `{ "owner": "...", "message": "...", "started_at": "..." }` — write endpoints return HTTP 423 while it exists.
