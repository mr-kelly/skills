# Kelly Messenger Schema

Use these shapes for the files under `app/.data/`. Keep them stable so the local app, scripts, and future connectors can evolve independently. `scripts/validate_ui_schema.mjs` enforces the required fields.

## Snapshot (`app/.data/messages_snapshot.json`)

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-messenger",
  "metrics": {
    "account_count": 0,
    "conversation_count": 0,
    "message_count": 0,
    "unread_count": 0,
    "awaiting_reply_count": 0
  },
  "accounts": [],
  "conversations": [],
  "sync_log": [],
  "warnings": []
}
```

## Account

```json
{
  "account_id": "stable local id",
  "platform": "whatsapp|slack|discord|telegram|wechat|imessage|line|messenger",
  "connector": "slack|discord|telegram|whatsapp_cloud|browser_agent|manual",
  "display_name": "WhatsApp Business",
  "workspace": "workspace/server/bot handle, optional",
  "status": "ok|warning|error|not_configured",
  "unread_count": 0,
  "conversation_count": 0,
  "last_sync_at": "ISO timestamp"
}
```

## Conversation

```json
{
  "conversation_id": "stable local id",
  "account_id": "stable local account id",
  "platform": "whatsapp|slack|discord|telegram|...",
  "kind": "dm|group|channel|thread",
  "title": "human-readable chat title",
  "channel": "#support (Slack/Discord channel, optional)",
  "workspace": "workspace/server name, optional",
  "participants": ["sender names"],
  "unread": true,
  "awaiting_reply": true,
  "provider_conversation_id": "platform-native target id used for sends",
  "last_message_at": "ISO timestamp",
  "last_incoming_at": "ISO timestamp or empty",
  "suggested_reply": "optional agent-recommended reply draft, prefilled in the composer",
  "messages": []
}
```

`awaiting_reply` means the newest meaningful message is incoming and Kelly (or the agent) still owes a reply decision. `provider_conversation_id` is the send target: Slack channel id (optionally `channel/thread_ts`), Discord channel id (`chan/<id>`, `dm/<id>`, `thread/<id>`), Telegram chat id, WhatsApp `<msisdn>@wa`.

## Message

```json
{
  "message_id": "stable per-conversation id",
  "direction": "incoming|outgoing",
  "sender": "display name (Kelly for own messages)",
  "text": "message body",
  "sent_at": "ISO timestamp",
  "attachment": "optional short note like 'file: report.csv'"
}
```

Store only the minimum text needed for review. Never store credentials, QR payloads, or raw session tokens in messages.

## Sync Log Entry

```json
{
  "sync_id": "stable id",
  "account_id": "account id",
  "method": "slack|discord|telegram|whatsapp_cloud|browser_agent|manual",
  "at": "ISO timestamp",
  "status": "ok|error",
  "message": "short human-readable result",
  "new_messages": 0
}
```

## Warning

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "account_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```

## Outbox (`app/.data/outbox.json`)

The outbox is this skill's decisions file: every outgoing message lives here until it is sent.

```json
{
  "schema_version": "1",
  "updated_at": "ISO timestamp",
  "replies": [
    {
      "reply_id": "stable local id",
      "ref": 1,
      "conversation_id": "conversation id",
      "account_id": "account id",
      "platform": "whatsapp|slack|discord|telegram|...",
      "conversation_title": "denormalized title for display",
      "text": "the reply draft (editable until sent)",
      "note": "optional operator note for the agent",
      "reason": "why this draft exists / context",
      "suggested_by": "agent|human",
      "status": "needs_review|changes_requested|approved|done|blocked",
      "decision": {
        "action": "approve|request_changes|revise|block",
        "comment": "operator note",
        "decided_at": "ISO timestamp"
      },
      "execution": {
        "status": "executed|handoff|error|pending",
        "operation": "send_message|handoff_to_agent",
        "connector": "slack|discord|telegram|whatsapp_cloud|browser_agent|manual",
        "target": "provider_conversation_id used",
        "detail": "result detail",
        "executed_at": "ISO timestamp"
      },
      "created_at": "ISO timestamp",
      "updated_at": "ISO timestamp"
    }
  ]
}
```

Workflow states: `needs_review` (human verdict needed) → `approved` (ready for `scripts/send_outbox.mjs`) → `done` (sent, execution recorded). `request_changes` moves a reply to `changes_requested` and enqueues an agent task; the agent revises and returns it to `needs_review`. `blocked` means it must not be sent without new information. `ref` is the stable human-facing number (`Reply #1`) used in chat.

## Agent Tasks (`app/.data/agent_tasks.json`)

```json
{
  "schema_version": "1",
  "updated_at": "ISO timestamp",
  "tasks": [
    {
      "task_id": "stable id",
      "type": "revise_reply",
      "reply_id": "outbox reply id",
      "ref": 3,
      "conversation_id": "conversation id",
      "comment": "what the human asked to change",
      "status": "open|done",
      "requested_at": "ISO timestamp"
    }
  ]
}
```

## Execution Report (`app/.data/execution_report.json`)

```json
{
  "report_id": "exec-YYYYMMDDHHMM",
  "mode": "send",
  "executed_at": "ISO timestamp",
  "results": [
    {
      "reply_id": "outbox reply id",
      "ref": 5,
      "conversation_id": "conversation id",
      "status": "executed|handoff|error|skipped",
      "operation": "send_message|handoff_to_agent",
      "connector": "slack|discord|telegram|whatsapp_cloud|browser_agent|manual",
      "target": "provider_conversation_id",
      "detail": "result detail"
    }
  ]
}
```

## Ingest Payload (input to `scripts/ingest_messages.mjs`)

```json
{
  "account_id": "wa-personal",
  "method": "browser_agent|manual",
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
        {
          "message_id": "wa-lena-1",
          "direction": "incoming",
          "sender": "Lena Ortiz",
          "text": "Hi!",
          "sent_at": "ISO timestamp"
        }
      ]
    }
  ]
}
```

## Other Files

- `app/.data/onboarding.json`: `{ "completed": true, "completed_at": "...", "config_version": "..." }`.
- `app/.data/agent.lock`: `{ "owner": "kelly-messenger", "message": "...", "started_at": "..." }`. While it exists the app rejects writes and the composer/outbox render read-only.
