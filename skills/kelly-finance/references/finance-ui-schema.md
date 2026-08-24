# Kelly Finance Schema

Use this schema when reading or writing Kelly Finance's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/kelly-finance-app/app/js/providers/busabase-provider.js`,
`content/kelly-finance-app/app/js/finance-model.js`). The needs_review/approved/done/blocked
*counts* shown on the dashboard are computed client-side from the `checks`
Base on every read — they are never stored. A check's own `status` is
different: it IS stored directly, set by the reviewer's decision action.

Check statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `dismiss`.

## Model (`kelly-finance-model`)

One row per model run — in practice usually just the current run,
`model-id` `current`. Written by `scripts/build_three_statement_model.mjs`
after the Python starter-model script runs, or by an agent that has reviewed
a real workbook and knows the real computed figures.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `model-id` | `model_id` | text | stable id, required — `"current"` for the active model |
| `snapshot-id` | `snapshot_id` | text | stable id for this model run |
| `generated-at` | `generated_at` | text | ISO timestamp |
| `source` | `source` | text | `demo\|local` |
| `company` | `company` | text | |
| `currency` | `currency` | text | e.g. `USD` |
| `display-unit` | `display_unit` | text | `units\|thousands\|millions` |
| `model-purpose` | `model_purpose` | text | e.g. "Five-year fundraising forecast" |
| `periods` | `periods` | longtext | JSON array of `{label, revenue, gross_profit, ebitda, net_income, ending_cash, total_assets, free_cash_flow}` |
| `revenue-cagr` | `revenue_cagr` | number | headline metric, carried through from the row as written — not recomputed on read unless supplied by `deriveModelMetrics()` at build time |
| `ending-cash` | `ending_cash` | number | headline metric |
| `free-cash-flow` | `free_cash_flow` | number | headline metric |
| `balance-check` | `balance_check` | number | headline metric; `0` means every period ties |
| `warnings` | `warnings` | longtext | JSON array of warning strings |
| `workbook-path` | `workbook_path` | text | local path to the generated `.xlsx` |
| `workbook-tabs` | `workbook_tabs` | longtext | JSON array of tab names, e.g. `["Assumptions","Income Statement","Balance Sheet","Cash Flow","Checks"]` |

## Checks (`kelly-finance-checks`)

One row per model-audit check (formula ties, model-quality issues, delivery
notes) — the raw check fields plus the reviewer's decision, written directly
onto the same row.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `check-id` | `check_id` | text | stable id, required |
| `title` | `title` | text | |
| `summary` | `summary` | text | |
| `severity` | `severity` | text | `info\|warning\|critical` |
| `status` | `status` | text | workflow status; stored directly, set by the decision action |
| `check-type` | `check_type` | text | e.g. `statement_tie`, `formula_review`, `cash_flow_tie`, `schedule_tie`, `model_quality` |
| `evidence` | `evidence` | longtext | JSON array of short evidence lines |
| `proposed-action` | `proposed_action` | text | |
| `draft` | `draft` | longtext | editable recommendation or delivery note |
| `decision-action` | `decision_action` | text | written with the verdict |
| `decision-comment` | `decision_comment` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | ISO timestamp, written with the verdict |
| `execution-status` | `execution_status` | text | `written\|skipped`, written by `scripts/execute_decisions.mjs` |
| `execution-detail` | `execution_detail` | text | written by `scripts/execute_decisions.mjs` |
| `executed-at` | `executed_at` | text | ISO timestamp, written by `scripts/execute_decisions.mjs` |

## Settings (`kelly-finance-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `config` | `config` | `{company: {name, base_currency}, model_defaults: {horizon_years, base_revenue, revenue_growth, gross_margin, opex_percent_revenue, capex_percent_revenue}}` — non-secret only |

## Decisions

A human verdict writes `status`, `decision-action`, `decision-comment`, and
`decided-at` directly onto the check record — `draft` is also updated if the
reviewer edited it. There is no separate decisions file: the check record is
the single source of truth for both the draft and its review state.

## Model Metrics (simple derived math, never real modeling logic)

`deriveModelMetrics(periods)` in `content/kelly-finance-app/app/js/finance-model.js` computes
`revenue_cagr` (CAGR across the first/last period), `ending_cash`, and
`free_cash_flow` (the last period's own values) from an already-computed
`periods` array. This is universally-defined arithmetic, not a
reimplementation of the real three-statement modeling math (balance-sheet
balancing, schedule amortization) that `scripts/build_three_statement_model.py`
owns — `balance_check` is never recomputed client-side and must come from an
actual balance-sheet computation.

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step. Reads `checks` with `status: "approved"`, and with
`--apply` writes `execution-status: "written"`, `execution-detail`, and
`executed-at` back onto each (`"skipped"` for every other status — no field
write happens for those). It performs no export, filing, or transmission
itself — any real external action (sending a model to investors, changing
source-of-truth books) is a separate, explicitly authorized step outside
this skill.
