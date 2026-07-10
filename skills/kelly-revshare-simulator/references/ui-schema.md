# Scenario Batch Schema

`app/.data/scenarios.json` is the file handoff between the deal analyst (via
the app) and anyone reading the underwriting outcome later. This is a
**control-panel / workspace** App-in-Skill: the "batch" carries saved deal
scenarios rather than a review queue of externally-sourced items, and the
decision field is a human underwriting verdict rather than an approval of an
agent-drafted action.

```json
{
  "batch_id": "seed-2026-07-10",
  "generated_at": "ISO timestamp",
  "source": "kelly-revshare-simulator",
  "mode": "app-in-skill",
  "metrics": {
    "total": 4,
    "approved": 1,
    "needs_revision": 1,
    "rejected": 1,
    "undecided": 1
  },
  "scenarios": [
    {
      "id": "stable local id",
      "name": "human-readable scenario name",
      "created_at": "ISO timestamp",
      "updated_at": "ISO timestamp",
      "input": {
        "business_type": "free text, e.g. Bubble tea retail chain",
        "avg_monthly_revenue": 420000,
        "revenue_volatility_pct": 18,
        "principal": 250000,
        "initial_share_rate_pct": 6,
        "step_down_share_rate_pct": 3,
        "repayment_cap_multiple": 1.4,
        "term_months": 18
      },
      "result": {
        "monthly": [
          {
            "month": 1,
            "revenue": 420000,
            "share_rate_pct": 6,
            "payment": 25200,
            "cumulative_repayment": 25200,
            "breakeven_reached": false,
            "cap_reached": false
          }
        ],
        "total_repayment": 350000,
        "cap_amount": 350000,
        "months_to_breakeven": 10,
        "months_to_cap": 14,
        "cash_flow_payout_multiple": 1.19,
        "effective_annual_cost_pct": 27.4,
        "risk_flags": [
          {
            "code": "cap_not_reached",
            "severity": "high",
            "message": "..."
          }
        ]
      },
      "decision": {
        "action": "approve_underwriting",
        "note": "human note",
        "decided_at": "ISO timestamp"
      }
    }
  ]
}
```

## Field notes

- `input.avg_monthly_revenue`, `input.revenue_volatility_pct`, and every rate
  field are **estimates the analyst supplies**; the simulator never fetches
  live revenue data.
- `result` is fully derived from `input` by `lib/simulate.ts` — deterministic,
  no randomness, no external calls. `scripts/validate_ui_schema.ts` checks
  that `result.cap_amount == input.principal * input.repayment_cap_multiple`
  as one internal-consistency guard.
- `decision.action` is one of `approve_underwriting`, `needs_revision`,
  `reject`, or `null` (undecided). This mirrors the review-model verdict
  vocabulary (`approve` / `request_changes` / `block`) adapted to an
  underwriting decision rather than a content-review decision.
- Risk flag codes: `cap_not_reached`, `merchant_cost_too_high`,
  `high_revenue_volatility`, `thin_term_buffer`. These are neutral,
  rule-based observations for a human underwriter — never automated
  approve/reject decisions.

Write a validator (`scripts/validate_ui_schema.ts`) before relying on this
schema for any downstream export.
