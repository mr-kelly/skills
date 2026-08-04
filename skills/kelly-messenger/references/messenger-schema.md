# Kelly Messenger Schema

Use this schema when reading or writing Kelly Messenger's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`app/app/js/providers/busabase-provider.js`,
`app/app/js/messenger-model.js`). Per-conversation/per-account rollups
(`unread_count`, `conversation_count`, `last_message_at`, `last_incoming_at`,
`metrics`) are computed client-side from `conversations`/`messages` on every
read — they are never stored.

Reply workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `revise`, `block`.

## Accounts (`kelly-messenger-accounts-v1`)

Connected messaging accounts: platform, connector, channels to watch, and
the **names** of the env vars holding tokens — never the token values
themselves. `status`/`last-sync-at` are written by `scripts/sync_messages.mjs`
/ `scripts/ingest_messages.mjs` after each run; every other field is written
during onboarding by `scripts/ingest_messages.mjs`'s optional `account`
payload field.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `account-id` | `account_id` | text | stable domain id, required |
| `platform` | `platform` | text | `whatsapp\|slack\|discord\|telegram\|wechat\|imessage\|line\|messenger` |
| `connector` | `connector` | text | `slack\|discord\|telegram\|whatsapp_cloud\|browser_agent\|manual` |
| `display-name` | `display_name` | text | |
| `workspace` | `workspace` | text | workspace/server/bot handle, optional |
| `status` | `status` | text | `ok\|warning\|error\|not_configured` |
| `channels` | `channels` | longtext | JSON array of channel/server ids to watch |
| `bot-token-env` | `bot_token_env` | text | Slack/Discord/Telegram bot token env var name |
| `user-token-env` | `user_token_env` | text | Slack user token env var name |
| `access-token-env` | `access_token_env` | text | WhatsApp Cloud access token env var name |
| `phone-number-id-env` | `phone_number_id_env` | text | WhatsApp Cloud phone number id env var name |
| `phone-number-id` | `phone_number_id` | text | non-secret fallback if no env var is used |
| `last-sync-at` | `last_sync_at` | text | ISO timestamp |

## Conversations (`kelly-messenger-conversations-v1`)

One row per conversation across all connected accounts. `unread` and
`awaiting_reply` are real state (not purely derived from the last message's
direction) — they are written by `scripts/sync_messages.mjs` /
`scripts/ingest_messages.mjs` and never overwritten by the AirApp.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `conversation-id` | `conversation_id` | text | stable domain id, required |
| `account-id` | `account_id` | text | |
| `platform` | `platform` | text | |
| `kind` | `kind` | text | `dm\|group\|channel\|thread` |
| `title` | `title` | text | human-readable chat title |
| `channel` | `channel` | text | `#support` (Slack/Discord channel, optional) |
| `workspace` | `workspace` | text | workspace/server name, optional |
| `participants` | `participants` | longtext | JSON array of sender names |
| `provider-conversation-id` | `provider_conversation_id` | text | platform-native send target: Slack channel id (optionally `channel/thread_ts`), Discord `chan/<id>`\|`dm/<id>`\|`thread/<id>`, Telegram chat id, WhatsApp `<msisdn>@wa` |
| `suggested-reply` | `suggested_reply` | longtext | optional agent-recommended reply draft, prefilled in the composer |
| `unread` | `unread` | text | `"true"\|"false"` |
| `awaiting-reply` | `awaiting_reply` | text | `"true"\|"false"` — the newest meaningful message is incoming and a reply decision is still owed |

## Messages (`kelly-messenger-messages-v1`)

One row per message, joined onto its conversation by `conversation-id`.
Store only the minimum text needed for review — never credentials, QR
payloads, or raw session tokens.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `message-id` | `message_id` | text | stable id, globally unique, required |
| `conversation-id` | `conversation_id` | text | |
| `direction` | `direction` | text | `incoming\|outgoing` |
| `sender` | `sender` | text | display name (`Kelly` for own messages) |
| `text` | `text` | longtext | message body |
| `sent-at` | `sent_at` | text | ISO timestamp |
| `attachment` | `attachment` | text | optional short note, e.g. `file: report.csv` |

## Sync Log (`kelly-messenger-sync-log-v1`)

Append-only history of sync/ingest runs, written by
`scripts/sync_messages.mjs` / `scripts/ingest_messages.mjs`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `sync-id` | `sync_id` | text | stable id, required |
| `account-id` | `account_id` | text | |
| `method` | `method` | text | `slack\|discord\|telegram\|whatsapp_cloud\|browser_agent\|manual` |
| `at` | `at` | text | ISO timestamp |
| `status` | `status` | text | `ok\|warning\|error` |
| `message` | `message` | longtext | short human-readable result |
| `new-messages` | `new_messages` | number | |

## Replies (`kelly-messenger-replies-v1`)

The outgoing reply review queue: every message is queued here as
`needs_review` until it is sent. This is the decisions file — a human
verdict writes `status`, `decision-action`, `decision-comment`, and
`decided-at` directly onto the reply record; there is no separate decisions
bucket.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `reply-id` | `reply_id` | text | stable domain id, required |
| `conversation-id` | `conversation_id` | text | |
| `account-id` | `account_id` | text | |
| `platform` | `platform` | text | |
| `conversation-title` | `conversation_title` | text | denormalized title for display |
| `text` | `text` | longtext | the reply draft (editable until sent) |
| `note` | `note` | longtext | optional operator note for the agent |
| `reason` | `reason` | longtext | why this draft exists / context |
| `suggested-by` | `suggested_by` | text | `agent\|human` |
| `status` | `status` | text | workflow status |
| `decision-action` | `decision_action` | text | `approve\|request_changes\|revise\|block` |
| `decision-comment` | `decision_comment` | longtext | operator note written with the verdict |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `executed\|handoff\|error` |
| `execution-operation` | `execution_operation` | text | `send_message\|handoff_to_agent` |
| `execution-connector` | `execution_connector` | text | connector actually used to send |
| `execution-target` | `execution_target` | text | `provider_conversation_id` used |
| `execution-detail` | `execution_detail` | longtext | result detail |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

`ref` (the stable human-facing `Reply #N` number) is never stored — it is
assigned client-side by sorting replies by `created-at` ascending, so it
stays put across reloads regardless of the page order `records.list` returns.

Workflow: `needs_review` (human verdict needed) → `approved` (ready for
`scripts/send_outbox.mjs`) → `done` (sent, execution recorded).
`request_changes` moves a reply to `changes_requested`; the agent revises the
`text` and sets it back to `needs_review`. `blocked` means it must not be
sent without new information. `revise` (the composer's "Save edit" button)
only saves an edited draft — it never changes `status`.

## Settings (`kelly-messenger-settings-v1`)

A single row, `record-id: "config"`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `config`, required |
| `reply-style-tone` | `reply_style_tone` | text | e.g. `warm, concise, founder-to-user` |
| `reply-style-language` | `reply_style_language` | text | e.g. `match incoming message` |
| `sync-default-limit` | `sync_default_limit` | number | messages per sync page |
| `sync-cadence-minutes` | `sync_cadence_minutes` | number | |

## Ingest Payload (input to `scripts/ingest_messages.mjs`)

```json
{
  "account": {
    "account_id": "wa-personal",
    "platform": "whatsapp",
    "connector": "browser_agent",
    "display_name": "WhatsApp Personal",
    "workspace": "WhatsApp Web"
  },
  "account_id": "wa-personal",
  "method": "browser_agent",
  "collected_at": "ISO timestamp",
  "conversations": [
    {
      "conversation_id": "optional stable id (derived from title when absent)",
      "title": "Lena Ortiz",
      "kind": "dm",
      "channel": "",
      "participants": ["Lena Ortiz", "Kelly"],
      "provider_conversation_id": "55119990001@wa",
      "suggested_reply": "",
      "messages": [
        { "message_id": "wa-lena-1", "direction": "incoming", "sender": "Lena Ortiz", "text": "Hi!", "sent_at": "ISO timestamp" }
      ]
    }
  ]
}
```

`account` is optional and only needed the first time an account is
registered, or to update its channels/env-var names — omit it on routine
ingests. `conversations` is optional too, so a payload can register an
account with no messages yet. Re-ingesting the same payload is idempotent:
conversations are upserted by `conversation-id`, messages are created only
for `message-id`s not already present.

## Execution (`scripts/send_outbox.mjs`)

The trusted send step. Reads replies with `status: "approved"`. Without
`--send` it only prints a plan. With `--send` it re-reads Busabase
immediately before sending (an approval may have changed), sends
API-connector (`slack`/`discord`/`telegram`/`whatsapp_cloud`) replies via the
official APIs, marks `browser_agent`/`manual` replies `execution-status:
handoff` for the agent to deliver through the user's own session, and writes
`status: done` plus the execution result back onto each reply record. If a
send target is missing (`provider_conversation_id`) or a token env is unset,
the reply is left `approved` with `execution-status: error` instead of being
guessed at.
