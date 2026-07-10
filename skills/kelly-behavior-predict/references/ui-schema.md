# Predictive Recommendation Analytics Desk — Data Schema

Use this schema for `app/.data/dataset.json` (written by `scripts/generate_batch.ts`,
built from `lib/dataset.ts`) and `app/.data/decisions.json` (the human review
handoff file). Keep the shape stable so the app, scripts, and `lib/` can
evolve independently. This is a **dashboard** app type: read-mostly, with one
narrow human-review surface (the trusted / needs-recalibration decision) — not
a full review-queue lifecycle.

## Dataset (`app/.data/dataset.json`)

```json
{
  "schema_version": "1",
  "seed": "predictive-recommendation-analytics-desk-v1",
  "generated_at_note": "human-readable note",
  "overall_funnel": { "...": "FunnelCounts, see below" },
  "overall_backtest": { "...": "BacktestSummary, see below" },
  "segments": [ { "...": "SegmentDatasetEntry, see below" } ]
}
```

Regenerate any time with `node scripts/generate_batch.ts [seed]`. The dataset
is 100% deterministic: the same seed always produces byte-identical output
(verified with `md5sum` in this skill's own test run).

### FunnelStage

`"browse" | "search" | "compare" | "booking_attempt" | "complete"` — a fixed,
ordered mock consumer booking funnel.

### FunnelCounts

```json
{
  "segment_id": "price_sensitive_browser | \"overall\"",
  "stage_counts": { "browse": 60, "search": 36, "compare": 22, "booking_attempt": 5, "complete": 3 },
  "drop_off_pct": { "search": 40.0, "compare": 38.9, "booking_attempt": 77.3, "complete": 40.0 }
}
```

`stage_counts[stage]` = sessions that reached at least that stage.
`drop_off_pct[stage]` = `(stage_counts[prev] - stage_counts[stage]) / stage_counts[prev] * 100`.

### SegmentDatasetEntry

```json
{
  "segment_id": "price_sensitive_browser",
  "session_count": 60,
  "funnel": { "...": "FunnelCounts for this segment" },
  "prediction_summary": {
    "segment_id": "price_sensitive_browser",
    "dominant_action": "recommend_similar_items",
    "action_distribution": { "send_discount_offer": 18, "show_urgency_banner": 9, "recommend_similar_items": 33, "send_reminder_email": 0, "no_action_needed": 0 },
    "sample_triggers": [ { "code": "...", "description": "...", "matched": false } ]
  },
  "backtest": { "...": "BacktestSummary for this segment" },
  "sessions": [ { "...": "SessionResult, see below" } ]
}
```

### SessionResult (mock, one row per synthetic session)

```json
{
  "session_id": "price_sensitive_browser-001",
  "segment_id": "price_sensitive_browser",
  "session_length": 6.4,
  "cart_abandon_count": 2,
  "price_check_count": 7,
  "days_since_last_visit": 1,
  "coupon_clicks": 3,
  "reached_stage": "compare",
  "predicted_action": "recommend_similar_items",
  "actual_action": "send_discount_offer",
  "triggers": [ { "...": "RuleTrigger" } ]
}
```

`predicted_action` comes from the deterministic rule in `lib/predict.ts` (see
that file's header comment for the exact if/else priority order — every
prediction is hand-recomputable from the four `session_length` /
`cart_abandon_count` / `price_check_count` / `days_since_last_visit` inputs
plus `reached_stage`). `actual_action` is a seeded mock "ground truth" (see
`lib/sessions.ts`) used only to make the backtest view non-trivial; it is not
real outcome data.

### BacktestSummary

```json
{
  "segment_id": "price_sensitive_browser | \"overall\"",
  "total": 60,
  "correct": 48,
  "accuracy": 0.8,
  "per_action": [
    { "action": "send_discount_offer", "true_positive": 44, "false_positive": 17, "false_negative": 8, "precision": 0.721, "recall": 0.846, "f1": 0.779, "support": 52 }
  ],
  "macro_precision": 0.68,
  "macro_recall": 0.7,
  "macro_f1": 0.69
}
```

Computed deterministically in `lib/backtest.ts` by comparing `predicted_action`
against `actual_action` for every session — a standard multi-class confusion
matrix with per-action precision/recall/F1 and macro averages.

## Decisions (`app/.data/decisions.json`)

The one human-review surface in this dashboard: mark a segment's prediction
rule "trusted" or "needs recalibration" with a note. Purely a local review
record — it never changes the rule, the dataset, or any live system.

```json
{
  "price_sensitive_browser": {
    "status": "trusted | needs_recalibration",
    "note": "free-text reviewer note",
    "decided_at": "ISO timestamp"
  }
}
```

Keyed by `segment_id`; one entry per segment that has been reviewed. Written
only via `POST /api/segments/:id/decision`.

## Validation

Run `node scripts/validate_ui_schema.ts [path/to/dataset.json]` before relying
on a dataset in the UI. It checks required fields/types, that
`backtest.total === session_count`, that `sessions.length === session_count`,
and that per-segment `browse` counts sum to the overall funnel's `browse`
count.
