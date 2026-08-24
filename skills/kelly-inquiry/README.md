# Kelly Inquiry

Kelly Inquiry is a Busabase-backed App-in-Skill inbound-inquiry reception
desk for cross-border/foreign-trade sellers: WhatsApp, Instagram, Messenger,
and email inquiries aggregated into one pipeline (`new` → `replied` →
`quoted` → `negotiating` → `won`/`lost`), with a product knowledge base for
accurate drafting, a quote worksheet with a min-price guard, and an approval
queue in front of every outgoing reply and quote.

## What It Shows

- **Overview**: what awaits your approval, unanswered new inquiries, stale deals past the follow-up SLA, KPI cards (inquiries this week by channel, reply median, quotes sent, win rate), a pipeline funnel, and the oldest-unanswered indicator.
- **Inquiries**: the pipeline table (customer, country flag, channel badge, product interest, stage, value estimate, last message age, next follow-up, owner) with conversation detail, an agent-drafted reply, `Queue reply`, and follow-up scheduling that write straight to Busabase.
- **Quotes**: the quote worksheet (`draft` / `sent` / `accepted` / `expired` / `declined`) with editable draft line items sourced from the product KB, terms, agent pricing notes, and min-price guard alerts, recomputed live on every edit.
- **Approvals**: the review queue (`needs_review` / `changes_requested` / `approved` / `done` / `blocked`) over replies AND quotes, with stable `Reply #N` / `Quote #N` refs, editable drafts, and approve / request-changes / block decisions. `done` means sent.
- **Products**: the product KB — SKU, MOQ, price range (incl. the guard floor), lead time, specs, and the FAQ entries the agent drafts from.
- **Help & Settings**: sanitized config summary (channels, connector methods, env readiness, quote defaults, follow-up SLA) and the sync log. Never secrets.
- The AirApp never sends anything. Every outgoing reply and quote is approval-required; only the trusted `scripts/send_approved.mjs` process can execute an approved item.

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
  <tr>
    <td width="50%"><img src="assets/screenshots/products.webp" alt="Kelly Inquiry products"></td>
  </tr>
  <tr>
    <td><strong>Products</strong><br>Product catalog behind quotes — specs, MOQ, price range, and lead time per SKU.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir content/kelly-inquiry-app install
pnpm --dir content/kelly-inquiry-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see a mock desk (a foreign-trade LED-lighting supplier,
"Lumina Lighting Co.") without a Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=inquiries&lang=en#/inquiries
/?demo=quotes&lang=en#/quotes
/?demo=approvals&lang=en#/approvals
/?demo=products&lang=en#/products
/?demo=detail&lang=en#/inquiries/wa-mueller-led-panels
```

The `detail` scene opens the featured hot WhatsApp inquiry
(`wa-mueller-led-panels` — a German distributor asking about MOQ and
CE/TÜV certificates) with an agent-drafted reply and a draft quote already
queued for approval. The featured inquiry id is stable, so deep links like
`/?demo=detail&lang=zh#/inquiries/wa-mueller-led-panels` always work;
`lang=zh` localizes the chrome and agent-generated notes while buyer
messages stay in their original language. Demo mode never reads or writes
Busabase; composer, decision, follow-up, and quote-edit actions act on
in-memory state only, running the exact same model functions
(`refreshInquiryDerived`/`recomputeQuoteTotals`/`applyMinPriceGuard`/
`recomputeMetrics`) the Busabase provider uses.

## Connector Setup

Each account declares a `connector` and references tokens by env var name
only (same vocabulary as kelly-messenger, so the two skills compose):

- WhatsApp Business Cloud API (`whatsapp_cloud`): `access_token_env` + `phone_number_id_env`. Inbound history is webhook-based, so reading uses ingest payloads; sending uses the Cloud API.
- Instagram / Messenger (`instagram_graph` / `messenger_graph`): Meta Graph API with `access_token_env` plus `ig_user_id_env` / `page_id_env`.
- Email (`email_agent`): collection and sending are handed off to the kelly-email skill; no mail credentials live in this skill.
- WhatsApp Web / anything else (`browser_agent` / `manual`): the agent reads your own logged-in session and imports via `scripts/ingest_inquiries.mjs`. No passwords or QR secrets are ever stored.

## Data & Trusted Scripts

All state — accounts, inquiries (with their conversation messages), the
product knowledge base, quotes, the approval queue, and the sync log —
lives in eight Busabase Bases under one application Folder. See `SKILL.md`
and `references/inquiry-schema.md` for the resource map. The stage
heuristic, quote totals, the min-price guard, and follow-up staleness are
computed client-side on every read, never stored. Three trusted scripts
connect with their own credentials (`BUSABASE_BASE_URL` /
`BUSABASE_API_KEY` / `BUSABASE_SPACE_ID`), never the AirApp's ambient
session, and are all dry-run by default:

```bash
node skills/kelly-inquiry/scripts/ingest_inquiries.mjs payload.json --apply   # single write path for collected inquiries
node skills/kelly-inquiry/scripts/sync_products.mjs products.csv --apply     # import/refresh the product KB (JSON or CSV)
node skills/kelly-inquiry/scripts/send_approved.mjs --send                   # execute approved replies/quotes
```

`sync_products.mjs` accepts JSON (`{ "products": [...] }` or a bare array
with `product_id`, `sku`, `name`, `category`, `moq`, `price_min`,
`price_max`, `currency`, `lead_time_days`, `specs{}`, `faq[]`) or CSV with
the same columns, where `specs` is `Key=Value|Key=Value` and `faq` is
`Question?=>Answer|Question?=>Answer`. Quoted CSV fields (with commas or
`""` escapes) are supported. `price_min` is the margin-guard floor: quote
lines below it raise alerts, and with `quote_defaults.min_price_guard.
block_below_price_min` they must not be sent without an explicit human
decision.

## Boundary

The AirApp reads and writes only through Busabase and cannot send anything
itself — the composer and quote worksheet only queue drafts for review.
Every outgoing reply and quote requires your approval; only
`scripts/send_approved.mjs` sends, only through your own accounts, and only
after a dry-run: API connectors via official Meta APIs, email via
kelly-email, browser-based accounts as explicit agent handoffs. Product and
pricing data and customer PII never leave Busabase; platform terms of
service and rate limits are respected; no passwords or QR-login payloads
are ever stored.

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small companion UI. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.
