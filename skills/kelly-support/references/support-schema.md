# Kelly Support Schema

Use this schema when reading or writing Kelly Support's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`app/app/js/providers/busabase-provider.js`, `app/app/js/support-model.js`).
Per-ticket rollups (`last_message_at`, `last_incoming_at`, `sla.breached`)
and the `support-qa` `quality_gate` verdict are computed client-side on every
read from `tickets`/`messages`/`knowledge_base` — they are **never stored**,
so an edited reply always reflects the current verdict.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `revise`.

Channels: `email`, `whatsapp`, `webchat`, `form`, `wechat`.

Connectors: `email_agent`, `whatsapp_cloud`, `webchat_widget`, `form_intake`, `wechat_work`, `manual`.

## Accounts (`kelly-support-accounts-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `account-id` | `account_id` | text | stable id, e.g. `email-support`, required |
| `channel` | `channel` | text | see Channels above |
| `connector` | `connector` | text | see Connectors above |
| `display-name` | `display_name` | text | |
| `handle` | `handle` | text | email / phone / URL / WeChat id |
| `status` | `status` | text | `ok\|warning\|error\|not_configured` |
| `access-token-env` | `access_token_env` | text | env var *name* only, for `whatsapp_cloud` |
| `phone-number-id-env` | `phone_number_id_env` | text | env var *name* only, for `whatsapp_cloud` |
| `corp-secret-env` | `corp_secret_env` | text | env var *name* only, for `wechat_work` |
| `last-sync-at` | `last_sync_at` | text | ISO timestamp |

`ticket_count`/`unread_count` are rollups computed client-side from `tickets`, never stored.

## Tickets (`kelly-support-tickets-v1`)

The approval-queue rows — one per support ticket, combining the triaged
content, the KB-grounded draft reply, the human decision, and the execution
marker.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `ticket-id` | `ticket_id` | text | stable domain id, required |
| `account-id` | `account_id` | text | |
| `channel` | `channel` | text | |
| `customer-name` | `customer_name` | text | |
| `customer-company` | `customer_company` | text | |
| `customer-email` | `customer_email` | text | |
| `customer-handle` | `customer_handle` | text | |
| `customer-country` | `customer_country` | text | ISO-2 |
| `customer-plan` | `customer_plan` | text | |
| `subject` | `subject` | text | |
| `body` | `body` | longtext | original ticket body |
| `category` | `category` | text | `bug\|how_to\|billing\|refund\|complaint\|feature` |
| `priority` | `priority` | text | `urgent\|high\|normal\|low` |
| `status` | `status` | text | workflow status |
| `proposed-action` | `proposed_action` | text | `send_reply\|escalate\|refund\|close\|no_action` |
| `reason` | `reason` | longtext | why this draft / triage note |
| `suggested-reply` | `suggested_reply` | longtext | the KB-grounded reply draft (editable until sent) |
| `kb-refs` | `kb_refs` | longtext | JSON array of `article_id`s |
| `sla-policy` | `sla_policy` | text | default `first_response` |
| `sla-due-by` | `sla_due_by` | text | ISO timestamp |
| `sla-first-response-at` | `sla_first_response_at` | text | ISO timestamp, set once a reply is sent |
| `csat-score` | `csat_score` | number | 1-5, present only on rated tickets |
| `csat-comment` | `csat_comment` | longtext | |
| `csat-rated-at` | `csat_rated_at` | text | ISO timestamp |
| `owner` | `owner` | text | default `Kelly` |
| `unread` | `unread` | text | `"true"\|"false"` |
| `created-at` | `created_at` | text | ISO timestamp |
| `provider-conversation-id` | `provider_conversation_id` | text | send target — email address, `<msisdn>@wa`, `wc:<session>`, `wx:<user>` |
| `decision-action` | `decision_action` | text | written with the verdict |
| `decision-comment` | `decision_comment` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |
| `execution-status` | `execution_status` | text | `sent\|dry_run\|skipped\|blocked`, written by `scripts/execute_decisions.mjs` |
| `execution-operation` | `execution_operation` | text | `send_reply\|escalate\|refund\|close\|no_action` |
| `execution-connector` | `execution_connector` | text | the account id that would deliver it |
| `execution-target` | `execution_target` | text | `provider_conversation_id` at execution time |
| `execution-tier` | `execution_tier` | text | for `escalate` |
| `execution-amount` | `execution_amount` | number | for `refund` |
| `execution-detail` | `execution_detail` | longtext | |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

`ref` (the stable `#N` shown in the UI), `last_message_at`, `last_incoming_at`,
`sla.breached`, and `quality_gate` are all computed client-side — never
stored fields. `ref` is assigned by a `created_at`-ascending stable sort so
it stays put across reloads regardless of the page order `records.list`
returns. `sla.breached` is derived, never trusted from input: a ticket
breaches when it is still open (`status` not `done`/`blocked`), has no first
response, and `sla_due_by` has passed relative to the current time.

## Messages (`kelly-support-messages-v1`)

One row per conversation message, joined onto its ticket by `ticket-id`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `message-id` | `message_id` | text | stable per-ticket id, required |
| `ticket-id` | `ticket_id` | text | |
| `direction` | `direction` | text | `incoming\|outgoing` |
| `sender` | `sender` | text | display name (`Kelly` for own messages) |
| `text` | `text` | longtext | message body |
| `sent-at` | `sent_at` | text | ISO timestamp |
| `attachment` | `attachment` | text | optional short note, e.g. `file: screenshot.png` |

Store only the minimum excerpt needed for review. Never store credentials, QR payloads, or session tokens.

## Knowledge Base (`kelly-support-knowledge-base-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `article-id` | `article_id` | text | stable id, required |
| `kind` | `kind` | text | `article\|macro` |
| `title` | `title` | text | |
| `body` | `body` | longtext | the article or canned macro text |
| `tags` | `tags` | longtext | JSON array |
| `category` | `category` | text | |
| `updated-at` | `updated_at` | text | ISO timestamp |

A ticket's `kb_refs` reference `article_id`s. The `support-qa` gate requires
a substantive reply to cite at least one real article and flags any dangling
`kb_ref`.

## Sync Log (`kelly-support-sync-log-v1`)

Append-only history of ticket-collection runs per account.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `sync-id` | `sync_id` | text | stable id, required |
| `account-id` | `account_id` | text | |
| `method` | `method` | text | usually the account's `connector` |
| `at` | `at` | text | ISO timestamp |
| `status` | `status` | text | `ok\|warning\|error` |
| `message` | `message` | longtext | human-readable summary |
| `new-messages` | `new_messages` | number | |

## Settings (`kelly-support-settings-v1`)

One row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `sla-policy` | `sla_policy` | longtext | JSON: `{first_response_hours: {urgent, high, normal, low}, business_hours}` |
| `risk-policy` | `risk_policy` | longtext | JSON: `{refund_requires_approval, max_auto_refund, block_ungrounded_replies, block_commitments_without_approval}` |
| `reply-style` | `reply_style` | longtext | JSON: `{tone, language, signature, avoid: [...]}` |
| `kb-source-path` | `kb_source_path` | text | where the KB was imported from, for display only |

## Decisions

A human verdict (`approve`/`request_changes`/`block`/`revise`) writes the new
`status` plus `decision-action`/`decision-comment`/`decided-at` (and, for a
Save-reply or an edited approval, the new `suggested-reply`) directly onto
the ticket record through `busabase-sdk`. There is no separate decisions
file: the ticket record is the single source of truth for both the draft and
its review state. From a standalone local preview the write merges
immediately (trusted operator); from the deployed AirApp it creates a
pending ChangeRequest for the trusted process to merge.

## The Quality Gate (`support-qa`, computed, never stored)

`runQualityGate(ticket, knowledge_base, risk_policy)` in
`app/app/js/support-model.js` returns `{verdict, score, summary, checks}`:

- **`grounding`** — a substantive reply (≥40 chars) must cite at least one KB article that resolves; a short acknowledgement is exempt.
- **`kb_refs_resolve`** — every cited `kb_ref` must resolve to a real article (a dangling ref is a FIX, not a BLOCK).
- **`no_unapproved_commitment`** — a reply matching refund/credit/guarantee language is a hard BLOCK unless the ticket's `proposed_action` is `refund` AND `status` is `approved`.
- **`refund_policy`** — a `refund` proposed action is a hard BLOCK until `status` is `approved` (or the risk policy explicitly disables approval and the amount is under the auto-cap).

`verdict` is `block` if either hard-blocking check fails, else `fix` if
either soft check fails, else `ship`. `score` is the percentage of passing
checks. A `block` verdict refuses approval and refuses execution even if a
stale `approve` decision exists.

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step. Reads `tickets` whose `decision_action` is
`approve` AND `status` is `approved`, re-checks the `support-qa` gate live,
and — with `--apply` — writes an execution marker
(`execution-status`/`execution-operation`/`execution-target`/etc.) onto each
ticket that clears every safety gate. **It never changes the ticket's
`status`** (real delivery, not this script, ultimately resolves the ticket)
and performs **no external side effect** — no email send, no WhatsApp/WeChat
API call, no refund. Idempotency is checked live off each ticket's own
`execution-status` field (no separate report file). Real
sends/escalations/refunds are performed by the configured channel connectors
(kelly-email, WhatsApp Cloud API, the web-chat widget, WeChat Work), a
separate, explicitly authorized step.
