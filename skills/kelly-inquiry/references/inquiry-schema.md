# Kelly Inquiry Schema

Use this schema when reading or writing Kelly Inquiry's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/kelly-inquiry-app/app/js/providers/busabase-provider.js`,
`content/kelly-inquiry-app/app/js/inquiry-model.js`). Per-inquiry/per-account rollups
(`last_message_at`, `last_incoming_at`, the new→replied stage heuristic,
quote totals, the min-price guard, follow-up staleness, `metrics`) are
computed client-side from `inquiries`/`messages`/`products`/`quotes` on
every read — they are never stored.

Pipeline stages: `new`, `replied`, `quoted`, `negotiating`, `won`, `lost`.
Active stages (eligible for follow-up staleness): `new`, `replied`,
`quoted`, `negotiating`.

Approval workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `revise`, `block`.

## Accounts (`kelly-inquiry-accounts`)

Connected inquiry channels: channel, connector, and the **names** of the
env vars holding tokens — never the token values themselves.
`status`/`last-sync-at` are written by `scripts/ingest_inquiries.mjs` after
each run; every other field is written during onboarding by
`scripts/ingest_inquiries.mjs`'s optional `account` payload field.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `account-id` | `account_id` | text | stable domain id, required |
| `channel` | `channel` | text | `whatsapp\|instagram\|messenger\|email` |
| `connector` | `connector` | text | `whatsapp_cloud\|instagram_graph\|messenger_graph\|email_agent\|browser_agent\|manual` |
| `display-name` | `display_name` | text | |
| `handle` | `handle` | text | `+86 755 ...` / `@handle` / `sales@example.com` |
| `status` | `status` | text | `ok\|warning\|error\|not_configured` |
| `access-token-env` | `access_token_env` | text | WhatsApp/Instagram/Messenger access token env var name |
| `phone-number-id-env` | `phone_number_id_env` | text | WhatsApp Cloud phone number id env var name |
| `phone-number-id` | `phone_number_id` | text | non-secret fallback if no env var is used |
| `ig-user-id-env` | `ig_user_id_env` | text | Instagram Graph user id env var name |
| `page-id-env` | `page_id_env` | text | Messenger Graph page id env var name |
| `last-sync-at` | `last_sync_at` | text | ISO timestamp |

The connector vocabulary is shared with kelly-messenger so the two skills
compose. `email_agent` marks an account whose collection and sending are
handed off to kelly-email.

## Inquiries (`kelly-inquiry-inquiries`)

The sales pipeline: one row per inquiry. `stage` may be overridden by the
new→replied heuristic (`refreshInquiryDerived`) computed live from the
joined `messages`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `inquiry-id` | `inquiry_id` | text | stable domain id, required |
| `account-id` | `account_id` | text | |
| `channel` | `channel` | text | `whatsapp\|instagram\|messenger\|email` |
| `customer-name` | `customer_name` | text | |
| `customer-company` | `customer_company` | text | |
| `customer-country` | `customer_country` | text | ISO-3166 alpha-2, rendered as a flag |
| `customer-source` | `customer_source` | text | `WhatsApp inbound` / `trade-show contact` / ... |
| `product-interest` | `product_interest` | text | free-text summary |
| `product-ids` | `product_ids` | longtext | JSON array of `product-id` |
| `quote-ids` | `quote_ids` | longtext | JSON array of `quote-id` |
| `stage` | `stage` | text | `new\|replied\|quoted\|negotiating\|won\|lost` |
| `value-estimate` | `value_estimate` | number | |
| `currency` | `currency` | text | ISO 4217 |
| `owner` | `owner` | text | |
| `unread` | `unread` | text | `"true"\|"false"` |
| `created-at` | `created_at` | text | ISO timestamp |
| `next-follow-up` | `next_follow_up` | text | `YYYY-MM-DD` or empty |
| `provider-conversation-id` | `provider_conversation_id` | text | platform-native send target: WhatsApp `<msisdn>@wa`, Instagram `ig:<scoped-user-id>`, Messenger `fb:<psid>`, email address for `email_agent` |
| `suggested-reply` | `suggested_reply` | longtext | optional agent-drafted reply, prefilled in the composer |
| `updated-at` | `updated_at` | text | ISO timestamp |

Stage heuristic (`refreshInquiryDerived`, applied on every read and by
`scripts/ingest_inquiries.mjs`): a `new` inquiry that already contains an
outgoing message is promoted to `replied`; an explicit non-`new` `stage`
always wins.

## Messages (`kelly-inquiry-messages`)

One row per message, joined onto its inquiry by `inquiry-id`. Store only
the minimum excerpt needed for review — never credentials, QR payloads, or
raw session tokens.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `message-id` | `message_id` | text | stable id, globally unique, required |
| `inquiry-id` | `inquiry_id` | text | |
| `direction` | `direction` | text | `incoming\|outgoing` |
| `sender` | `sender` | text | display name (`Kelly` for own messages) |
| `text` | `text` | longtext | message body |
| `sent-at` | `sent_at` | text | ISO timestamp |
| `attachment` | `attachment` | text | optional short note, e.g. `file: specs.pdf` |

## Products (`kelly-inquiry-products`)

The product knowledge base. `price-min` is the margin-guard floor the agent
must never quote below without explicit human approval.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `product-id` | `product_id` | text | stable domain id, required |
| `sku` | `sku` | text | |
| `name` | `name` | text | |
| `category` | `category` | text | |
| `moq` | `moq` | number | minimum order quantity |
| `price-min` | `price_min` | number | margin-guard floor |
| `price-max` | `price_max` | number | |
| `currency` | `currency` | text | ISO 4217 |
| `lead-time-days` | `lead_time_days` | number | |
| `specs` | `specs` | longtext | JSON object, e.g. `{"Power":"40W","CRI":">80"}` |
| `faq` | `faq` | longtext | JSON array of `{ "q": "...", "a": "..." }` |

Written by `scripts/sync_products.mjs`, which accepts a products JSON file
(`{ "products": [...] }` or a bare array) or a CSV with a zero-dependency
parser (quoted-field support); CSV `specs` cells use `Key=Value\|Key=Value`
and `faq` cells use `Question?=>Answer\|Question?=>Answer`.

## Quotes (`kelly-inquiry-quotes`)

Quote worksheets. `subtotal`/`total` and `pricing-alerts` are recomputed
live by `recomputeQuoteTotals`/`applyMinPriceGuard` on every read and every
`updateQuote` write — never trusted from storage.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `quote-id` | `quote_id` | text | stable domain id, required |
| `quote-no` | `quote_no` | text | `Q-2026-0731` |
| `inquiry-id` | `inquiry_id` | text | |
| `customer` | `customer` | text | denormalized `Name · Company` label |
| `currency` | `currency` | text | ISO 4217 |
| `status` | `status` | text | `draft\|sent\|accepted\|expired\|declined` |
| `issue-date` | `issue_date` | text | `YYYY-MM-DD` |
| `valid-until` | `valid_until` | text | `YYYY-MM-DD` |
| `items` | `items` | longtext | JSON array of `{ line_id, product_id, sku, description, qty, unit_price, total }` |
| `subtotal` | `subtotal` | number | |
| `total` | `total` | number | |
| `terms` | `terms` | longtext | incoterm / payment terms |
| `pricing-notes` | `pricing_notes` | longtext | agent pricing rationale, tier used, guard result |
| `pricing-alerts` | `pricing_alerts` | longtext | JSON array of `{ product_id, sku, unit_price, price_min, message }` — the min-price guard output |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

Only `draft` quotes are editable in the UI; every `updateQuote` write
recomputes line totals and re-runs the guard against the current `products`.

## Approvals (`kelly-inquiry-approvals`)

The review batch: every outgoing reply AND quote waits here for a human
verdict. This is the decisions file — a human verdict writes `status`,
`decision-action`, `decision-comment`, and `decided-at` directly onto the
approval record; there is no separate decisions bucket.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable domain id, required |
| `kind` | `kind` | text | `reply\|quote` |
| `inquiry-id` | `inquiry_id` | text | |
| `quote-id` | `quote_id` | text | quote id for `kind=quote` (may be empty for proposed quotes) |
| `account-id` | `account_id` | text | |
| `channel` | `channel` | text | `whatsapp\|instagram\|messenger\|email` |
| `customer` | `customer` | text | denormalized `Name · Company` label |
| `text` | `text` | longtext | the outgoing draft (editable until sent) |
| `note` | `note` | longtext | optional operator note for the agent |
| `reason` | `reason` | longtext | why this draft exists / context |
| `suggested-by` | `suggested_by` | text | `agent\|human` |
| `status` | `status` | text | workflow status |
| `decision-action` | `decision_action` | text | `approve\|request_changes\|revise\|block` |
| `decision-comment` | `decision_comment` | longtext | operator note written with the verdict |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `executed\|handoff\|error` |
| `execution-operation` | `execution_operation` | text | `send_message\|send_quote\|handoff_to_agent` |
| `execution-connector` | `execution_connector` | text | connector actually used to send |
| `execution-target` | `execution_target` | text | `provider_conversation_id` used |
| `execution-detail` | `execution_detail` | longtext | result detail |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

`ref` (the stable human-facing `Reply #N` / `Quote #N` number) is never
stored — it is assigned client-side by sorting approvals by `created-at`
ascending, so it stays put across reloads regardless of the page order
`records.list` returns.

Workflow: `needs_review` (human verdict needed) → `approved` (ready for
`scripts/send_approved.mjs`) → `done` (sent, execution recorded).
`request_changes` moves an item to `changes_requested`; the agent revises
the `text` and sets it back to `needs_review`. `blocked` means it must not
be sent without new information. `revise` (the composer's "Save edit"
button) only saves an edited draft — it never changes `status`. A `done`
item is terminal and cannot be re-decided.

## Sync Log (`kelly-inquiry-sync-log`)

Append-only history of ingest/sync runs, written by
`scripts/ingest_inquiries.mjs` / `scripts/sync_products.mjs`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `sync-id` | `sync_id` | text | stable id, required |
| `account-id` | `account_id` | text | `product-kb` for product-sync log entries |
| `method` | `method` | text | `whatsapp_cloud\|instagram_graph\|messenger_graph\|email_agent\|browser_agent\|manual` |
| `at` | `at` | text | ISO timestamp |
| `status` | `status` | text | `ok\|warning\|error` |
| `message` | `message` | longtext | short human-readable result |
| `new-messages` | `new_messages` | number | |

## Settings (`kelly-inquiry-settings`)

A single row, `record-id: "config"`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `config`, required |
| `quote-defaults` | `quote_defaults` | longtext | JSON: `{ currency, validity_days, incoterm, payment_terms, min_price_guard: { enabled, block_below_price_min } }` |
| `follow-up` | `follow_up` | longtext | JSON: `{ sla_days: { new, replied, quoted, negotiating } }` |
| `reply-style` | `reply_style` | longtext | JSON: `{ tone, language }` |
| `kb-source-path` | `kb_source_path` | text | non-secret note of where the product KB was imported from |

## Ingest Payload (input to `scripts/ingest_inquiries.mjs`)

```json
{
  "account": {
    "account_id": "wa-sales",
    "channel": "whatsapp",
    "connector": "whatsapp_cloud",
    "display_name": "Lumina WhatsApp Business",
    "access_token_env": "KELLY_INQUIRY_WA_ACCESS_TOKEN"
  },
  "account_id": "wa-sales",
  "method": "browser_agent",
  "collected_at": "ISO timestamp",
  "inquiries": [
    {
      "inquiry_id": "optional stable id (derived from customer name when absent)",
      "customer": { "name": "Klaus Müller", "company": "", "country": "DE", "source": "WhatsApp inbound" },
      "product_interest": "60×60 LED panels",
      "product_ids": [],
      "stage": "new",
      "value_estimate": 18480,
      "owner": "Kelly",
      "next_follow_up": "2026-07-05",
      "provider_conversation_id": "4915770001122@wa",
      "suggested_reply": "",
      "messages": [
        { "message_id": "mue-1", "direction": "incoming", "sender": "Klaus Müller", "text": "Hello...", "sent_at": "ISO timestamp" }
      ]
    }
  ]
}
```

`account` is optional and only needed the first time an account is
registered, or to update its connector/env-var names — omit it on routine
ingests. Merging is idempotent: inquiries dedupe by `inquiry_id`, messages
by `message_id`; re-running the same payload adds nothing. The stage
heuristic runs on the full merged message list, matching
`refreshInquiryDerived`.

## Product Sync (`scripts/sync_products.mjs`)

```bash
node scripts/sync_products.mjs products.json --apply
node scripts/sync_products.mjs products.csv --apply
```

JSON: `{ "products": [ { product_id, sku, name, category, moq, price_min, price_max, currency, lead_time_days, specs{}, faq[] } ] }` or a bare array. CSV columns: `product_id,sku,name,category,moq,price_min,price_max,currency,lead_time_days,specs,faq` (`specs` cell `Power=40W|CRI=>80`, `faq` cell `Q1?=>A1|Q2?=>A2`). Products upsert by `product_id`; duplicate ids within one file fail the sync. With the min-price guard enabled in `settings.quote-defaults`, a product with no `price_min` prints a warning (the guard cannot protect it).

## Execution (`scripts/send_approved.mjs`)

The trusted send step — there is no separate execute-decisions script.
Reads approval items with `status: "approved"`. Without `--send` it only
prints a plan. With `--send` it re-reads Busabase immediately before
sending (an approval may have changed), sends API-connector
(`whatsapp_cloud`/`instagram_graph`/`messenger_graph`) items via the
official Meta APIs, marks `email_agent`/`browser_agent`/`manual` items
`execution-status: handoff` for the agent to deliver (kelly-email drafts, or
the user's own web session), and writes `status: done` plus the execution
result back onto each approval record. If a send target is missing
(`provider_conversation_id`) or a token env is unset, the item is left with
`execution-status: error` instead of being guessed at.
