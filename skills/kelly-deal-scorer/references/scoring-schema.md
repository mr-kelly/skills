# Deal Scoring Desk — Batch & Rubric Schema

Read this before editing `lib/scoring.ts`, `app/server/*.ts`, or the scripts.

## Batch file (`app/.data/current_batch.json`)

```json
{
  "batch_id": "kelly-deal-scorer-YYYYMMDDTHHMMSS",
  "generated_at": "ISO timestamp",
  "source": "kelly-deal-scorer",
  "mode": "app-in-skill",
  "metrics": { "needs_review": 0, "approved": 0, "done": 0, "blocked": 0 },
  "distribution": {
    "high_confidence": 0,
    "needs_review": 0,
    "low_confidence": 0,
    "average_score": 0
  },
  "items": [
    {
      "id": "cand-001",
      "business_name": "string",
      "category": "F&B|Retail|Fitness|Education",
      "city": "string",
      "requested_principal": 180000,
      "monthly_revenue": [61000, 63500, "... 6-12 entries, oldest -> newest"],
      "red_flags": ["recent_revenue_decline"],
      "status": "needs_review|changes_requested|approved|done|blocked",
      "score": {
        "composite_score": 0,
        "factors": [
          {
            "key": "stability|growth|category_risk|principal_ratio|track_record",
            "label": "string",
            "raw_score": 0,
            "weight": 0.25,
            "contribution": 0,
            "detail": "human-readable arithmetic trace"
          }
        ],
        "suggested_share_rate": { "min_pct": 6, "max_pct": 11 }
      },
      "decision": {
        "action": "approve_term_sheet|send_back_for_data|reject",
        "comment": "string",
        "decided_at": "ISO timestamp"
      }
    }
  ]
}
```

`metrics` mirrors the App-in-Skill workflow states (`needs_review` also counts
`changes_requested`). `distribution` buckets every item's `composite_score`
against the rubric's `decision_thresholds` so the queue header can show
"X high-confidence, Y need review, Z low-confidence" without recomputation on
the client.

## Rubric (`config.json` → `rubric`, defaults in `lib/scoring.ts`)

Five sub-factors, each 0-100 before weighting, weights sum to 1.0:

| Factor | Weight | What it measures | Formula |
| --- | --- | --- | --- |
| `stability` | 0.25 | Revenue volatility | `100 - (stdDev / mean * 100)`, clamped 0-100 |
| `growth` | 0.20 | Trend across the series | `50 + pctChange(last 3mo avg vs first 3mo avg) * 2`, clamped |
| `category_risk` | 0.15 | Vertical risk tier | Fixed lookup table per category |
| `principal_ratio` | 0.25 | Requested principal vs. avg monthly revenue | Piecewise linear: 100 at 0x, 70 at 2x, 40 at 4x, 0 at 8x+ |
| `track_record` | 0.15 | History length + scale | `historyScore*0.6 + scaleScore*0.4`, history capped at 12mo, scale benchmarked at $50k/mo |

`composite_score = round(sum(raw_score * weight))`. Every intermediate number
above is echoed in the item's `factors[].detail` string, so a reviewer can
recompute the score by hand — this rubric is deliberately NOT an LLM or API
call.

Suggested revenue-share rate range is a linear function of `composite_score`
against `rubric.revenue_share_rate.base_min_pct`/`base_max_pct`: stronger
candidates get a lower, tighter band.

## Decision verdicts

- `approve_term_sheet` → item status `approved` (ready for `scripts/execute_decisions.ts` to prepare a term-sheet draft).
- `send_back_for_data` → item status `changes_requested` (the revision loop; re-review once more data arrives).
- `reject` → item status `blocked`.

Write a validator (`scripts/validate_ui_schema.ts`) before trusting a batch file for the UI.
