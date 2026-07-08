# Kelly Inquiry Schema

Use these shapes for the files under `app/.data/`. Keep them stable so the local app, scripts, and future connectors can evolve independently. `scripts/validate_ui_schema.ts` enforces the required fields and cross-references.

## Snapshot (`app/.data/inquiry_snapshot.json`)

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-inquiry",
  "base_currency": "USD",
  "metrics": {
    "account_count": 0,
    "inquiry_count": 0,
    "quote_count": 0,
    "product_count": 0,
    "unanswered_new_count": 0,
    "quotes_sent": 0,
    "win_rate": 0,
    "reply_median_minutes": 0,
    "inquiries_this_week": { "total": 0, "by_channel": {} },
    "stage_counts": { "new": 0, "replied": 0, "quoted": 0, "negotiating": 0, "won": 0, "lost": 0 }
  },
  "accounts": [],
  "inquiries": [],
  "quotes": [],
  "products": [],
  "approvals": [],
  "sync_log": [],
  "warnings": []
}
```

Written only by `scripts/ingest_inquiries.ts`, `scripts/sync_products.ts`, `scripts/send_approved.ts`, and the app server's queue/decision/follow-up/quote endpoints. Demo mode never reads or writes it.

## Account

```json
{
  "account_id": "stable local id",
  "channel": "whatsapp|instagram|messenger|email",
  "connector": "whatsapp_cloud|instagram_graph|messenger_graph|email_agent|browser_agent|manual",
  "display_name": "Lumina WhatsApp Business",
  "handle": "+86 755 ... / @handle / sales@example.com",
  "status": "ok|warning|error|not_configured",
  "inquiry_count": 0,
  "unread_count": 0,
  "last_sync_at": "ISO timestamp"
}
```

The connector vocabulary is shared with kelly-messenger (`whatsapp_cloud` / `browser_agent` / `manual`, secrets referenced by `*_env` names) so the two skills compose. `email_agent` marks an account whose collection and sending are handed off to kelly-email.

## Inquiry

```json
{
  "inquiry_id": "stable local id",
  "account_id": "account id",
  "channel": "whatsapp|instagram|messenger|email",
  "customer": {
    "name": "Klaus Müller",
    "company": "Müller Licht Distribution GmbH",
    "country": "DE",
    "source": "WhatsApp inbound / trade-show contact / ..."
  },
  "product_interest": "60×60 LED panels + COB track lights",
  "product_ids": ["prod-panel-6060"],
  "quote_ids": ["q-2026-0731"],
  "stage": "new|replied|quoted|negotiating|won|lost",
  "value_estimate": 18480,
  "currency": "USD",
  "owner": "Kelly",
  "unread": true,
  "created_at": "ISO timestamp",
  "last_message_at": "ISO timestamp",
  "last_incoming_at": "ISO timestamp or empty",
  "next_follow_up": "YYYY-MM-DD or empty",
  "provider_conversation_id": "platform-native send target",
  "suggested_reply": "optional agent-drafted reply, prefilled in the composer",
  "messages": []
}
```

`country` is an ISO-3166 alpha-2 code (rendered as a flag). `provider_conversation_id` is the send target: WhatsApp `<msisdn>@wa`, Instagram `ig:<scoped-user-id>`, Messenger `fb:<psid>`, email address for `email_agent`. Stage heuristic on ingest: a `new` inquiry that already contains an outgoing message is promoted to `replied`; explicit `stage` in a payload always wins.

## Message

```json
{
  "message_id": "stable per-inquiry id",
  "direction": "incoming|outgoing",
  "sender": "display name (Kelly for own messages)",
  "text": "message body",
  "sent_at": "ISO timestamp",
  "attachment": "optional short note like 'file: specs.pdf'"
}
```

Store only the minimum excerpt needed for review. Never store credentials, QR payloads, or session tokens.

## Quote

```json
{
  "quote_id": "stable local id",
  "quote_no": "Q-2026-0731",
  "inquiry_id": "inquiry id",
  "customer": "denormalized 'Name · Company' label",
  "currency": "USD",
  "status": "draft|sent|accepted|expired|declined",
  "issue_date": "YYYY-MM-DD",
  "valid_until": "YYYY-MM-DD",
  "items": [
    {
      "line_id": "l1",
      "product_id": "prod-panel-6060",
      "sku": "LL-PNL-6060-40",
      "description": "LED Panel Light 60×60 40W, UGR<19",
      "qty": 2000,
      "unit_price": 7.4,
      "total": 14800
    }
  ],
  "subtotal": 18480,
  "total": 18480,
  "terms": "FOB Shenzhen · 30% T/T deposit, 70% before shipment",
  "pricing_notes": "agent pricing rationale, tier used, guard result",
  "pricing_alerts": [
    { "product_id": "", "sku": "", "unit_price": 0, "price_min": 0, "message": "unit price below the KB floor" }
  ],
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

`pricing_alerts` is the min-price guard output: any line whose `unit_price` falls below the linked product's `price_min` gets an alert. Only `draft` quotes are editable in the UI; the server recomputes line totals and re-runs the guard on every `/api/quotes/update`.

## Product (KB entry)

```json
{
  "product_id": "prod-panel-6060",
  "sku": "LL-PNL-6060-40",
  "name": "LED Panel Light 60×60 40W",
  "category": "Commercial indoor",
  "moq": 200,
  "price_min": 6.8,
  "price_max": 8.5,
  "currency": "USD",
  "lead_time_days": 15,
  "specs": { "Power": "40W", "CRI": ">80" },
  "faq": [ { "q": "Do you provide CE and TÜV certificates?", "a": "Yes..." } ]
}
```

`price_min` is the margin-guard floor the agent must never quote below without explicit human approval. `faq` entries are the facts the agent may use when drafting replies and quotes.

## Approval item (`snapshot.approvals[]`)

The review batch: every outgoing reply AND quote waits here for a human verdict.

```json
{
  "item_id": "stable local id",
  "ref": 1,
  "kind": "reply|quote",
  "inquiry_id": "inquiry id",
  "quote_id": "quote id for kind=quote (may be empty for proposed quotes)",
  "account_id": "account id",
  "channel": "whatsapp|instagram|messenger|email",
  "customer": "denormalized 'Name · Company' label",
  "text": "the outgoing draft (editable until sent)",
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
    "operation": "send_message|send_quote|handoff_to_agent",
    "connector": "whatsapp_cloud|instagram_graph|messenger_graph|email_agent|browser_agent|manual",
    "target": "provider_conversation_id used",
    "detail": "result detail",
    "executed_at": "ISO timestamp"
  },
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Workflow states: `needs_review` (human verdict needed) → `approved` (ready for `scripts/send_approved.ts`) → `done` (sent; execution recorded from the execution report). `request_changes` moves an item to `changes_requested` and enqueues an agent task; the agent revises and returns it to `needs_review`. `blocked` must not be sent without new information. `ref` is the stable human-facing number (`Reply #1` / `Quote #2`) used in chat.

## Decisions (`app/.data/decisions.json`)

User decisions and notes keyed by item id — the review record mirrored from the approvals batch.

```json
{
  "schema_version": "1",
  "updated_at": "ISO timestamp",
  "decisions": {
    "<item_id>": {
      "action": "approve|request_changes|revise|block",
      "comment": "operator note",
      "text": "final text at decision time",
      "status": "resulting status",
      "decided_at": "ISO timestamp"
    }
  }
}
```

## Agent Tasks (`app/.data/agent_tasks.json`)

```json
{
  "schema_version": "1",
  "updated_at": "ISO timestamp",
  "tasks": [
    {
      "task_id": "stable id",
      "type": "revise_reply|revise_quote|follow_up",
      "item_id": "approval item id (empty for follow_up)",
      "ref": 3,
      "inquiry_id": "inquiry id",
      "quote_id": "quote id or empty",
      "comment": "what the human asked / why the follow-up is due",
      "status": "open|done",
      "requested_at": "ISO timestamp"
    }
  ]
}
```

`revise_*` tasks come from `request_changes` decisions. `follow_up` tasks are written by the agent when a deal passes its follow-up SLA (see SKILL.md); the agent drafts a follow-up reply into the approvals batch and marks the task done.

## Execution Report (`app/.data/execution_report.json`)

```json
{
  "report_id": "exec-YYYYMMDDHHMM",
  "mode": "send",
  "executed_at": "ISO timestamp",
  "results": [
    {
      "item_id": "approval item id",
      "ref": 5,
      "kind": "reply|quote",
      "inquiry_id": "inquiry id",
      "status": "executed|handoff|error|skipped",
      "operation": "send_message|send_quote|handoff_to_agent",
      "connector": "whatsapp_cloud|instagram_graph|messenger_graph|email_agent|browser_agent|manual",
      "target": "provider_conversation_id",
      "detail": "result detail"
    }
  ]
}
```

## Ingest Payload (input to `scripts/ingest_inquiries.ts`)

```json
{
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

Merging is idempotent: inquiries dedupe by `inquiry_id`, messages by `message_id`; re-running the same payload adds nothing.

## Other Files

- `app/.data/onboarding.json`: `{ "completed": true, "completed_at": "...", "config_version": "..." }`.
- `app/.data/agent.lock`: `{ "owner": "kelly-inquiry", "message": "...", "started_at": "..." }`. While it exists the app rejects writes (HTTP 423) and renders the composer, approvals, follow-up field, and quote editor read-only.
