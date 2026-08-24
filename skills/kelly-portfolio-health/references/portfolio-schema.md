# Kelly Portfolio Health Schema

Use this schema when reading or writing Kelly Portfolio Health's Busabase
Bases. Field slugs are kebab-case in Busabase and normalized to snake_case
in app code (`content/kelly-portfolio-health-app/app/js/providers/busabase-provider.js`,
`content/kelly-portfolio-health-app/app/js/portfolio-model.js`). `insights` (totals, per-contract repayment
lag, concentration, and the revenue-decline watchlist) is computed
client-side from the `contracts` rows on every read — it is never stored.
This is a generic, brand-free dataset: no real company, fund, or SME names.

## Contracts (`kelly-portfolio-health-contracts`)

One row per RBF (revenue-based-financing) / private-credit contract.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `contract-id` | `contract_id` (app: `id`) | text | stable domain id, required, e.g. `rbf-0001` |
| `business-name` | `business_name` | text | required, the SME's (generic, brand-free) name |
| `category` | `category` | text | industry/category, e.g. `Retail` |
| `city` | `city` | text | |
| `origination-date` | `origination_date` | text | ISO date the advance was funded |
| `months-since-origination` | `months_since_origination` | number | drives `expected_pct` |
| `expected-term-months` | `expected_term_months` | number | expected repayment term |
| `funding-amount` | `funding_amount` | number | principal advanced |
| `cap-multiple` | `cap_multiple` | number | `cap_amount = funding_amount * cap_multiple` |
| `cap-amount` | `cap_amount` | number | total the SME owes back |
| `cumulative-repayment` | `cumulative_repayment` | number | collected to date against `cap_amount` |
| `monthly-revenue` | `monthly_revenue` | longtext | JSON array, last 6 months, most recent last; drives the repayment rate and the revenue-decline watchlist |
| `status` | `status` | text | `active\|completed\|delinquent` |
| `currency` | `currency` | text | ISO currency code |
| `flagged` | `flagged` | text | `"true"\|"false"` (Busabase has no boolean field type); the human "flag for review" action |
| `note` | `note` | longtext | human review note |
| `decision-updated-at` | `decision_updated_at` | text | ISO timestamp, set whenever `flagged`/`note` changes |

Contracts enter Busabase through an external portfolio-sync process — the
AirApp never creates a contract record, only updates an existing one's
`flagged`/`note`/`decision-updated-at` fields, the same way
`kelly-llm-gateway`'s routes and `kelly-lead-funnel`'s leads enter through an
upstream process the app doesn't control.

## Settings (`kelly-portfolio-health-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `kelly-portfolio-health-config` | `config` | `{base_currency, fund_name, risk_policy: {lag_watch_pp, lag_high_pp, revenue_decline_pct}}` |

If no `config` row exists, the app falls back to defaults
(`content/kelly-portfolio-health-app/app/js/portfolio-model.js`'s `DEFAULT_RISK_POLICY`
`{lag_watch_pp: 15, lag_high_pp: 25, revenue_decline_pct: 10}`, and
`base_currency: "USD"`, `fund_name: "Sample RBF Fund"`) — the dashboard
still functions, just without a configured fund summary.

## Derived Insights (computed, never stored)

`computeInsights(contracts, riskPolicy)` in `content/kelly-portfolio-health-app/app/js/portfolio-model.js`:

- `totals`: total AUM (funding outstanding on active — non-`completed` —
  contracts), total collected, weighted-average repayment progress, and an
  at-risk contract count (any non-`ok` lag severity, or `status:
  delinquent`).
- `progress`: per-contract `expected_pct` (months elapsed / term, capped at
  100), `actual_pct` (collected / cap), `lag_pp = expected_pct - actual_pct`,
  and a `severity` of `ok | watch | high` driven by
  `risk_policy.lag_watch_pp` / `lag_high_pp`.
- `concentration_by_category` / `concentration_by_city`: funding-amount
  concentration slices over active contracts, each as a percentage of active
  AUM (`concentration_by_city` capped to the top 8).
- `watchlist`: contracts with at least 4 months of `monthly_revenue` history
  whose most recent month is at least `risk_policy.revenue_decline_pct`
  below the average of the prior months, sorted worst-decline-first.

No randomness, no ML — the same snapshot always produces the same insights.

## Direct Contract Decision

There is no decisions/approval bucket. The human flag/clear-flag/note action
writes straight onto the contract's own record via `records.changeRequest`
(`decideContract(contractId, patch)` in
`content/kelly-portfolio-health-app/app/js/providers/busabase-provider.js`, using
`applyContractDecision` from `portfolio-model.js`):

- **Flag for review** / **Clear flag**: sets `flagged` (`"true"`/`"false"`).
- **Save note**: sets `note` (free text).

Both stamp `decision-updated-at` with the current time; whichever of
`flagged`/`note` is not part of the patch keeps its previous value. From a
standalone local preview the write merges immediately (trusted operator);
from the deployed AirApp it creates a pending ChangeRequest for the trusted
process to merge, per the AirApp boundary in `$busabase-app-creator`.
