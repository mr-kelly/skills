# Kelly Lead Funnel Schema

Use this schema when reading or writing Kelly Lead Funnel's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/kelly-lead-funnel-app/app/js/providers/busabase-provider.js`,
`content/kelly-lead-funnel-app/app/js/lead-funnel-model.js`). `score`, `score_breakdown`, and
`suggested_action` are computed client-side from the `leads` Base plus the
`settings` Base's `scoring_criteria` on every read — they are never stored.

Funnel order: `new -> data_verified -> scored -> term_sheet_ready`;
`rejected` is a terminal stage reachable from any prior stage.

## Leads (`kelly-lead-funnel-leads`)

One row per merchant/business lead.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `lead-id` | `id` | text | stable domain id, required |
| `brand-name` | `brand_name` | text | required |
| `category` | `category` | text | `food_beverage\|retail_discretionary\|services\|healthcare\|ecommerce\|other` |
| `city` | `city` | text | |
| `store-count` | `store_count` | number | |
| `est-monthly-revenue` | `est_monthly_revenue` | number | |
| `lead-source` | `lead_source` | text | `referral\|inbound_web\|outbound_sourcing\|event\|partner` |
| `data-verifiable` | `data_verifiable` | text | `"true"\|"false"` (Busabase has no boolean field type) |
| `stage` | `stage` | text | `new\|data_verified\|scored\|term_sheet_ready\|rejected` |
| `rejection-reason` | `rejection_reason` | longtext | required once `stage` is `rejected` |
| `notes` | `notes` | longtext | JSON array of `{id, text, author, created_at}`, append-only |
| `stage-history` | `stage_history` | longtext | JSON array of `{from, to, at, reason?}`, append-only |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp, set on every write |

## Settings (`kelly-lead-funnel-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `kelly-lead-funnel-config` | `config` | `{base_currency, fund_profile: {display_name, product, target_check_size}, scoring_criteria: {ideal_store_count_min, ideal_store_count_max, ideal_monthly_revenue_min, ideal_monthly_revenue_max, low_risk_categories, medium_risk_categories, higher_risk_categories}}` |

If no `config` row exists, the app falls back to `DEFAULT_SCORING_CRITERIA`
(`content/kelly-lead-funnel-app/app/js/lead-funnel-model.js`) and an empty `fund_profile` — the board
still functions, just without a named fund profile.

## Scoring (computed, never stored)

`scoreLead(lead, criteria)` returns a deterministic 0-100 `score` and a
`score_breakdown` of exactly 4 factors whose `weight` values sum to 100:

- `chain_size_fit` (30): `store_count` vs `ideal_store_count_min`/`max`.
- `revenue_scale_fit` (30): `est_monthly_revenue` vs
  `ideal_monthly_revenue_min`/`max`.
- `category_risk` (25): `category` vs `low_risk_categories` /
  `medium_risk_categories` / `higher_risk_categories`.
- `data_verifiability` (15): `data_verifiable`.

`suggestNextAction(score, stage)` maps the score and stage to one of
`advance_to_term_sheet | request_data_verification | advance_to_scored |
flag_for_reject_review | hand_off_to_underwriting | closed_no_action`. A
rejected lead's `suggested_action` is always `closed_no_action` regardless of
score.

## Direct Kanban Writes

There is no decisions/approval bucket. Every human action writes straight
onto the lead's own record via `records.changeRequest`:

- **Move stage** (`moveStage`): sets `stage`, `updated_at`, and appends a
  `stage_history` entry `{from, to, at, reason?}`.
- **Reject** (`moveStage(id, "rejected", reason)`): same as a stage move,
  plus `rejection_reason`. `reason` is required; moving off `rejected` clears
  `rejection_reason` again.
- **Add note** (`addNote`): appends `{id, text, author, created_at}` to
  `notes` and updates `updated_at`.

From a standalone local preview the write merges immediately (trusted
operator); from the deployed AirApp it creates a pending ChangeRequest for
the trusted process to merge, per the AirApp boundary in
`$busabase-app-creator`.
