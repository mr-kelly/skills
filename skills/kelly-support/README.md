# Kelly Support

Kelly Support is a Busabase-backed App-in-Skill customer-support desk (help
desk) for post-sales support: tickets from email, WhatsApp, in-app web chat,
a contact form, and WeChat aggregated into one approval pipeline
(`needs_review` → `changes_requested` → `approved` → `done` / `blocked`),
with a knowledge base for grounded drafting, a pre-send quality gate
(`support-qa`) that outputs SHIP / FIX / BLOCK, and SLA + CSAT tracking. It
is the operator desk (agent + human); the visitor-facing chat bubble is a
documented future extension (see `references/embeddable-widget.md`).

## What It Shows

- **Overview**: what awaits your approval, open / breaching-SLA / blocked-by-gate counts, KPI cards (tickets this week by channel, first-response median, CSAT average, resolved), a CSAT trend sparkline, and volume charts by channel and category.
- **Tickets**: the approval queue (customer, subject, channel, category, priority, proposed action, `support-qa` verdict, status, SLA countdown) with conversation detail, the gate panel, an editable KB-grounded reply with its cited references, and Approve / Request changes / Block decisions that write straight to Busabase, plus an SLA reschedule.
- **Knowledge**: the knowledge base — articles and canned macros (title, body, tags) the agent drafts from; each shows the tickets that cite it.
- **SLA & CSAT**: the SLA board (due / breached) plus the CSAT trend and rated tickets with scores and comments.
- **Help & Settings**: sanitized config (channels, connectors, env readiness, SLA policy, risk policy, KB source) and onboarding state. Never secrets.
- The AirApp never sends anything. Every reply and proposed action is approval-required; a `support-qa` BLOCK refuses both approval and execution.

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

## Running Locally

```bash
pnpm --dir content/kelly-support-app install
pnpm --dir content/kelly-support-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see a mock desk ("Nimbus Notes", an invented note-taking
SaaS) without a Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=tickets&lang=en#/tickets
/?demo=knowledge&lang=en#/knowledge
/?demo=sla&lang=en#/sla
/?demo=detail&lang=en#/tickets/tk-ochoa-refund
```

The `detail` scene opens the featured refund ticket (`tk-ochoa-refund`)
whose drafted reply promises the refund and trips the `support-qa` gate to
**BLOCK**. Demo mode never reads or writes Busabase; composer, decision, and
SLA edits act on in-memory state only, running the exact same quality-gate
function the Busabase provider uses.

## Data

All state — accounts, tickets (with their conversation messages), the
knowledge base, the sync log, and SLA/risk-policy config — lives in six
Busabase Bases under one application Folder. See `SKILL.md` and
`references/support-schema.md` for the resource map. The `support-qa`
quality gate and every SLA-breach flag are computed client-side on every
read, never stored. `scripts/execute_decisions.mjs` is the trusted process
that records an execution marker on each approved ticket; it connects with
`BUSABASE_BASE_URL` / `BUSABASE_API_KEY` / `BUSABASE_SPACE_ID` and performs
no send, refund, or channel API call itself.

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small companion UI. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.
