# Kelly Inquiry

Kelly Inquiry is a local App-in-Skill inbound-inquiry desk for cross-border / foreign-trade sellers: WhatsApp, Instagram, Messenger, and email inquiries aggregated into one pipeline (new → replied → quoted → negotiating → won/lost), with a product knowledge base for accurate drafting, a quote worksheet with a min-price guard, and an approval queue in front of every outgoing reply and quote.

## What It Shows

- Overview: what awaits your approval, unanswered new inquiries, stale deals past the follow-up SLA, KPI cards (inquiries this week by channel, reply median, quotes sent, win rate), a pipeline funnel, and the oldest-unanswered indicator.
- Inquiries: the pipeline table (customer, country flag, channel badge, product interest, stage, value estimate, last message age, next follow-up, owner) with conversation detail, agent-drafted reply, `Queue reply`, and follow-up scheduling.
- Quotes: the quote worksheet (`draft` / `sent` / `accepted` / `expired` / `declined`) with editable draft line items sourced from the product KB, terms, agent pricing notes, and min-price guard alerts.
- Approvals: the review queue (`needs_review` / `changes_requested` / `approved` / `done` / `blocked`) over replies AND quotes, with stable `Reply #N` / `Quote #N` refs, editable drafts, and approve / request-changes / block decisions. `done` means sent.
- Products: the product KB — SKU, MOQ, price range (incl. the guard floor), lead time, specs, and the FAQ entries the agent drafts from.
- Help & Settings: sanitized config summary (channels, connector methods, env readiness, quote defaults, follow-up SLA), sync log, and the last execution report. Never secrets.

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

## Demo Mode

Run the app and open a safe mock-data scene (a foreign-trade LED-lighting supplier, "Lumina Lighting Co."):

```bash
skills/kelly-inquiry/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=inquiries&lang=en#/inquiries
/?demo=quotes&lang=en#/quotes
/?demo=approvals&lang=en#/approvals
/?demo=detail&lang=en#/inquiries/wa-mueller-led-panels
```

The `detail` scene opens the featured hot WhatsApp inquiry (`wa-mueller-led-panels` — a German distributor asking about MOQ and CE/TÜV certificates) with an agent-drafted reply prefilled and a draft quote linked. The featured inquiry id is stable, so deep links like `/?demo=detail&lang=zh#/inquiries/wa-mueller-led-panels` always work; `lang=zh` localizes the chrome and agent-generated notes while buyer messages stay in their original language. Demo mode never reads or writes local data files; demo edits stay in the browser tab.

## Connector Setup

Each account in the config declares a `connector` and references tokens by env var name only (same vocabulary as kelly-messenger, so the two skills compose):

- WhatsApp Business Cloud API (`whatsapp_cloud`): set `access_token_env` and `phone_number_id_env`. Inbound history is webhook-based, so reading uses ingest payloads; sending uses the Cloud API.
- Instagram / Messenger (`instagram_graph` / `messenger_graph`): Meta Graph API with `access_token_env` plus `ig_user_id_env` / `page_id_env`.
- Email (`email_agent`): collection and sending are handed off to the kelly-email skill; no mail credentials live in this skill.
- WhatsApp Web / anything else (`browser_agent` / `manual`): the agent reads your own logged-in session and imports via `scripts/ingest_inquiries.ts`. No passwords or QR secrets are ever stored.

Scripts:

```bash
node skills/kelly-inquiry/scripts/ingest_inquiries.ts payload.json   # single write path for collected inquiries
node skills/kelly-inquiry/scripts/sync_products.ts products.csv      # import/refresh the product KB (JSON or CSV)
node skills/kelly-inquiry/scripts/send_approved.ts                   # dry-run; add --send to execute approved items
node skills/kelly-inquiry/scripts/generate_demo_snapshot.ts
node skills/kelly-inquiry/scripts/validate_ui_schema.ts
```

## Product KB Format

`sync_products.ts` accepts JSON (`{ "products": [...] }` or a bare array with `product_id`, `sku`, `name`, `category`, `moq`, `price_min`, `price_max`, `currency`, `lead_time_days`, `specs{}`, `faq[]`) or CSV with the same columns, where `specs` is `Key=Value|Key=Value` and `faq` is `Question?=>Answer|Question?=>Answer`. Quoted CSV fields (with commas or `""` escapes) are supported. `price_min` is the margin-guard floor: quote lines below it raise alerts, and with `quote_defaults.min_price_guard.block_below_price_min` they must not be sent without an explicit human decision.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-inquiry/config.json`, then put secrets in local env files only (`KELLY_INQUIRY_ENV_FILE`, repo `.env`, `.env.local`, or `~/.config/kelly-inquiry/.env`). Never commit real tokens, customer exports, price floors, or files under `app/.data/`.

## Boundary

The app is local-only (`127.0.0.1`) and cannot send anything — the composer and quote worksheet only write to local files. Every outgoing reply and quote requires your approval; only the skill sends, only through your own accounts, and only after a dry-run: API connectors via official Meta APIs, email via kelly-email, browser-based accounts as explicit agent handoffs. Product and pricing data stays local; platform terms of service and rate limits are respected; no passwords or QR-login payloads are ever stored.
