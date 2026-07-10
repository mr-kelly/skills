# Lead Schema — Deal Sourcing Funnel

Canonical shape of `app/.data/leads.json`: a flat array of leads. Read
`lib/types.ts` for the authoritative TypeScript types (`Lead`, `ScoreFactor`,
`StageChange`, `Note`).

```json
[
  {
    "id": "lead-001",
    "brand_name": "Golden Wok Kitchens",
    "category": "food_beverage",
    "city": "Austin",
    "store_count": 18,
    "est_monthly_revenue": 640000,
    "lead_source": "outbound_sourcing",
    "data_verifiable": true,
    "stage": "term_sheet_ready",
    "score": 87,
    "score_breakdown": [
      {
        "factor": "chain_size_fit",
        "weight": 30,
        "contribution": 30,
        "rationale": "18 stores is within the ideal 5-150 chain-size band."
      }
    ],
    "suggested_action": "hand_off_to_underwriting",
    "rejection_reason": null,
    "notes": [
      { "id": "note-1-1", "text": "Strong POS data.", "author": "sourcing-team", "created_at": "..." }
    ],
    "stage_history": [
      { "from": null, "to": "new", "at": "..." },
      { "from": "new", "to": "term_sheet_ready", "at": "..." }
    ],
    "created_at": "...",
    "updated_at": "..."
  }
]
```

## Fields

- `category`: one of `food_beverage | retail_discretionary | services | healthcare | ecommerce | other`.
- `lead_source`: one of `referral | inbound_web | outbound_sourcing | event | partner`.
- `stage` (funnel order): `new -> data_verified -> scored -> term_sheet_ready`; `rejected` is a terminal stage reachable from any prior stage.
- `score`: 0-100, always the sum of `score_breakdown[].contribution`. Computed by `lib/scoring.ts` — a deterministic rule-based function, **never an LLM call**.
- `score_breakdown`: exactly 4 factors whose `weight` values sum to 100 — `chain_size_fit` (30), `revenue_scale_fit` (30), `category_risk` (25), `data_verifiability` (15).
- `suggested_action`: one of `advance_to_term_sheet | request_data_verification | advance_to_scored | flag_for_reject_review | hand_off_to_underwriting | closed_no_action`.
- `rejection_reason`: required once `stage` is `rejected`.
- `notes` / `stage_history`: append-only local handoff logs written by human actions in the app (move stage, reject with reason, add note). Every write also appends an entry to `app/.data/handoff_log.json`.

## Funnel summary

`GET /api/state` also returns `summary` (`lib/funnel-summary.ts`): per-stage
counts, `conversion_from_new_pct` per stage, `overall_conversion_pct` (New →
Term-Sheet-Ready), and `rejection_rate_pct`. Pure/derived — never stored.

Run `scripts/validate_ui_schema.ts app/.data/leads.json` before relying on a
seeded file in the UI; it checks required fields, enum values, weight sums,
and rejection-reason consistency.
