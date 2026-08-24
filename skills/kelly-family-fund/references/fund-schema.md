# Kelly Family Fund Schema

Use this schema when reading or writing Kelly Family Fund's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/kelly-family-fund-app/app/js/providers/busabase-provider.js`,
`content/kelly-family-fund-app/app/js/fund-model.js`, `scripts/import_csv.mjs`). The fund snapshot
(months, totals, by_category, by_family, insights) is computed client-side
from `beneficiaries`/`families`/`income`/`expenses` on every read — it is
never stored. Every amount is in the fund's `base_currency` (CNY, ¥). This is
a read-only bookkeeping dashboard: it never moves money.

Category union: `care` (养老院) · `transport` (交通) · `meal` (聚餐) · `gift`
(生日礼物) · `renqing` (人情) · `medical` (医疗) · `misc` (其他).

## Beneficiaries (`kelly-family-fund-beneficiaries`)

The elders whose pensions are pooled.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `beneficiary-id` | `beneficiary_id` | text | stable domain id, required |
| `name` | `name` | text | |
| `relation` | `relation` | text | e.g. `祖父`, `祖母` |
| `pension-monthly` | `pension_monthly` | number | |

## Families (`kelly-family-fund-families`)

The sibling families that share the fund surplus.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `family-id` | `family_id` | text | stable domain id, required |
| `name` | `name` | text | |
| `head` | `head` | text | |
| `members-count` | `members_count` | number | |
| `note` | `note` | text | optional |

## Income (`kelly-family-fund-income`)

Monthly pension inflow per beneficiary.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `income-id` | `income_id` | text | stable domain id, required |
| `month` | `month` | text | `YYYY-MM` |
| `beneficiary-id` | `beneficiary_id` | text | references a Beneficiaries row |
| `amount` | `amount` | number | |
| `note` | `note` | text | optional |

## Expenses (`kelly-family-fund-expenses`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `expense-id` | `expense_id` | text | stable domain id, required |
| `month` | `month` | text | `YYYY-MM` |
| `date` | `date` | text | `YYYY-MM-DD`, optional |
| `category` | `category` | text | `care\|transport\|meal\|gift\|renqing\|medical\|misc` |
| `amount` | `amount` | number | |
| `payee` | `payee` | text | |
| `occasion` | `occasion` | text | |
| `family-id` | `family_id` | text | empty for `care` and for `shared: true` rows |
| `shared` | `shared` | text | `"true"\|"false"` |
| `note` | `note` | text | optional |

`care` rows are the parents' cost: `family-id` MUST be empty and `shared`
MUST be `"false"`. They are excluded from family benefit.

## Settings (`kelly-family-fund-settings`)

One row per `kind`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | required, e.g. `fund-meta`, `onboarding` |
| `kind` | `kind` | text | required |
| `name` | `name` | text | optional label |
| `payload` | `payload` | longtext | JSON, non-secret |
| `updated-at` | `updated_at` | text | ISO timestamp |

`fund-meta` payload: `{ name, steward, note, base_currency, deviation_threshold_pct }`.
`onboarding` payload: `{ completed, completed_at, config_version }`.

## Fairness computation (the core of this skill)

- `benefit_total` = expenses directed to the family (`family_id === fam`,
  non-care, not shared) PLUS the family's equal share of every `shared: true`
  non-care expense (`amount / number_of_families`).
- `family_total` = `expense_total - care_total` (all non-care expenses).
- `avg_family_benefit` = `family_total / number_of_families`.
- `share_pct` = `benefit_total / family_total * 100`. Shares sum to ~100%.
- `deviation_pct` = `(benefit_total - avg_family_benefit) / avg_family_benefit * 100`.
  A family more than `deviation_threshold_pct` (default 20%) from the average
  surfaces a `fairness_deviation` insight.

## Insights

Structured, read-only observations — `{ id, code, severity, category, params }`.
The frontend renders localized text from `code` + `params`; no sentences are
baked into the snapshot. Codes: `monthly_surplus`, `monthly_deficit`,
`care_coverage`, `care_share`, `balance_runway`, `fairness_deviation`. This is
a monitoring dashboard: it never moves money, pays, or transfers.
