---
name: kelly-inquiry
license: MIT
description: Personal App-in-Skill inbound-inquiry reception desk for cross-border/foreign-trade sellers, aggregating WhatsApp, Instagram, Messenger, and email inquiries into a local pipeline with a product knowledge base, quote worksheet, approval queue, and follow-up reminders. Use when the user invokes $kelly-inquiry or /kelly-inquiry, mentions 询盘, inquiry desk, WhatsApp leads, quote management, 报价, foreign trade sales, follow-up reminders, or a lead pipeline, wants inquiries triaged into new/replied/quoted/negotiating/won/lost stages, agent-drafted replies and quotes reviewed before sending, or stale deals surfaced.
---

# Kelly Inquiry

## Overview

Use this skill as Kelly's inbound-inquiry reception desk for foreign-trade sales. Inquiries arrive via WhatsApp, Instagram, Messenger, and email; sales reply late and leads leak. The skill aggregates them into one file-backed App-in-Skill pipeline (new → replied → quoted → negotiating → won/lost), maintains a product knowledge base + FAQ so the agent can draft accurate replies and quotes, enforces approval before anything is sent, and surfaces stale deals past the follow-up SLA.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or load the local inquiry snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Inquiry overview"></td>
    <td width="50%"><img src="assets/screenshots/approvals.webp" alt="Kelly Inquiry approvals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Inquiry command desk with reply SLA counters, weekly channel mix, pipeline funnel, and stale-deal alerts.</td>
    <td><strong>Approvals</strong><br>Approval-gated outbox for replies and quotes — nothing is sent until reviewed.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/inquiries.webp" alt="Kelly Inquiry pipeline"></td>
    <td width="50%"><img src="assets/screenshots/quotes.webp" alt="Kelly Inquiry quotes"></td>
  </tr>
  <tr>
    <td><strong>Pipeline</strong><br>Inquiries across WhatsApp, Instagram, and email with country, stage, value estimate, and next follow-up.</td>
    <td><strong>Quotes</strong><br>Quote worksheets with line items sourced from the product KB, validity, and min-price guards.</td>
  </tr>
</table>

## Boundary

- The app reads and writes local files only and never touches any network beyond `127.0.0.1`. It cannot send anything: the composer queues drafts, the approvals view records verdicts.
- Every outbound reply AND quote is approval-required. The skill executes only items whose approvals status is `approved`, via `scripts/send_approved.ts` (dry-run by default), and never bypasses the dry-run → `--send` sequence.
- Own accounts only: read and send exclusively through accounts the user owns and has configured. Respect each platform's terms of service and rate limits; prefer official APIs; keep collection read-only.
- Never store passwords, QR-login payloads, or session tokens. For `browser_agent` collection the agent drives the user's own already-authenticated web session and stores only inquiry text needed for review.
- Product and pricing data stays local. Treat customer contacts, conversation excerpts, price floors, and quotes as sensitive: do not commit `config.local.json`, env files, `app/.data/`, exports, tokens, or customer PII.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before collecting real inquiries.

Private config priority:

1. `KELLY_INQUIRY_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-inquiry/config.local.json`
3. `~/.config/kelly-inquiry/config.json`
4. `skills/kelly-inquiry/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_INQUIRY_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-inquiry/.env.local`
5. `~/.config/kelly-inquiry/.env`

Onboarding asks, turn by turn:

1. Which channels receive inquiries (WhatsApp / Instagram / Messenger / email) and which connector method per account (see Collection Workflow). Ask for non-secret details only: channel, display name, handle, and which env var names hold the tokens. Never ask the user to paste secret values into chat; secrets belong only in local env files.
2. Product KB import: a JSON or CSV file of products (SKU, MOQ, price range incl. `price_min` floors, lead time, specs, FAQ), imported via `scripts/sync_products.ts`.
3. Quote defaults: currency, validity days, incoterm/payment terms, and whether the min-price guard is enabled.
4. Follow-up SLA days per stage (defaults: new 1, replied 2, quoted 3, negotiating 5).
5. Reply style: tone, language policy, signature, and "do not say" guardrails.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the app with:

```bash
skills/kelly-inquiry/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring ports `3000` through `4000`, or `KELLY_INQUIRY_UI_PORT` when set. `/api/state` identifies the app as `kelly-inquiry`.

Required app views (hash routes):

- `#/overview`: inquiry command desk. Human-attention panel (replies/quotes awaiting approval, unanswered new inquiries, stale deals past the follow-up SLA), KPI cards (inquiries this week with channel badges, reply median time, quotes sent, win rate), a pipeline funnel summary (inline SVG bars: new→replied→quoted→negotiating→won), and an oldest-unanswered indicator.
- `#/inquiries` and `#/inquiries/<id>`: the pipeline table — customer, country flag/code, channel badge, product interest, stage, value estimate, last message age, next follow-up date, owner. Detail: conversation excerpt (bubbles), customer profile (company, country, source), linked products, quote history, an agent-drafted reply with editable text plus `Queue reply` (goes to Approvals), and a follow-up scheduling field.
- `#/quotes` and `#/quotes/<id>`: quote worksheet — quote no, customer, line items, currency, validity, status (`draft`/`sent`/`accepted`/`expired`/`declined`). Detail: editable line items sourced from the product KB (draft quotes only), terms, and agent pricing notes with the min-price guard result from the KB floors.
- `#/approvals`: the review queue with workflow states `needs_review` / `changes_requested` / `approved` / `done` / `blocked` over outgoing replies AND quotes. Each item shows target channel + customer, the draft, reason/context, editable text, decision buttons (approve / request changes / save edit / block), and stable refs (`Reply #1` / `Quote #2`). `done` means sent, with the execution result from the execution report.
- `#/products` and `#/products/<id>`: the product KB — cards with name, SKU, MOQ, price range, lead time, FAQ count; detail with specs and the FAQ entries the agent uses for drafting.
- `#/settings`: sanitized config — channels/accounts with connector method + env readiness booleans, product KB source, quote defaults (currency, validity days, min-price guard), follow-up SLA, data provider, onboarding state, sync log, and last execution report. Never secrets.

Demo mode:

- `?demo=overview`, `?demo=inquiries`, `?demo=quotes`, `?demo=approvals`, and `?demo=detail` (opens the featured hot WhatsApp inquiry `wa-mueller-led-panels` with a drafted reply and a draft quote) select named deterministic mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots. With `lang=zh` the chrome AND agent-generated content (reasons, notes, product names, pricing notes) are localized; drafted replies and conversation quotes stay in the buyer's language. Deep links such as `/?demo=detail&lang=zh#/inquiries/wa-mueller-led-panels` work.
- Demo mode never reads or writes `app/.data/`. Composer, approvals, follow-up, and quote-edit buttons still work but act on in-memory state only and show a demo notice.

UI language: English and Chinese chrome with `Auto` default following the browser language; explicit selector persisted locally. Keep customer names, message content, and drafted outbound text in their original language.

## File Contract

Read `references/inquiry-schema.md` before editing the app, scripts, or any generated JSON.

- `app/.data/inquiry_snapshot.json`: accounts, inquiries (with conversation excerpts), quotes, products (KB), approvals (batch items), metrics, sync log. Written only by the scripts and the app server's queue/decision/follow-up/quote endpoints.
- `app/.data/decisions.json`: user decisions and notes keyed by approval item id.
- `app/.data/agent_tasks.json`: queued agent work — `revise_reply` / `revise_quote` tasks from `request_changes` decisions, plus `follow_up` tasks for stale deals.
- `app/.data/execution_report.json`: latest send run results.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill ingests, syncs, or sends. While it exists the app rejects writes (423) and renders the composer, approvals, follow-up field, and quote editor read-only.

Validate with `node scripts/validate_ui_schema.ts` before relying on a snapshot in the UI.

## Collection Workflow

1. Detect mode. Default to App UI.
2. Load private config. If only `config.example.json` exists, enter onboarding.
3. Collection reuses the connector reality documented in kelly-messenger. Per account, declare a `connector`:
   - `whatsapp_cloud` — WhatsApp Business Cloud API (`access_token_env` + `phone_number_id_env`). Inbound messages arrive via webhook only, so history is collected via ingest payloads; sends use the Cloud API.
   - `instagram_graph` / `messenger_graph` — Meta Graph API for professional-account DMs and Page messages (`access_token_env` + `ig_user_id_env` / `page_id_env`).
   - `email_agent` — hand off to the kelly-email skill: it collects inquiry emails, the agent normalizes them into an ingest payload; sends go back through kelly-email drafts.
   - `browser_agent` — the agent drives the user's own already-authenticated web session (e.g. WhatsApp Web, Instagram web) with the browser skill, then writes a payload. No passwords or QR secrets are ever stored.
   - `manual` — the user or agent prepares an ingest payload by hand.
4. All collected data enters through one write path: `node scripts/ingest_inquiries.ts payload.json`. It validates the payload, dedupes by stable inquiry/message ids, merges into the snapshot, applies the stage heuristic (an outgoing reply promotes `new` → `replied`), updates the account card and sync log, honors the agent lock, and recomputes metrics.
5. While drafting, the agent may attach a `suggested_reply` per inquiry (prefilled in the composer) and queue reply/quote drafts into `snapshot.approvals[]` with `suggested_by: "agent"` and a clear `reason` — always grounded in the product KB and reply style, never below `price_min`.
6. Start/reuse the UI and report the URL. Surface connector problems as snapshot warnings, not silent failures.

## Quoting Workflow

1. Ground every quote in the product KB: SKU, MOQ, tier pricing inside `price_min`–`price_max`, lead time, and FAQ facts (certificates, OEM options, dimming, packaging). Import/refresh the KB with `node scripts/sync_products.ts products.json|products.csv` (zero-dependency CSV parser with quoted-field support).
2. Min-price guard: config `quote_defaults.min_price_guard` plus per-product `price_min` floors. Any line priced below its floor raises a `pricing_alerts` entry; with `block_below_price_min` the agent must not queue such a quote for sending — block it and ask the user instead.
3. Build the quote as a `draft` in `snapshot.quotes[]` (quote no, line items, currency, validity from `validity_days`, terms from quote defaults, pricing notes explaining the tier used and the guard result) and queue a matching `kind: "quote"` approval item referencing it.
4. The user edits draft line items in `#/quotes/<id>` (the server recomputes totals and re-runs the guard) and gives the verdict in `#/approvals`.
5. After a quote is sent, set its status to `sent`; track `accepted` / `expired` / `declined` from the conversation, and move the inquiry stage accordingly (`quoted`, `negotiating`, `won`, `lost`).

## Approval And Send Workflow

`scripts/send_approved.ts` is the executor — there is no separate `execute_decisions.mjs`.

1. Queue: the user writes or edits a reply in the composer (optionally starting from the agent's `suggested_reply`) and clicks `Queue reply`; the app appends it to `snapshot.approvals[]` as `needs_review`. The agent queues its own reply/quote drafts the same way.
2. Review: in `#/approvals` the user approves, edits (`Save edit`), requests changes, or blocks each item. Decisions are mirrored into `decisions.json`; `request_changes` enqueues a `revise_reply`/`revise_quote` task in `agent_tasks.json`.
3. Agent revision loop: poll `agent_tasks.json`, redraft the text honoring the comment, the config `reply_style`, and the KB (re-check the min-price guard for quotes), set the item back to `needs_review`, and mark the task done.
4. Send: only after the user asks to send, run `node scripts/send_approved.ts` (dry-run) and show the plan — planned sends, targets, and missing-token blockers. With explicit approval, run `node scripts/send_approved.ts --send`: it re-checks the lock and each item's approval immediately before sending, sends API-connector items via the official APIs (WhatsApp Cloud, Instagram/Messenger Graph), marks `email_agent`/`browser_agent`/`manual` items as `handoff_to_agent` for the agent to deliver (kelly-email drafts, or the user's own web session), sets sent items to `done`, and writes `execution_report.json`.
5. Report per-item results back to the user with the stable `Reply #N` / `Quote #N` refs.

## Follow-Up Reminders

Stale deals are how leads leak; the agent owns catching them.

1. On every invocation (and after every ingest), compare each active inquiry (`new`/`replied`/`quoted`/`negotiating`) against `follow_up.sla_days` for its stage and its `next_follow_up` date.
2. For each overdue deal, append a `follow_up` task to `agent_tasks.json` (inquiry id, quote id if one expired, and a comment explaining which SLA was exceeded) so the queue survives interruption.
3. Draft the follow-up reply into the approvals batch (`suggested_by: "agent"`, reason citing the SLA breach and deal value), then mark the task done — the human still approves before anything is sent.
4. The UI surfaces the same signal: the sidebar stale-deal counter, the overview "Stale deals past follow-up SLA" panel, and red overdue dates in the pipeline table. The user can reschedule with the follow-up field in the inquiry detail (`/api/inquiries/followup`).
5. When the user asks "what should I chase today", answer from `agent_tasks.json` + the stale list, with `Reply #N` refs for anything already drafted.

## Safety Defaults

- Never send without an `approved` status recorded in the approvals batch, and never bypass the dry-run → `--send` sequence.
- Never quote below a product's `price_min` without an explicit human decision recorded on the item.
- Prefer read-scoped tokens where the platform offers them; keep collection strictly read-only.
- Redact tokens and token-like strings from logs, reports, and UI state; expose only env-var readiness booleans.
- Keep sends idempotent: stable item ids, execution results stored on the item, and re-reading approvals before each send.
- If a send target is missing (`provider_conversation_id`), block that item and ask for configuration instead of guessing.
- Honor platform rate limits; on 429s back off rather than retrying aggressively.
