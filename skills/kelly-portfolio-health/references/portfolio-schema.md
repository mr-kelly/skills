# Portfolio Snapshot Schema

`app/.data/snapshot.json` is the canonical, normalized book the dashboard reads.
It is produced by `scripts/generate_demo_snapshot.ts` in the default (mock)
setup, or by a future live data-provider adapter. Read this before editing the
app, scripts, or a new data-provider implementation.

```json
{
  "schema_version": "1",
  "snapshot_id": "demo-20260601",
  "generated_at": "ISO timestamp",
  "source": "kelly-portfolio-health-demo",
  "base_currency": "USD",
  "fund_name": "Sample RBF Fund I",
  "contracts": [
    {
      "id": "rbf-0001",
      "business_name": "Retail Partner 001",
      "category": "Retail",
      "city": "Riverton",
      "origination_date": "2025-03-01",
      "months_since_origination": 16,
      "expected_term_months": 24,
      "funding_amount": 82000,
      "cap_multiple": 1.28,
      "cap_amount": 104960,
      "cumulative_repayment": 61000,
      "monthly_revenue": [42000, 40500, 39800, 38200, 37000, 35600],
      "status": "active",
      "currency": "USD"
    }
  ]
}
```

## Field notes

- `funding_amount`: principal advanced to the SME (revenue-share advance / private-credit draw).
- `cap_multiple` / `cap_amount`: the total the SME owes back (`funding_amount * cap_multiple`).
- `cumulative_repayment`: collected to date against `cap_amount`.
- `monthly_revenue`: last 6 months of the SME's reported revenue, most recent last. Drives both the repayment rate and the revenue-decline watchlist.
- `status`: `active | completed | delinquent`.

## Derived insights (`snapshot.insights`, computed by `app/server/insights.ts`)

- `totals`: total AUM (funding outstanding on active contracts), total collected, weighted-average repayment progress, at-risk count.
- `progress`: per-contract expected-vs-actual repayment percentage and lag in percentage points, with a `severity` of `ok | watch | high` driven by `risk_policy.lag_watch_pp` / `lag_high_pp`.
- `concentration_by_category` / `concentration_by_city`: funding-amount concentration slices.
- `watchlist`: contracts whose most recent month's revenue dropped more than `risk_policy.revenue_decline_pct` below the average of the prior months.

## Handoff files

- `app/.data/snapshot.json`: the portfolio book (see above).
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/decisions.json`: per-contract `{ flagged, note, updated_at }`, written only by the "flag for review" / "clear flag" / note action in the UI.
- `app/.data/agent.lock`: temporary lock while a sync/seed is in progress.

Run `npm run validate` (`scripts/validate_ui_schema.ts`) before relying on a
snapshot in the UI or before wiring a new data-provider adapter.
