# Kelly Ads Schema

Use this schema when reading or writing Kelly Ads' Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`app/app/js/providers/busabase-provider.js`, `app/app/js/ads-model.js`).
Campaign totals (`totals_7d`, `trend`), platform rollups (`spend_14d`,
`revenue_14d`, `roas`, `acos_pct`), and top-level `metrics` are computed
client-side from the `campaigns` Base on every read — they are never stored.

Workflow statuses (adjustments): `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision verdicts: `approve`, `request_changes`, `block`, `note`.

Anomaly states: `open`, `actioned`, `dismissed`, `resolved`.

## Platforms (`kelly-ads-platforms-v1`)

The connected ad-platform roster. Rollup fields below are recomputed client-side from `campaigns`, never stored here.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `platform-id` | `platform_id` | text | `amazon\|meta\|tiktok\|google`, required |
| `name` | `name` | text | display name, e.g. `Amazon Ads US` |
| `account-id` | `account_id` | text | display-safe account id |
| `status` | `status` | text | `ok\|warning\|error` |
| `currency` | `currency` | text | |
| `last-sync-at` | `last_sync_at` | text | ISO timestamp, written by `scripts/ingest_reports.mjs` |

## Campaigns (`kelly-ads-campaigns-v1`)

One row per campaign. `daily` and `targets` are JSON-encoded (Busabase has no array field type).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `campaign-id` | `campaign_id` | text | stable domain id, required |
| `platform` | `platform` | text | `amazon\|meta\|tiktok\|google` |
| `name` | `name` | text | |
| `product` | `product` | text | optional product name |
| `sku` | `sku` | text | optional SKU |
| `status` | `status` | text | `active\|paused\|rejected` |
| `daily-budget` | `daily_budget` | number | |
| `budget-spent-today-pct` | `budget_spent_today_pct` | number | |
| `acos-target-pct` | `acos_target_pct` | number | resolved once at ingest; falls back through per-product/per-platform/default if unset |
| `currency` | `currency` | text | |
| `daily` | `daily` | longtext | JSON array of `{date, spend, impressions, clicks, conversions, revenue}`, keyed by date — re-ingesting the same date replaces the row (idempotent) |
| `targets` | `targets` | longtext | JSON array of search-term/audience/creative/asset-group rows: `{target_id, type, text, match_type, state, spend_14d, clicks, conversions, revenue, cpc, acos_pct}` |
| `last-sync-at` | `last_sync_at` | text | ISO timestamp |

`totals_7d` (`{spend, impressions, clicks, conversions, revenue, roas, acos_pct, cpc}`) and `trend` (`up\|down\|flat`) are derived from `daily` by `totalsForDays()`/`trendFor()` on every read.

## Anomalies (`kelly-ads-anomalies-v1`)

Deterministic anomaly feed, upserted by `scripts/run_checks.mjs` with stable ids so re-detection refreshes evidence instead of duplicating.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `anomaly-id` | `anomaly_id` | text | `anm-<type>-<campaign_id>[-<target_id>]`, required |
| `type` | `type` | text | `acos_breach\|budget_exhausted\|zero_conversion_spend\|cpc_spike\|rejected` |
| `severity` | `severity` | text | `critical\|warning\|info` |
| `state` | `state` | text | `open\|actioned\|dismissed\|resolved` |
| `campaign-id` | `campaign_id` | text | |
| `platform` | `platform` | text | |
| `target-id` | `target_id` | text | optional |
| `evidence` | `evidence` | longtext | one-line, numeric evidence (plain text, not JSON) |
| `detected-at` | `detected_at` | text | ISO timestamp of the latest check |
| `first-seen-at` | `first_seen_at` | text | ISO timestamp of the first detection |
| `adjustment-id` | `adjustment_id` | text | optional linked adjustment |

A cleared condition auto-resolves `open|actioned` to `resolved`; `dismissed` stays dismissed (dismissal is a manual field edit, not exposed in the review UI yet).

## Adjustments (`kelly-ads-adjustments-v1`)

Agent-proposed adjustment cards under review-before-execute.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `adjustment-id` | `adjustment_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-workspace number so chat can reference `Adjustment #2`; never renumbered |
| `type` | `type` | text | `negative_keyword\|bid_down\|bid_up\|pause_target\|budget_shift\|creative_refresh` |
| `title` | `title` | text | human-readable proposal |
| `status` | `status` | text | workflow status |
| `campaign-id` | `campaign_id` | text | |
| `platform` | `platform` | text | |
| `reason` | `reason` | longtext | why the agent proposes this |
| `evidence` | `evidence` | longtext | JSON array of numeric evidence lines |
| `target` | `target` | longtext | JSON `{kind: term\|campaign\|creative\|budget, id, text}` |
| `current-value` | `current_value` | text | current state, human-readable |
| `proposed-value` | `proposed_value` | text | proposed state, human-readable |
| `expected-impact` | `expected_impact` | longtext | estimated effect on spend/ACOS/ROAS |
| `anomaly-id` | `anomaly_id` | text | optional source anomaly |
| `note` | `note` | longtext | editable review note |
| `created-at` | `created_at` | text | ISO timestamp |
| `decision-verdict` | (→ `decision.verdict`) | text | written with the verdict |
| `decision-note` | (→ `decision.note`) | longtext | written with the verdict |
| `decided-at` | (→ `decision.decided_at`) | text | written with the verdict |
| `execution-status` | (→ `execution.status`) | text | `planned`, written by `scripts/execute_decisions.mjs --apply` |
| `execution-operation` | (→ `execution.operation`) | text | `add_negative_keyword\|set_bid\|pause_target\|shift_budget\|refresh_creative` |
| `execution-target` | (→ `execution.target`) | longtext | JSON, the concrete outside-the-app target |
| `execution-detail` | (→ `execution.detail`) | longtext | human-readable instruction for the agent |
| `executed-at` | (→ `execution.executed_at`) | text | ISO timestamp |

`status: "done"` and the real `execution` result are recorded by the agent after it performs the mutation outside the app via the platform APIs — `execute_decisions.mjs` only ever plans (`execution-status: "planned"`) and never sets `status` to `done` itself.

## Sync Log (`kelly-ads-sync-log-v1`)

Append-only feed, upserted by `sync-id` so a same-day re-ingest/re-check updates its own entry instead of duplicating.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `sync-id` | `sync_id` | text | `sync-<platform>-<date>` or `sync-checks-<date>`, required |
| `at` | `at` | text | ISO timestamp |
| `platform` | `platform` | text | `amazon\|meta\|tiktok\|google` or empty |
| `kind` | `kind` | text | `ingest\|checks\|execution` |
| `message` | `message` | longtext | short human-readable line |
| `rows` | `rows` | number | |

## Settings (`kelly-ads-settings-v1`)

A single row, `record-id: "config"`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `config`, required |
| `currency` | `currency` | text | base currency for all snapshot amounts |
| `default-acos-pct` | `default_acos_pct` | number | global ACOS target |
| `default-roas` | `default_roas` | number | global ROAS target |
| `per-platform-targets` | `per_platform_targets` | longtext | JSON map `{<platform_id>: {acos_pct}}` |
| `per-product-targets` | `per_product_targets` | longtext | JSON array `[{sku, acos_pct}]` |
| `acos-breach-days` | `acos_breach_days` | number | consecutive spend-days above target before `acos_breach` fires |
| `budget-exhausted-pct` | `budget_exhausted_pct` | number | `budget_exhausted` threshold |
| `budget-risk-pct` | `budget_risk_pct` | number | overview "budget at risk today" threshold |
| `zero-conversion-spend-floor` | `zero_conversion_spend_floor` | number | `zero_conversion_spend` spend floor |
| `cpc-spike-pct` | `cpc_spike_pct` | number | `cpc_spike` threshold, percent above trailing mean |
| `cpc-trailing-days` | `cpc_trailing_days` | number | trailing window for the CPC mean |
| `currency-rates` | `currency_rates` | longtext | JSON map `{<currency>: <rate to base>}`, read by `scripts/ingest_reports.mjs` |
| `csv-mappings` | `csv_mappings` | longtext | JSON map `{<platform_id>: {campaign, date, spend, impressions, clicks, conversions, revenue, currency}}`, read by `scripts/ingest_reports.mjs --csv` |
| `spend-last-month` | `spend_last_month` | number | last calendar month's total spend, for the overview KPI card's month-over-month comparison |

The effective ACOS target for a campaign resolves per-product override (by SKU) beats per-platform override (by platform id) beats `default-acos-pct` — the only place `per-platform-targets`/`per-product-targets` are read (`resolveAcosTarget()` in `app/app/js/ads-model.js`).

## Decisions

A human verdict writes `status`, `decision-verdict`, `decision-note`, and `decided-at` directly onto the adjustment record via `records.changeRequest` (`busabase-provider.js`'s `decideAdjustment()`). There is no separate decisions Base: the adjustment record is the single source of truth, same as every other review-queue skill in this batch. `autoMerge` is `true` for a standalone local preview (trusted operator) and `false` (pending `ChangeRequest`) for a deployed AirApp, per the AirApp review boundary.
