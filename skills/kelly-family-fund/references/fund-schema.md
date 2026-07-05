# Kelly Family Fund Snapshot Schema

Use this schema for `app/.data/snapshot.json`. Keep the shape stable so the local
app, scripts, and future connectors can evolve independently. Every amount is in
the snapshot `base_currency` (CNY, ¥). This is a read-only bookkeeping snapshot:
it never moves money.

## Snapshot

```json
{
  "schema_version": "1",
  "snapshot_id": "stable id for this snapshot",
  "generated_at": "ISO timestamp",
  "base_currency": "CNY",
  "fund": { "name": "家庭统筹基金", "steward": "老大 · 张伟", "note": "optional" },
  "beneficiaries": [],
  "families": [],
  "income": [],
  "expenses": [],
  "months": [],
  "totals": {
    "income_total": 0,
    "expense_total": 0,
    "balance": 0,
    "care_total": 0,
    "family_total": 0,
    "avg_family_benefit": 0
  },
  "by_category": [],
  "by_family": [],
  "insights": []
}
```

## Beneficiary (the elders whose pensions are pooled)

```json
{ "id": "elder-grandpa", "name": "祖父 张国强", "relation": "祖父", "pension_monthly": 16000 }
```

## Family (the sibling families that share the surplus)

```json
{ "id": "fam-01", "name": "老大 张伟家", "head": "张伟", "members_count": 4, "note": "optional" }
```

## Income (pension inflow)

```json
{ "id": "inc-2026-01-grandpa", "month": "2026-01", "beneficiary_id": "elder-grandpa", "amount": 16000, "note": "optional" }
```

## Expense

```json
{
  "id": "exp-2026-01-gift",
  "month": "2026-01",
  "date": "2026-01-20",
  "category": "care|transport|meal|gift|renqing|medical|misc",
  "amount": 900,
  "payee": "生日礼物",
  "occasion": "长辈生日",
  "family_id": "fam-01 | null",
  "shared": false,
  "note": "optional"
}
```

Category union: `care` (养老院) · `transport` (交通) · `meal` (聚餐) · `gift`
(生日礼物) · `renqing` (人情) · `medical` (医疗) · `misc` (其他).

`care` rows are the parents' cost: `family_id` MUST be `null` and `shared` MUST
be `false`. They are excluded from family benefit.

## Months (chronological, running balance)

```json
{ "month": "2026-01", "income_total": 30000, "expense_total": 23100, "net": 6900, "balance_end": 6900 }
```

`net = income_total - expense_total`. `balance_end` is the running balance across
months in chronological order; the final `balance_end` equals `totals.balance`.

## Totals

```json
{
  "income_total": 0,      // sum of all income
  "expense_total": 0,     // sum of all expenses
  "balance": 0,           // income_total - expense_total
  "care_total": 0,        // sum of care expenses
  "family_total": 0,      // expense_total - care_total (all non-care expenses)
  "avg_family_benefit": 0 // family_total / number_of_families
}
```

## by_category

```json
{ "category": "care", "amount": 120000, "pct": 84.7 }
```

Amounts sum to `expense_total`; `pct` is the share of `expense_total`.

## by_family (the fairness computation — the core of this skill)

```json
{ "family_id": "fam-01", "name": "老大 张伟家", "benefit_total": 6662.5, "share_pct": 30.6, "deviation_pct": 22.5 }
```

- `benefit_total` = expenses directed to the family (`family_id === fam`, non-care,
  not shared) PLUS the family's equal share of every `shared: true` non-care
  expense (`amount / number_of_families`).
- `share_pct` = `benefit_total / family_total * 100`. Shares sum to ~100%.
- `deviation_pct` = `(benefit_total - avg_family_benefit) / avg_family_benefit * 100`.
  A family more than `fairness.deviation_threshold_pct` (default 20%) from the
  average surfaces a `fairness_deviation` insight.

## Insights

Structured, read-only observations — `{ id, code, severity, category, params }`.
The frontend renders localized text from `code` + `params`; no sentences are baked
into the snapshot. Codes: `monthly_surplus`, `monthly_deficit`, `care_coverage`,
`care_share`, `balance_runway`, `fairness_deviation`. This is a monitoring
dashboard: it never moves money, pays, or transfers.
