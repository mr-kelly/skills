---
name: kelly-family-fund
license: MIT
description: Household pooled-pension / elder-care fund App-in-Skill (家庭统筹基金) that keeps one read-only bookkeeping dashboard where transparency equals fairness. Use when the user invokes $kelly-family-fund or /kelly-family-fund, wants to pool two elders' pensions (退休金) managed by one steward (统筹人), pay a fixed care cost (养老院 / nursing home), and share the surplus across sibling families (交通/聚餐/生日礼物/人情/social gifts), track a household fund balance and monthly income/expense/net, see per-family cumulative benefit, share %, and fairness deviation (公平), a per-category spend split, CSV import or manual ledger entry (记账). It reads and writes LOCAL files only and NEVER moves money.
---

# Kelly Family Fund

## Overview

Use this skill as a family's local pooled-pension / elder-care fund ledger (家庭统筹基金). Two elders' pensions are pooled and managed by one steward (e.g. the eldest sibling). The fund pays a fixed care cost (nursing home) and shares the remaining surplus across the sibling families — transport, meals, birthday gifts, and 人情 (social gifts). The whole point is transparency = fairness: everyone can see the balance, where the money went, and whether any family is benefiting more than the average. Data comes from CSV import and manual entry; there is no bank or payment API.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or load the local ledger snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Family Fund overview"></td>
    <td width="50%"><img src="assets/screenshots/ledger.webp" alt="Kelly Family Fund ledger"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Fund balance, this-month income / expense / net, care and family totals, an expense-by-category donut, running-balance trend, and read-only insights.</td>
    <td><strong>Ledger</strong><br>Unified income and expense timeline by month, each entry tagged with its category and the sibling family it benefits.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/category.webp" alt="Kelly Family Fund by category"></td>
    <td width="50%"><img src="assets/screenshots/family.webp" alt="Kelly Family Fund fairness by family"></td>
  </tr>
  <tr>
    <td><strong>By category</strong><br>Spending across care, transport, meals, gifts, and gifts of obligation, with the care-versus-family split.</td>
    <td><strong>By family (fairness)</strong><br>Each sibling family's cumulative benefit, share, and deviation from the average — care excluded, shared costs split equally — so anyone can confirm it is balanced.</td>
  </tr>
</table>

## Boundary

- The skill may read a ledger CSV, normalize it, validate schemas, and write local snapshot files.
- The app reads and writes local files only. It must NEVER move money, pay a care home, transfer funds, settle between families, or mutate any remote system. It is a read-only bookkeeping and fairness dashboard.
- Treat ledger data as sensitive. Do not commit `config.local.json`, env files, `app/.data/`, or raw ledger exports.
- There is no approval lifecycle and no decisions file — this is bookkeeping only.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before entering real ledger data.

Set up in this order:

1. Define the fund: `name`, `steward`, optional `note`, and `base_currency` (default CNY, ¥).
2. Define beneficiaries — the elders whose pensions are pooled (`id`, `name`, `relation`, `pension_monthly`).
3. Define the sibling families that share the surplus (`id`, `name`, `head`, `members_count`).
4. Set `fairness.deviation_threshold_pct` (default 20).
5. Import a ledger CSV or enter income/expenses manually, then start the app.

Private config priority:

1. `KELLY_FAMILY_FUND_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-family-fund/config.local.json`
3. `~/.config/kelly-family-fund/config.json`
4. `skills/kelly-family-fund/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_FAMILY_FUND_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-family-fund/.env.local`
5. `~/.config/kelly-family-fund/.env`

Ask only for non-secret setup details: fund name, steward, elder names/relations/pensions, family names/heads, and the fairness threshold. When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## CSV Format

Import the ledger with `scripts/import_csv.ts`. The documented template is `references/ledger-csv-template.csv`. Columns:

- `type` (income|expense)
- `month` (YYYY-MM), `date` (YYYY-MM-DD, optional)
- `category` (care|transport|meal|gift|renqing|medical|misc — blank for income)
- `amount`
- `family` (family id or name; blank for income, shared, or care)
- `beneficiary` (beneficiary id, for income rows)
- `payee`, `occasion`, `shared` (true|false), `note`

Run:

```bash
node scripts/import_csv.ts path/to/ledger.csv
```

It normalizes rows into `app/.data/snapshot.json`, computes the chronological `months` (with a running balance), the `totals`, the `by_category` split, and the `by_family` fairness rollup, and writes `app/.data/import_report.json`. Manual entry is the same file — maintain the CSV and re-run the importer. `care` rows are always treated as the parents' cost (`family_id` null, not shared).

## Demo Mode

- `?demo=1` (or `?demo=overview`) opens a deterministic offline fund: fund "家庭统筹基金", steward "老大 · 张伟", 2 beneficiaries (祖父 张国强 ¥16000, 祖母 李秀英 ¥14000), 4 sibling families, and 6 months (2026-01 … 2026-06) of pooled pension income and expenses in CNY.
- `?demo=ledger`, `?demo=family`, `?demo=detail`, and `?demo=category` select named scenes.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses never read or write live data or local private ledger files.

## Data Provider Seam

The Hono app reaches storage only through the logic modules, so the same `app.fetch` deploys to Cloudflare Workers once the data layer moves to a cloud provider. Select the backend with `KELLY_FAMILY_FUND_DATA_PROVIDER=local` (default `local`).

## Local App

Start the dashboard with:

```bash
skills/kelly-family-fund/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or `KELLY_FAMILY_FUND_UI_PORT` when set. UI language supports Chinese (primary) and English chrome with an `Auto` default.

## Views

- `#/overview`: fund balance, this-month income / expense / net, care and family totals, the max fairness deviation, an expense-allocation donut, and a running-balance trend. A month selector scopes the this-month figures.
- `#/ledger`: unified income + expense timeline, filterable by month, each row showing a category badge, amount, payee/occasion, and family tag (or 养老院/共享).
- `#/family`: the sibling families with cumulative benefit, share %, and a fairness bar showing deviation from average; select a family to drill into its directed and shared-share expenses.
- `#/category`: expense donut + care-vs-family split + a per-category totals table with percentages.
- `#/settings`: sanitized setup summary (fund, steward, base currency, beneficiaries, families, fairness threshold, data provider, onboarding, config path). Never expose secrets.

## Insights

Read-only, deterministic observations rendered from `{ code, severity, params }` by localized templates (zh + en). Codes: `monthly_surplus` / `monthly_deficit`, `care_coverage`, `care_share`, `balance_runway`, `fairness_deviation`. They are neutral facts, never advice, and never actions.

## File Contract

Read `references/fund-schema.md` before editing the app, scripts, or any generated snapshot JSON.

Primary local files:

- `app/.data/snapshot.json`: canonical dashboard snapshot generated by the importer/scripts.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/import_report.json`: latest CSV import result.
- `config.local.json`: private fund/beneficiaries/families config, ignored by git.

Use `node scripts/validate_ui_schema.ts app/.data/snapshot.json` before relying on a snapshot in the UI. It checks beneficiary/family references, category enums, the care-row invariant, that `totals` equal the ledger sums, that `months` chain into the running balance, that `by_category` sums to `expense_total`, and that `by_family` benefits sum to `family_total`. The app shows an empty "needs this month's entries" state when no snapshot exists.

## Safety Defaults

- Never move money, pay a care home, transfer, or settle between families. This skill only reads local files and renders them.
- Keep raw ledger exports outside git; store only normalized safe fields in the snapshot.
- Fairness is computed deterministically and shown transparently; it never prescribes who should pay what.
- If a month is missing income or expenses, surface it as an empty/attention state rather than inventing values.
