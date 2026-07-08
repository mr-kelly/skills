---
name: kelly-support
license: MIT
description: Personal App-in-Skill customer-support desk (help desk) that triages incoming support tickets from email, WhatsApp, web chat, contact forms, and WeChat, drafts KB-grounded replies, and proposes actions, then holds every send behind a human approval queue with a pre-send quality gate (support-qa) that outputs SHIP/FIX/BLOCK, plus SLA and CSAT tracking. Use when the user invokes $kelly-support or /kelly-support, mentions 客服 / 工单 / 支持台, a support desk, help desk, customer service, support tickets, ticket triage, a knowledge base or canned macros, SLA / first-response time, CSAT, escalations, or refund requests, wants incoming tickets triaged into a needs_review → approved → done pipeline, agent-drafted replies grounded in a knowledge base and reviewed before sending, refunds and commitments gated behind human approval, or breaching-SLA tickets surfaced. This is the OPERATOR desk (agent + human), distinct from a visitor-facing chat bubble.
---

# Kelly Support

## Overview

Use this skill as Kelly's post-sales customer-support desk. Support tickets arrive over email, WhatsApp, in-app web chat, a contact form, and WeChat; the agent triages each one, drafts a reply grounded in a knowledge base, and proposes an action (send a reply, escalate, refund, close, or no action). The human reviews, edits, and approves each ticket in one file-backed App-in-Skill before anything is sent. A pre-send quality gate (`support-qa`) scores every drafted reply and returns **SHIP / FIX / BLOCK**; SLA due-by and CSAT are tracked throughout.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or load the local support snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Support overview"></td>
    <td width="50%"><img src="assets/screenshots/knowledge.webp" alt="Kelly Support knowledge base"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Queue health — open, breaching-SLA, and awaiting-approval counts, CSAT trend, and volume by channel and category.</td>
    <td><strong>Knowledge base</strong><br>Articles and canned macros the agent cites when drafting replies.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/sla.webp" alt="Kelly Support SLA board"></td>
    <td width="50%"><img src="assets/screenshots/tickets.webp" alt="Kelly Support ticket queue"></td>
  </tr>
  <tr>
    <td><strong>SLA &amp; CSAT</strong><br>SLA board of due and breached tickets, plus CSAT scores on resolved tickets.</td>
    <td><strong>Tickets</strong><br>Approval queue with the KB-grounded draft reply and the support-qa gate — a refund draft blocked pending human approval.</td>
  </tr>
</table>

## Boundary

- The app reads and writes local files only and never touches any network beyond `127.0.0.1`. It cannot send anything: the composer stores drafts, the decision buttons record verdicts, and `scripts/execute_decisions.ts` only writes an execution report. Real sends, escalations, and refunds are skill-executed post-approval via the configured channel connectors.
- Every outgoing reply AND every proposed action is approval-required. Refund and escalate are high-risk / approval-required; the skill executes only tickets whose recorded decision is `approve` AND whose `support-qa` verdict is not `block`.
- Own accounts only: read and send exclusively through channels the user owns and has configured. Respect each platform's terms of service and rate limits; prefer official APIs; keep collection read-only.
- Never store passwords, QR-login payloads, or session tokens. Store only the ticket text needed for review.
- Customer data stays local. Treat customer contacts, conversation excerpts, plans, and any billing detail as sensitive: do not commit `config.local.json`, env files, `app/.data/`, exports, tokens, or customer PII.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before collecting real tickets.

Private config priority:

1. `KELLY_SUPPORT_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-support/config.local.json`
3. `~/.config/kelly-support/config.json`
4. `skills/kelly-support/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_SUPPORT_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-support/.env.local`
5. `~/.config/kelly-support/.env`

Onboarding asks, turn by turn:

1. Which channels receive tickets (email / WhatsApp / web chat / form / WeChat) and the connector per account (see Collection Workflow). Ask for non-secret details only: channel, display name, handle, and which env var names hold the tokens. Never ask the user to paste secret values into chat; secrets belong only in local env files.
2. Knowledge base import: a JSON file of articles and macros (title, body, tags, category), imported via `scripts/sync_knowledge.ts`.
3. SLA policy: first-response targets per priority (defaults: urgent 2h, high 4h, normal 8h, low 24h) and business hours.
4. Risk policy: whether refunds require approval (default yes), the max auto-refund (default 0), and whether ungrounded replies and unapproved commitments are blocked (default yes).
5. Reply style: tone, language policy, signature, and "do not say" guardrails.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{ "completed": true, "completed_at": "ISO timestamp", "config_version": "1" }
```

## Local App

Start the app with:

```bash
skills/kelly-support/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring ports `3240` through `3999`, or `KELLY_SUPPORT_UI_PORT` when set. `/api/state` identifies the app as `kelly-support`.

Required app views (hash routes):

- `#/overview`: queue-health command desk. Human-attention counts (await your approval, open, breaching-SLA, blocked-by-gate), KPI cards (tickets this week with channel badges, first-response median, CSAT average, resolved), a CSAT trend sparkline, and volume charts by channel and by category.
- `#/tickets` and `#/tickets/<id>`: the approval queue table (ref, customer, subject, channel, category badge, priority, proposed-action badge, `support-qa` verdict badge, status, SLA countdown). Detail: the conversation transcript (bubbles), the agent's `reason`, the full `support-qa` gate panel (verdict + per-check results), an editable KB-grounded reply with its cited `kb_refs`, decision buttons (Save reply / Approve / Request changes / Block), an SLA reschedule field, the customer profile, and the CSAT if rated. Sidebar workflow filters (`#/tickets/needs_review` etc.) narrow the same table.
- `#/knowledge` and `#/knowledge/<id>`: the knowledge base — article and macro cards (title, body, tags). Detail shows the full article and the tickets that cite it.
- `#/sla`: the SLA board (open tickets sorted by due-by, breached ones flagged) plus the CSAT trend and the rated tickets with their scores and comments.
- `#/settings`: sanitized config — channels/accounts with connector + env readiness booleans, KB source, SLA policy, risk policy, data provider, onboarding state, sync log, and the last execution report. Never secrets.

Demo mode:

- `?demo=overview`, `?demo=tickets`, `?demo=knowledge`, `?demo=sla`, and `?demo=detail` (opens the featured refund ticket `tk-ochoa-refund` whose drafted reply trips the gate to BLOCK) select named deterministic mock scenes. Persona: "Nimbus Notes", an invented note-taking SaaS.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots. With `lang=zh` the chrome AND agent-generated content (reasons, notes) are localized; customer messages and drafted replies stay in the customer's language. Deep links like `/?demo=detail&lang=zh#/tickets/tk-ochoa-refund` work.
- Demo mode never reads or writes `app/.data/`. Composer, decision, and SLA buttons still work but act on in-memory state only (the gate re-runs live) and show a demo notice.

UI language: English and Chinese chrome with `Auto` default following the browser language; explicit selector persisted locally. Keep customer names, message content, and drafted replies in their original language.

## File Contract

Read `references/support-schema.md` before editing the app, scripts, or any generated JSON.

- `app/.data/support_snapshot.json`: accounts, tickets (with conversation excerpts, `kb_refs`, `sla`, `csat`, `quality_gate`, `proposed_action`), knowledge_base, metrics, sync_log, warnings. Written only by the scripts and the app server's queue/decision/sla/update endpoints.
- `app/.data/decisions.json`: user decisions keyed by ticket id.
- `app/.data/agent_tasks.json`: queued agent work — `revise_reply` tasks from `request_changes`, and grounding-fix tasks for `FIX` verdicts.
- `app/.data/execution_report.json`: latest execute run results.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill ingests, syncs, or executes. While it exists the app rejects writes (423) and renders the composer and decisions read-only.

Validate with `node scripts/validate_ui_schema.ts` before relying on a snapshot in the UI.

## Collection Workflow

1. Detect mode. Default to App UI.
2. Load private config. If only `config.example.json` exists, enter onboarding.
3. Collection per account declares a `connector`:
   - `email_agent` — hand off to the kelly-email skill: it collects support emails; the agent normalizes them into an ingest payload; replies go back through kelly-email drafts.
   - `whatsapp_cloud` — WhatsApp Business Cloud API (`access_token_env` + `phone_number_id_env`). Inbound arrives via webhook; history is collected via ingest payloads; sends use the Cloud API.
   - `webchat_widget` — the in-app web-chat widget posts transcripts (see `references/embeddable-widget.md` for the future visitor bubble); collection is via ingest payloads.
   - `form_intake` — a contact form writes submissions the agent ingests.
   - `wechat_work` — WeChat Work (`corp_secret_env`).
   - `manual` — the user or agent prepares an ingest payload by hand.
4. All collected data enters through one write path (`scripts/ingest_tickets.ts`): validate, dedupe by stable ticket/message ids, merge into the snapshot, derive SLA breach, run `support-qa` on any drafted reply, honor the agent lock, and recompute metrics.
5. While triaging, the agent classifies each ticket (`category`, `priority`), drafts a `suggested_reply` grounded in the knowledge base with the `kb_refs` it used, and sets a `proposed_action`. It never promises a refund or makes a commitment unless the action is an approved refund.

## Triage & Reply Workflow

1. Ground every reply in the knowledge base: cite the `kb_refs` used. If no article fits, keep the reply a short acknowledgement and log a `fix_grounding` task or draft a new KB article — do not invent facts.
2. Set `proposed_action`: `send_reply` for a normal answer, `escalate` (with a tier) for anything beyond L1, `refund` (approval-required) for eligible refunds, `close` to resolve without a reply, `no_action` for spam or FYI.
3. Run the `support-qa` gate (`runQualityGate`) and attach `quality_gate` (verdict + score + per-check results). See below.
4. Recompute metrics and SLA, validate with `scripts/validate_ui_schema.ts`, then release the lock and start/reuse the UI.

## The Quality Gate — `support-qa` ⛩

Before any send, each drafted reply passes `support-qa`, a CSAT-risk / policy gate producing a score (0–100) and a **SHIP / FIX / BLOCK** verdict:

- **Grounding** — a substantive reply must cite at least one real KB article; a short acknowledgement is exempt.
- **KB refs resolve** — every cited `kb_ref` must resolve to a real article (a dangling ref is a FIX).
- **No unapproved commitment** — a reply that promises a refund, credit, or other commitment is a hard **BLOCK** unless the ticket is an approved refund action.
- **Refund policy** — a `refund` proposed action requires human approval before it can be sent.

Verdicts: **SHIP** (grounded and within policy), **FIX** (deliverable but revise first — usually add or drop a KB ref), **BLOCK** (hard stop — an unapproved commitment/refund or an ungrounded substantive reply). The gate never sends; a human still approves. A `block` verdict refuses approval and refuses execution even if a stale `approve` decision exists.

## Approval & Execution Workflow

1. Queue: the agent drafts the `suggested_reply` and sets `status: needs_review`. The user edits it in the ticket detail and clicks Save reply (re-runs the gate), or decides directly.
2. Review: in the ticket detail the user Approves, Requests changes, or Blocks. `approve` is refused (HTTP 409) while the gate is `BLOCK` — the user must fix the reply (e.g. drop the unapproved refund promise) or Block instead. Decisions mirror into `decisions.json`; `request_changes` enqueues a `revise_reply` task in `agent_tasks.json`.
3. Agent revision loop: poll `agent_tasks.json`, redraft honoring the comment, the config `reply_style`, and the KB (re-run the gate), set the ticket back to `needs_review`, and mark the task done.
4. Execute: only after the user asks, run `node scripts/execute_decisions.ts` (dry-run) and show the plan — `send_reply` / `escalate` / `refund` / `close` operations, targets, and any gate-blocked items. With explicit approval, run `node scripts/execute_decisions.ts --apply`: it re-checks the lock and re-checks each ticket's decision and gate immediately before recording, refuses any `BLOCK`, and writes `execution_report.json`. Real delivery is performed by the channel connectors (kelly-email drafts, WhatsApp Cloud API, the web-chat widget, WeChat Work) per this file — the app itself sends nothing.
5. Report per-ticket results back with the stable `#<ref>` refs.

## SLA & CSAT

- SLA breach is derived, never trusted from input: a ticket breaches when it is still open, has no first response, and its `sla.due_by` has passed relative to the snapshot's reference time. On every invocation (and after ingest), surface breaching tickets on `#/overview`, `#/sla`, and the sidebar counter.
- The user can reschedule a ticket's due-by from the ticket detail (`/api/tickets/sla`).
- CSAT scores (1–5) attach to resolved tickets; the overview and SLA board show the average, responses count, and a trend sparkline.

## Safety Defaults

- Never execute without an `approve` decision recorded, and never bypass the dry-run → `--apply` sequence.
- Never send a reply the `support-qa` gate scored `BLOCK`, and never promise a refund or commitment without an explicit approved refund action.
- Never disable 2FA / make account changes on an unverified request; require identity verification first.
- Prefer read-scoped tokens where the platform offers them; keep collection strictly read-only.
- Redact tokens and token-like strings from logs, reports, and UI state; expose only env-var readiness booleans.
- Keep execution idempotent: stable ticket ids, results stored in the report, and re-reading decisions before each run.
- Honor platform rate limits; on 429s back off rather than retrying aggressively.
