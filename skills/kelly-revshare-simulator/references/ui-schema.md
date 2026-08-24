# Kelly Revenue-Share Simulator Schema

Use this schema when reading or writing Kelly Revenue-Share Simulator's
Busabase Bases. Field slugs are kebab-case in Busabase and normalized to
snake_case in app code (`content/kelly-revshare-simulator-app/app/js/providers/busabase-provider.js`,
`content/kelly-revshare-simulator-app/app/js/simulator-model.js`). `result` (the monthly cash-flow projection,
Cash-Flow Payout Multiple, effective annualized cost, and risk flags) is
computed client-side from a scenario's `scenarios` row on every read — it is
never stored. This is a generic, brand-free dataset: no real company names.

## Scenarios (`kelly-revshare-simulator-scenarios`)

One row per saved revenue-share deal scenario. This is a **control-panel /
workspace** App-in-Skill: each row carries a saved deal scenario rather than
a review queue of externally-sourced items, and the decision field is a
human underwriting verdict rather than an approval of an agent-drafted
action.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `scenario-id` | `scenario_id` (app: `id`) | text | stable domain id, required, e.g. `scn_a1b2c3d4` |
| `name` | `name` | text | human-readable scenario name |
| `business-type` | `business_type` | text | free text, e.g. `Bubble tea retail chain` |
| `avg-monthly-revenue` | `avg_monthly_revenue` | number | analyst estimate |
| `revenue-volatility-pct` | `revenue_volatility_pct` | number | analyst estimate; risk signal only, not a stochastic driver |
| `principal` | `principal` | number | proposed advance |
| `initial-share-rate-pct` | `initial_share_rate_pct` | number | revenue share until breakeven |
| `step-down-share-rate-pct` | `step_down_share_rate_pct` | number | reduced share rate after principal is recovered |
| `repayment-cap-multiple` | `repayment_cap_multiple` | number | `cap_amount = principal * repayment_cap_multiple` |
| `term-months` | `term_months` | number | contract term |
| `decision-action` | `decision_action` | text | `""` (undecided) \| `approve_underwriting` \| `needs_revision` \| `reject` |
| `decision-note` | `decision_note` | longtext | human underwriting note |
| `decided-at` | `decided_at` | text | ISO timestamp, set whenever `decision-action` changes |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp, set on every edit |

Scenarios are created, edited, and deleted directly by the analyst through
the app UI — this is a direct-manipulation control panel, not a
review/approval queue. `records.changeRequest` with `operation: "delete"`
always requires an explicit Busabase review before it merges (`autoMerge` is
rejected server-side for deletes); a standalone local preview reviews and
merges its own delete request immediately, a deployed AirApp leaves it
pending for a human to review directly in Busabase.

## Settings (`kelly-revshare-simulator-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `kelly-revshare-simulator-config` | `config` | `{base_currency, underwriting_policy: {max_effective_annual_cost_pct, min_cap_multiple, max_cap_multiple, max_term_months}}` |

If no `config` row exists, the app falls back to defaults
(`content/kelly-revshare-simulator-app/app/js/simulator-model.js`'s `DEFAULT_POLICY`
`{max_effective_annual_cost_pct: 40, min_cap_multiple: 1.2, max_cap_multiple: 2.5, max_term_months: 36}`,
and `base_currency: "USD"`) — the simulator still functions, just without a
configured underwriting policy summary.

## Derived Result (computed, never stored)

`simulateScenario(input)` in `content/kelly-revshare-simulator-app/app/js/simulator-model.js`, ported
verbatim from the retired `lib/simulate.ts`:

- `monthly[]`: month-by-month revenue (held flat at `avg_monthly_revenue`),
  `share_rate_pct` (steps down from `initial_share_rate_pct` to
  `step_down_share_rate_pct` once cumulative repayment reaches `principal`),
  `payment`, `cumulative_repayment`, `breakeven_reached`, `cap_reached`.
  Simulation stops once `cumulative_repayment` reaches `cap_amount`, or at
  `term_months`, whichever comes first.
- `total_repayment` / `cap_amount`: `cap_amount = principal *
  repayment_cap_multiple`, one internal-consistency guard worth checking
  before relying on a batch.
- `months_to_breakeven` / `months_to_cap`: `null` if never reached within
  `term_months`.
- `cash_flow_payout_multiple`: `principal / ((total_repayment /
  months_elapsed) * 12)` — a P/E-like ratio; a LOW multiple means the funder
  recovers principal faster relative to the annualized cash flow. This does
  NOT by itself mean the deal is cheaper for the merchant — merchant cost is
  `effective_annual_cost_pct`, computed separately.
- `effective_annual_cost_pct`: `((total_repayment / principal) ** (12 /
  months_elapsed) - 1) * 100` — the annualized cost implied by paying back
  `total_repayment` over `months_elapsed`, expressed like an APR.
- `risk_flags[]`: deterministic, rule-based, neutral observations for a
  human underwriter — never automated approve/reject decisions.
  - `cap_not_reached` (`high`): the cap is never reached within the term.
  - `merchant_cost_too_high` (`high`): `effective_annual_cost_pct` exceeds
    40%.
  - `high_revenue_volatility` (`watch`): `revenue_volatility_pct` is 30% or
    higher.
  - `thin_term_buffer` (`watch`): the cap is reached at or within one month
    of the end of the term.

No randomness, no external calls — the same scenario input always produces
the same result.

## Direct Scenario Writes

There is no decisions/approval bucket. Every scenario action writes straight
onto Busabase via `content/kelly-revshare-simulator-app/app/js/providers/busabase-provider.js`:

- **Create**: `bases.createChangeRequest` with a new `scenario-id`.
- **Update** (edit inputs, rename): `records.changeRequest` with
  `operation: "update"`.
- **Record underwriting decision**: `records.changeRequest` with
  `operation: "update"`, setting only
  `decision-action`/`decision-note`/`decided-at`.
- **Delete**: `records.changeRequest` with `operation: "delete"`.

`autoMerge` = `isStandaloneLocalRuntime()` for create/update/decision writes:
local preview merges immediately (trusted operator), deployed AirApp creates
a pending ChangeRequest for the trusted process to merge, per the AirApp
boundary. Delete always requires review server-side regardless of
`autoMerge`; on a standalone local preview the app calls
`changeRequests.review` (`verdict: "approved"`) then `changeRequests.merge`
immediately after submitting the delete request, so the trusted local
operator's own click completes the deletion in one step.
