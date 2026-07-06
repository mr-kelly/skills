# Kelly Support

Kelly Support is a local App-in-Skill customer-support desk (help desk) for post-sales support: tickets from email, WhatsApp, in-app web chat, a contact form, and WeChat aggregated into one approval pipeline (needs_review → changes_requested → approved → done / blocked), with a knowledge base for grounded drafting, a pre-send quality gate (`support-qa`) that outputs SHIP / FIX / BLOCK, and SLA + CSAT tracking. It is the operator desk (agent + human); the visitor-facing chat bubble is a documented future extension (see `references/embeddable-widget.md`).

## What It Shows

- Overview: what awaits your approval, open / breaching-SLA / blocked-by-gate counts, KPI cards (tickets this week by channel, first-response median, CSAT average, resolved), a CSAT trend sparkline, and volume charts by channel and category.
- Tickets: the approval queue (customer, subject, channel, category, priority, proposed action, `support-qa` verdict, status, SLA countdown) with conversation detail, the gate panel, an editable KB-grounded reply with its cited references, and Approve / Request changes / Block decisions plus an SLA reschedule.
- Knowledge: the knowledge base — articles and canned macros (title, body, tags) the agent drafts from; each shows the tickets that cite it.
- SLA & CSAT: the SLA board (due / breached) plus the CSAT trend and rated tickets with scores and comments.
- Help & Settings: sanitized config (channels, connectors, env readiness, SLA policy, risk policy, KB source), sync log, and the last execution report. Never secrets.

## Demo Mode

Run the app and open a safe mock-data scene (an invented note-taking SaaS, "Nimbus Notes"):

```bash
skills/kelly-support/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=tickets&lang=en#/tickets
/?demo=knowledge&lang=en#/knowledge
/?demo=sla&lang=en#/sla
/?demo=detail&lang=en#/tickets/tk-ochoa-refund
```

The `detail` scene opens the featured refund ticket (`tk-ochoa-refund` — a customer asking for a refund) whose drafted reply promises the refund and so trips the `support-qa` gate to **BLOCK**: refunds are approval-required, and Approve is refused until a human fixes the reply or approves the refund. The demo also includes a ticket whose reply cites a non-existent KB article (a **FIX**), three tickets breaching their first-response SLA, and resolved tickets with CSAT scores. The featured ticket id is stable, so deep links like `/?demo=detail&lang=zh#/tickets/tk-ochoa-refund` always work; `lang=zh` localizes the chrome and agent-generated notes while customer messages and drafted replies stay in their original language. Demo mode never reads or writes local data files; demo edits stay in the browser tab.

## Connector Setup

Each account in the config declares a `connector` and references tokens by env var name only:

- Email (`email_agent`): collection and sending are handed off to the kelly-email skill; no mail credentials live in this skill.
- WhatsApp Business Cloud API (`whatsapp_cloud`): set `access_token_env` and `phone_number_id_env`. Inbound is webhook-based, so reading uses ingest payloads; sending uses the Cloud API.
- In-app web chat (`webchat_widget`): the widget posts transcripts the agent ingests (see `references/embeddable-widget.md`).
- Contact form (`form_intake`) and WeChat Work (`wechat_work`): form submissions and WeChat messages ingested per account.
- Anything else (`manual`): the agent prepares an ingest payload by hand. No passwords or QR secrets are ever stored.

Scripts:

```bash
node skills/kelly-support/scripts/generate_demo_snapshot.ts   # write a sample snapshot into app/.data
node skills/kelly-support/scripts/validate_ui_schema.ts       # validate the snapshot + decisions
node skills/kelly-support/scripts/execute_decisions.ts        # dry-run; add --apply to record approved operations
```

`scripts/ingest_tickets.ts` and `scripts/sync_knowledge.ts` are the collection/KB-import write paths described in SKILL.md (single dedup-by-id merge, gate re-run).

## The Quality Gate — `support-qa`

Every drafted reply is scored before it can be sent. It **BLOCKS** replies that promise a refund or make a commitment without an approved refund action, or that make a substantive claim without citing a real KB article; it flags **FIX** when a cited KB reference is missing; otherwise **SHIP**. The gate never sends — a human still approves — and a `BLOCK` refuses both approval (HTTP 409) and execution even if a stale approve exists.

## Data Provider

Storage is behind a data-provider seam so the same UI and scripts run against either backend:

```bash
# default: JSON files in app/.data/
skills/kelly-support/app/start.sh
# remote review model on a Busabase base
KELLY_SUPPORT_DATA_PROVIDER=busabase skills/kelly-support/app/start.sh
```

In busabase mode each ticket's agent-drafted reply / proposed action maps to a change-request (queue → change request, approve → review verdict, request changes → rejected review, send/execute → merge). Snapshot ingest and edits are local-only.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-support/config.json`, then put secrets in local env files only (`KELLY_SUPPORT_ENV_FILE`, repo `.env`, `.env.local`, or `~/.config/kelly-support/.env`). Never commit real tokens, customer exports, or files under `app/.data/`.

## Boundary

The app is local-only (`127.0.0.1`) and cannot send anything — the composer and decision buttons only write local files. Every outgoing reply and every proposed action requires your approval; refunds and escalations are high-risk / approval-required; only the skill sends, only through your own accounts, and only after a dry-run. Customer data stays local; platform terms of service and rate limits are respected; no passwords or QR-login payloads are ever stored.
