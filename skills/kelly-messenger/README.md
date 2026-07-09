# Kelly Messenger

Kelly Messenger is a local App-in-Skill unified chat inbox: WhatsApp, Discord, Slack, and Telegram (extensible to WeChat, iMessage, LINE, Messenger) aggregated into one place, with one composer that queues replies for review instead of sending them.

## What It Shows

- Overview: what needs a reply decision, approved replies waiting for send, blocked replies, oldest-waiting conversation, per-platform account cards, and recent activity.
- Inbox: all conversations across platforms sorted by latest activity, with chat-bubble transcripts, platform/channel metadata, and a reply composer (`Queue reply` writes to the local outbox — nothing is sent).
- Outbox: the reply review queue (`needs_review` / `changes_requested` / `approved` / `done` / `blocked`) with stable `Reply #N` refs, editable drafts, and approve / request-changes / block decisions.
- Accounts: connector method, env readiness, last sync, and per-account warnings.
- Help & Settings: sanitized config summary, sync log, and the last execution report. Never secrets.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Messenger overview"></td>
    <td width="50%"><img src="assets/screenshots/chat.webp" alt="Kelly Messenger conversation"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Messaging command desk with reply-decision counts, per-platform sync status, and oldest-waiting indicator.</td>
    <td><strong>Conversation</strong><br>Chat transcript with an agent-suggested reply prefilled in the composer, ready to edit and queue.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/inbox.webp" alt="Kelly Messenger unified inbox"></td>
    <td width="50%"><img src="assets/screenshots/outbox.webp" alt="Kelly Messenger reply outbox"></td>
  </tr>
  <tr>
    <td><strong>Unified inbox</strong><br>Conversations across WhatsApp, Slack, Discord, and Telegram sorted by latest activity with waiting-time badges.</td>
    <td><strong>Reply outbox</strong><br>Approval queue for outgoing replies: every message is reviewed before the agent sends it via platform connectors.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/accounts.webp" alt="Kelly Messenger accounts"></td>
  </tr>
  <tr>
    <td><strong>Accounts</strong><br>Connected messaging accounts across WhatsApp and Telegram with connector status and secret readiness.</td>
  </tr>
</table>

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-messenger/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=inbox&lang=en#/inbox
/?demo=chat&lang=en#/inbox/wa-lena-pricing
/?demo=outbox&lang=en#/outbox
```

The `chat` scene opens the featured WhatsApp customer conversation (`wa-lena-pricing`) with an agent-suggested reply prefilled in the composer. Demo mode never reads or writes local data files; demo edits stay in the browser tab.

## Connector Setup

Each account in the config declares a `connector` and references tokens by env var name only:

- Slack: create a bot (scopes like `channels:history`, `channels:read`, `chat:write`), invite it to the channels to watch, set `bot_token_env`.
- Discord: create a bot, invite it to your server with read/send permissions, list the channel ids to watch in `channels`, set `bot_token_env`.
- Telegram: create a bot with @BotFather, add it to the groups it should read (it must share the chats), set `bot_token_env`.
- WhatsApp Business Cloud API: set `access_token_env` and `phone_number_id_env`. Inbound history is webhook-based, so reading uses ingest payloads; sending uses the Cloud API.
- WhatsApp Web / anything else: use `browser_agent` (the agent reads your own logged-in session and imports via `scripts/ingest_messages.ts`) or `manual`. No passwords or QR secrets are ever stored.

Scripts:

```bash
node skills/kelly-messenger/scripts/sync_messages.ts      # read-only API sync (friendly no-op without tokens)
node skills/kelly-messenger/scripts/ingest_messages.ts payload.json
node skills/kelly-messenger/scripts/send_outbox.ts        # dry-run; add --send to execute approved replies
node skills/kelly-messenger/scripts/generate_demo_snapshot.ts
node skills/kelly-messenger/scripts/validate_ui_schema.ts
```

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-messenger/config.json`, then put secrets in local env files only (`KELLY_MESSENGER_ENV_FILE`, repo `.env`, `.env.local`, or `~/.config/kelly-messenger/.env`). Never commit real tokens, chat exports, or files under `app/.data/`.

## Boundary

The app is local-only (`127.0.0.1`) and cannot send messages — the composer queues drafts into `app/.data/outbox.json`. Only the skill sends, only replies you approved, only through your own accounts, and only after a dry-run: API connectors via official APIs, browser-based accounts as explicit agent handoffs. Platform terms of service and rate limits are respected.
