# Kelly Money Ledger Schema

Use this schema for the Busabase ledger Bases. The AirApp reads these Bases
only; the trusted sync process is the only writer. Field slugs are
kebab-case in Busabase and normalized to snake_case in app code
(`content/kelly-money-app/app/js/providers/busabase-provider.js`, `content/kelly-money-app/app/js/money-model.js`).

## Accounts (`kelly-money-accounts`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `account-id` | `account_id` | text | stable local id, required |
| `provider` | `provider` | text | `mercury\|stripe\|airwallex\|creem\|manual` |
| `display-name` | `display_name` | text | |
| `entity` | `entity` | text | company or owner |
| `currency` | `currency` | text | |
| `status` | `status` | text | `ok\|warning\|error\|not_configured` |
| `balance-available` | `balance.available` | number | |
| `balance-pending` | `balance.pending` | number | |
| `balance-current` | `balance.current` | number | |
| `balance-as-of` | `balance.as_of` | text | ISO timestamp |
| `gross-inflow` | `totals.gross_inflow` | number | |
| `gross-outflow` | `totals.gross_outflow` | number | |
| `fees` | `totals.fees` | number | |
| `net` | `totals.net` | number | |
| `last-sync-at` | `last_sync_at` | text | ISO timestamp |
| `provider-account-id` | `provider_account_id` | text | safe provider id |
| `notes` | `notes` | longtext | |

The app derives a `warning` for any account with `status` `warning` or
`error` — do not also store a duplicate warning row.

## Transactions (`kelly-money-transactions`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `transaction-id` | `transaction_id` | text | stable local id, required |
| `provider` | `provider` | text | `mercury\|stripe\|airwallex\|creem\|manual` |
| `account-id` | `account_id` | text | stable local account id |
| `provider-account-id` | `provider_account_id` | text | |
| `provider-transaction-id` | `provider_transaction_id` | text | |
| `occurred-at` | `occurred_at` | text | ISO timestamp |
| `available-at` | `available_at` | text | ISO timestamp or empty |
| `description` | `description` | text | |
| `counterparty` | `counterparty` | text | |
| `type` | `type` | text | `payment\|payout\|fee\|refund\|transfer\|charge\|adjustment\|conversion\|interest\|other` |
| `status` | `status` | text | `posted\|pending\|failed\|canceled` |
| `currency` | `currency` | text | |
| `gross` | `gross` | number | |
| `fee` | `fee` | number | |
| `net` | `net` | number | signed: positive increases account value |
| `direction` | `direction` | text | `in\|out\|neutral` |
| `source-url` | `source_url` | text | optional provider dashboard URL |
| `tags` | `tags` | text | JSON array |

## Invoices (`kelly-money-invoices`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `invoice-id` | `invoice_id` | text | stable local id, required |
| `invoice-number` | `invoice_number` | text | |
| `direction` | `direction` | text | `incoming\|outgoing` |
| `vendor` | `vendor` | text | |
| `customer` | `customer` | text | |
| `issue-date` | `issue_date` | text | `YYYY-MM-DD` |
| `due-date` | `due_date` | text | `YYYY-MM-DD` |
| `status` | `status` | text | `open\|paid\|credited\|void\|needs_review` |
| `currency` | `currency` | text | |
| `subtotal` | `subtotal` | number | |
| `tax` | `tax` | number | |
| `total` | `total` | number | |
| `source` | `source` | text | `stripe\|mercury\|airwallex\|creem\|pdf\|manual` |
| `source-url` | `source_url` | text | |
| `file-path` | `file_path` | text | keep raw PDFs outside git; store only a safe reference |
| `notes` | `notes` | longtext | |

## Invoice Matches (`kelly-money-invoice-matches`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `match-id` | `match_id` | text | stable local id, required |
| `invoice-id` | `invoice_id` | text | |
| `transaction-id` | `transaction_id` | text | |
| `status` | `status` | text | `matched\|amount_mismatch\|date_mismatch\|needs_review\|rejected` |
| `amount-delta` | `amount_delta` | number | |
| `date-delta-days` | `date_delta_days` | number | |
| `confidence` | `confidence` | number | 0-1 |
| `matching-method` | `matching_method` | text | `auto\|suggested\|manual` |
| `matching-rule` | `matching_rule` | text | e.g. `amount_currency_counterparty_date` |
| `review-status` | `review_status` | text | `auto_accepted\|needs_review\|human_approved\|rejected` |
| `amount-tolerance` | `amount_tolerance` | number | |
| `date-tolerance-days` | `date_tolerance_days` | number | |
| `candidate-transaction-ids` | `candidate_transaction_ids` | text | JSON array |
| `matched-at` | `matched_at` | text | ISO timestamp |
| `audit-events` | `audit_events` | longtext | JSON array of `{event, actor, at, note}` |
| `notes` | `notes` | longtext | JSON array of strings |

Use `matched` only when amount/currency, counterparty, direction, and timing
are consistent enough for bookkeeping. Use `amount_mismatch` for partial
payments, credits, platform fees accidentally compared against gross, or
invoice totals that do not equal the transaction amount. Use `needs_review`
when a human should choose between candidates. Keep tolerances explicit and
append to `audit_events` rather than overwriting the history of a match.

## Settings (`kelly-money-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `kelly-money-accounts` | `accounts` | `{accounts: [{account_id, provider, display_name, entity, currency, secret_envs, secrets_ready}]}` — non-secret account inventory only |
| `kelly-money-lock` | `lock` | not JSON-wrapped: fields `locked` (bool), `owner`, `message` live directly on the row |

Never write a real secret value into any Busabase field — only Vault
references or readiness booleans.
