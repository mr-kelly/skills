# Kelly Support Schema

Use these shapes for the files under `app/.data/`. Keep them stable so the local app, scripts, and future connectors can evolve independently. `scripts/validate_ui_schema.ts` enforces the required fields and cross-references.

## Snapshot (`app/.data/support_snapshot.json`)

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-support",
  "metrics": {
    "account_count": 0,
    "ticket_count": 0,
    "kb_count": 0,
    "open_count": 0,
    "awaiting_approval_count": 0,
    "breaching_sla_count": 0,
    "resolved_count": 0,
    "csat_average": 0,
    "csat_responses": 0,
    "first_response_median_minutes": 0,
    "tickets_this_week": { "total": 0, "by_channel": {} },
    "by_category": {},
    "status_counts": { "needs_review": 0, "changes_requested": 0, "approved": 0, "done": 0, "blocked": 0 },
    "csat_trend": [{ "label": "Jul 6", "score": 4.7 }]
  },
  "accounts": [],
  "tickets": [],
  "knowledge_base": [],
  "sync_log": [],
  "warnings": []
}
```

Written only by the agent (merging collected tickets / KB entries directly into this file — there is no `ingest_tickets.ts` / `sync_knowledge.ts` script yet), by `scripts/execute_decisions.ts`, and by the app server's queue/decision/sla/update endpoints. Demo mode never reads or writes it.

## Account

```json
{
  "account_id": "stable local id",
  "channel": "email|whatsapp|webchat|form|wechat",
  "connector": "email_agent|whatsapp_cloud|webchat_widget|form_intake|wechat_work|manual",
  "display_name": "Support Mailbox",
  "handle": "help@example.com / +… / app.example.com",
  "status": "ok|warning|error|not_configured",
  "ticket_count": 0,
  "unread_count": 0,
  "last_sync_at": "ISO timestamp"
}
```

`email_agent` marks an account whose collection and sending are handed off to kelly-email.

## Ticket

```json
{
  "ticket_id": "stable local id",
  "ref": 1,
  "account_id": "account id",
  "channel": "email|whatsapp|webchat|form|wechat",
  "customer": { "name": "Marta Ochoa", "company": "", "email": "", "handle": "", "country": "ES", "plan": "Pro (annual)" },
  "subject": "Requesting a refund",
  "body": "the original ticket body",
  "category": "bug|how_to|billing|refund|complaint|feature",
  "priority": "urgent|high|normal|low",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "proposed_action": "send_reply|escalate|refund|close|no_action",
  "reason": "why this draft / triage note",
  "suggested_reply": "the KB-grounded reply draft (editable until sent)",
  "kb_refs": ["kb-refunds"],
  "sla": { "policy": "first_response", "due_by": "ISO timestamp", "breached": false, "first_response_at": "ISO or absent" },
  "csat": { "score": 5, "comment": "…", "rated_at": "ISO" },
  "quality_gate": { "verdict": "ship|fix|block", "score": 100, "summary": "…", "checks": [] },
  "owner": "Kelly",
  "unread": true,
  "created_at": "ISO timestamp",
  "last_message_at": "ISO timestamp",
  "last_incoming_at": "ISO timestamp or empty",
  "provider_conversation_id": "platform-native send target",
  "decision": { "action": "approve|request_changes|revise|block", "comment": "", "decided_at": "ISO" },
  "execution": { "status": "executed|pending|error", "operation": "send_reply|escalate|refund|close", "connector": "…", "channel": "…", "target": "…", "tier": "…", "amount": 0, "detail": "…", "executed_at": "ISO" },
  "messages": []
}
```

`provider_conversation_id` is the send target: email address for `email_agent`, `<msisdn>@wa` for WhatsApp, `wc:<session>` for web chat, `wx:<user>` for WeChat. `sla.breached` is DERIVED, never trusted from input — a ticket breaches when it is still open, has no first response, and `due_by` has passed. `quality_gate` is the `support-qa` output (see below). `csat` is present only on rated (usually resolved) tickets. For `proposed_action: refund`, the amount lives on `execution.amount`.

## Message

```json
{
  "message_id": "stable per-ticket id",
  "direction": "incoming|outgoing",
  "sender": "display name (Kelly for own messages)",
  "text": "message body",
  "sent_at": "ISO timestamp",
  "attachment": "optional short note like 'file: screenshot.png'"
}
```

Store only the minimum excerpt needed for review. Never store credentials, QR payloads, or session tokens.

## Knowledge base article / macro (`snapshot.knowledge_base[]`)

```json
{
  "article_id": "kb-refunds",
  "kind": "article|macro",
  "title": "Refund policy (30-day)",
  "body": "the article or canned macro text",
  "tags": ["billing", "refund"],
  "category": "billing",
  "updated_at": "ISO timestamp"
}
```

A ticket's `kb_refs` reference `article_id`s. The `support-qa` gate requires a substantive reply to cite at least one real article and flags any dangling `kb_ref`.

## Quality gate (`ticket.quality_gate`)

```json
{
  "verdict": "ship|fix|block",
  "score": 100,
  "summary": "one-line rationale",
  "checks": [
    { "id": "grounding", "ok": true, "message": "Reply cites 1 KB article(s)." },
    { "id": "kb_refs_resolve", "ok": true, "message": "All cited KB refs resolve." },
    { "id": "no_unapproved_commitment", "ok": true, "message": "No refund or commitment language detected." },
    { "id": "refund_policy", "ok": true, "message": "No refund requested." }
  ]
}
```

`block` is a hard stop: it refuses approval (HTTP 409) and refuses execution even if a stale `approve` decision exists. `fix` is deliverable but should be revised first (usually a dangling KB ref or missing grounding). `ship` is grounded and within policy.

## Decisions (`app/.data/decisions.json`)

```json
{
  "schema_version": "1",
  "updated_at": "ISO timestamp",
  "decisions": {
    "<ticket_id>": {
      "action": "approve|request_changes|revise|block",
      "comment": "operator note",
      "text": "final reply text at decision time",
      "status": "resulting status",
      "decided_at": "ISO timestamp"
    }
  }
}
```

## Agent tasks (`app/.data/agent_tasks.json`)

```json
{
  "schema_version": "1",
  "updated_at": "ISO timestamp",
  "tasks": [
    {
      "task_id": "stable id",
      "type": "revise_reply|fix_grounding",
      "ticket_id": "ticket id",
      "ref": 6,
      "comment": "what the human asked / why the gate flagged it",
      "status": "open|done",
      "requested_at": "ISO timestamp"
    }
  ]
}
```

`revise_reply` tasks come from `request_changes` decisions. `fix_grounding` tasks are written when the gate returns `FIX` (a dangling KB ref or an ungrounded reply): the agent adds a real KB article or drops the ref, re-runs the gate, and marks the task done.

## Execution report (`app/.data/execution_report.json`)

```json
{
  "report_id": "exec-YYYYMMDDHHMM",
  "mode": "send",
  "executed_at": "ISO timestamp",
  "results": [
    {
      "ticket_id": "ticket id",
      "ref": 2,
      "status": "sent|dry_run|skipped|blocked",
      "operation": "send_reply|escalate|refund|close|none",
      "channel": "email|whatsapp|webchat|form|wechat",
      "target": "provider_conversation_id",
      "tier": "engineering (for escalate)",
      "amount": 120,
      "draft_id": "reply-<ticket_id>",
      "reason": "detail"
    }
  ]
}
```

`operation: send_reply` carries `channel` + `draft_id`; `escalate` carries `tier`; `refund` carries `amount` (approval-required). The executor refuses any ticket whose gate verdict is `block`.

## Ingest payload (shape the agent merges directly into `support_snapshot.json`; no ingest script exists yet)

```json
{
  "account_id": "email-support",
  "method": "email_agent",
  "collected_at": "ISO timestamp",
  "tickets": [
    {
      "ticket_id": "optional stable id (derived from customer + subject when absent)",
      "customer": { "name": "Marta Ochoa", "email": "marta@…", "country": "ES", "plan": "Pro" },
      "subject": "…",
      "body": "…",
      "category": "refund",
      "priority": "high",
      "proposed_action": "refund",
      "suggested_reply": "",
      "kb_refs": [],
      "provider_conversation_id": "marta@…",
      "messages": [
        { "message_id": "och-1", "direction": "incoming", "sender": "Marta Ochoa", "text": "…", "sent_at": "ISO" }
      ]
    }
  ]
}
```

Merging is idempotent: tickets dedupe by `ticket_id`, messages by `message_id`; re-running the same payload adds nothing. On ingest, `sla.breached` is re-derived and `support-qa` runs on any drafted reply.

## Other files

- `app/.data/onboarding.json`: `{ "completed": true, "completed_at": "…", "config_version": "…" }`.
- `app/.data/agent.lock`: `{ "owner": "kelly-support", "message": "…", "started_at": "…" }`. While it exists the app rejects writes (HTTP 423) and renders the composer and decisions read-only.
