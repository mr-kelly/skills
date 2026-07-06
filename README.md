<div align="center">

# 🧰 mr-kelly/skills

**Kelly's personal AI skills workspace for daily business operations.**

33 App-in-Skill workflows — each an agent operating procedure paired with a calm local browser UI for review, approval, and dashboards.

[![Stars](https://img.shields.io/github/stars/mr-kelly/skills?style=flat&logo=github&color=D97757)](https://github.com/mr-kelly/skills)
[![Last Commit](https://img.shields.io/github/last-commit/mr-kelly/skills?color=D97757)](https://github.com/mr-kelly/skills/commits/main)
[![Skills](https://img.shields.io/badge/skills-33-D97757)](https://mr-kelly.github.io/skills/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[![npx skills add](https://img.shields.io/badge/npx-skills%20add%20mr--kelly%2Fskills-black?logo=npm&logoColor=white)](#install)

**English** · [简体中文](docs/README-zh-CN.md) · [🌐 Browse all skills on the website](https://mr-kelly.github.io/skills/)

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-money-ui.png" alt="kelly-money — money ledger dashboard"></td>
    <td width="50%"><img src="docs/screenshots/kelly-crm-ui.png" alt="kelly-crm — pipeline command desk"></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-drama-ui.png" alt="kelly-drama — short-drama workbench"></td>
    <td width="50%"><img src="skills/kelly-email/assets/screenshots/overview.png" alt="kelly-email — inbox approval desk"></td>
  </tr>
</table>

<sub>Not prompts — real local apps. Every skill ships a browser review desk.</sub>

</div>

---

## Contents

- [What Makes These Different](#what-makes-these-different)
- [Quick Start](#quick-start)
- [Skills](#skills)
- [App UI Screenshots](#app-ui-screenshots)
- [Repository Layout](#layout)

---

This repo collects the skills Kelly uses repeatedly across email, money, content, PR review, short-drama production, music-video planning, and agent setup. It is installable as a skill/plugin bundle, but the center of gravity is not a generic public marketplace — it is a practical set of Kelly-shaped business tools.

---

## What Makes These Different

Most skill libraries are just prompts. **Kelly's skills are App-in-Skill workflows** — each pairs an agent operating procedure with a local browser UI, so there is always a calm place to review before anything happens:

- **The agent operates** — it triages, drafts, reconciles, researches, and plans against your real accounts and exports.
- **You review in a local UI** — a command desk with dashboards, editable drafts, detail panes, and status filters, running on `localhost` with demo-safe data by default.
- **Nothing risky ships without approval** — safe actions are one click; risky ones are blocked at an explicit approval boundary, and you can always hand work back to the agent with notes.

The result is agent speed with a human in the loop — not a black box.

This is not ad-hoc: the pattern follows the **[App-in-Skill specification](https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf)** — a research spec for pairing an agent skill with a local companion UI (the file handoff, the five-state review model, the data-provider seam, onboarding, and safety gates). Every skill here is an implementation of that spec.

---

## Quick Start

1. **Install** — in Claude Code:
   ```text
   /plugin marketplace add mr-kelly/skills
   /plugin install mr-kelly-skills
   ```
   Or for Codex and other agents that can install skills:
   ```bash
   npx skills add mr-kelly/skills
   ```
2. **Invoke a skill** — e.g. `$kelly-money` to review cashflow, or `$kelly-email` to reach inbox zero.
3. **Open the local App UI** — the skill launches a review desk in your browser (demo-safe data by default) where you inspect dashboards, edit drafts, and approve or block actions.

---

## Skills

The `kelly-*` skills are the everyday business tools. Helper skills such as `agent-rules`, `app-in-skill-creator`, and `publish-skills` support the workspace itself.

| Skill | What It Does | When To Use It | Details |
| --- | --- | --- | --- |
| `agent-rules` | Keeps rules and skills for Codex, Claude Code, Copilot, Kiro, Cursor, and Gemini aligned from one source of truth. It creates and verifies symlinks so agents share `AGENTS.md` and `.agents/skills/`. | Use it when setting up a repo for multiple coding agents, checking agent rule drift, or fixing broken skill/rule symlinks. | [View ↗](https://mr-kelly.github.io/skills/s/agent-rules.html) |
| `app-in-skill-creator` | Documents and scaffolds the App-in-Skill pattern: a skill bundled with a small local review UI, local handoff files, locks, scripts, and safe approval boundaries. | Use it when building a skill that needs a browser-based review queue, approval desk, dashboard, or lightweight local workflow. | [View ↗](https://mr-kelly.github.io/skills/s/app-in-skill-creator.html) |
| `publish-skills` | Publishes agent skills and MCP servers to marketplaces and registries: security-scans for private data, validates with `gh skill`, cuts a release, wires the Claude `/plugin` and Codex marketplaces, and preps the MCP Registry and curated stores. | Use it when publishing, releasing, or listing skills, plugins, or MCP servers to skills.sh, Claude Code, Codex, or the MCP Registry. | [View ↗](https://mr-kelly.github.io/skills/s/publish-skills.html) |
| `kelly-email` | Runs an AI-assisted inbox-zero workflow across configured email accounts. It triages unread mail, drafts replies, prepares cleanup actions, and uses a local UI for human approval before execution. | Use it when processing unread email, drafting support replies, archiving or marking messages read after approval, or managing email through an App-in-Skill UI. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-email.html) |
| `kelly-money` | Aggregates Mercury, Stripe, Airwallex, and Creem into a local money ledger dashboard with total cashflow, account health, and account detail views. | Use it when reviewing balances, payments, payouts, fees, refunds, transfers, provider sync status, or total money movement across configured accounts. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-money.html) |
| `kelly-invest-webull` | Aggregates a personal Webull brokerage account into a local read-only portfolio dashboard: holdings, cost basis, market value, unrealized P/L, day change, and allocation by asset type. Read-only — it never places or cancels orders. | Use it when reviewing personal investments, positions, portfolio value, unrealized gains, cash, or asset allocation synced from Webull OpenAPI. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-invest-webull.html) |
| `kelly-family-office` | Consolidates multiple entities' and members' holdings from CSV import and manual entry into one family-office dashboard: total AUM in a base currency, plus roll-ups by entity, asset class, and institution, and performance. Read-only — it never moves money. | Use it when rolling up a family office across individuals, trusts, and companies; reviewing consolidated AUM, asset allocation, custodian exposure, or unrealized performance. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-family-office.html) |
| `kelly-family-fund` | Pools elderly parents' pensions into one steward-managed fund and books the monthly care cost and shared-family spending in a base currency, so every sibling family can see the split is fair. Read-only — it never moves money. | Use it when a family jointly supports elderly parents from a pooled pension: tracking the nursing-home cost and splitting the surplus (transport, meals, birthday gifts, gifts of obligation) transparently across sibling families. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-family-fund.html) |
| `kelly-crm` | Runs a personal CRM over contacts, companies, deals, and interactions with a pipeline dashboard and an agent-drafted follow-up review queue. | Use it when tracking deals and relationships, reviewing pipeline health, or approving and editing follow-up drafts before the agent sends them through other channels. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-crm.html) |
| `kelly-messenger` | Aggregates WhatsApp, Discord, Slack, and Telegram into one unified local inbox with full conversation transcripts and an approval-gated reply outbox. | Use it when reading messages across chat platforms in one place, drafting replies in a single composer, and approving queued outbound messages that the agent then sends via platform connectors. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-messenger.html) |
| `kelly-social` | Social command desk that both monitors and publishes (Aaron's ECHO): unified timeline, account stats, follower trends, and share-of-voice on the monitoring side, plus a content calendar, an agent-drafted post composer, short-video scripts, an approval-gated engagement inbox, and a crisis playbook — every draft passes a social-qa SHIP/FIX/BLOCK gate. | Use it when reviewing social performance and share-of-voice, planning a content calendar, approving posts and short-video scripts, or triaging mentions and replies across platforms. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-social.html) |
| `kelly-support` | Customer-support desk: the agent triages tickets from email, WhatsApp, web chat, forms, and WeChat, drafts replies grounded in a knowledge base, and proposes actions; you review, edit, and approve in a local UI before anything is sent, with an SLA board, CSAT tracking, and a support-qa gate that blocks refunds or commitments made without approval. | Use it when running a support inbox across channels, drafting KB-grounded replies, tracking SLA and CSAT, or approving sensitive actions like refunds and escalations. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-support.html) |
| `kelly-seo` | Search desk covering SEO + GEO: Google Search Console analytics (clicks/impressions/CTR/position, opportunities) plus a generative-engine-optimization side — an AI-visibility tracker across ChatGPT/Perplexity/Gemini/Claude/Copilot, a citability-optimization queue, and brand-entity / knowledge-panel readiness, gated by geo-qa. | Use it when analyzing search performance, tracking and improving how AI engines cite your brand, approving GEO content changes, or fixing knowledge-graph and entity signals. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-seo.html) |
| `kelly-feedback` | Aggregates user feedback from every channel, clusters it into weighted feature requests, and runs a roadmap decision queue with drafted replies and changelog notes. | Use it when triaging user feedback, prioritizing feature requests, or making evidence-backed roadmap promote/decline decisions. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-feedback.html) |
| `kelly-radar` | Market-intelligence desk merging competitor signal monitoring (pricing, changelog, launch, review diffs), a research question workbench with brief approval and cited reports, and keyword/topic trend tracking. | Use it when watching competitors, commissioning deep research reports, or turning rising search and community trends into opportunity cards. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-radar.html) |
| `kelly-devops` | Watches the product fleet: service uptime and latency, SSL certificate and domain expiry, API key rotation, and cloud spend anomalies, with agent-proposed action cards for approval. | Use it when checking service health, catching expiring domains and certificates, reviewing cloud spend spikes, or approving renewal and rotation actions. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-devops.html) |
| `kelly-audit` | Imports orders, invoices, and payments from business exports and audits them against each other: missing invoices, amount mismatches, overdue receivables with aging, duplicates, and unmatched payments, each with an evidence chain and drafted follow-up. | Use it when reconciling the order-invoice-payment chain, chasing receivables, or reviewing finance anomalies before month-end. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-audit.html) |
| `kelly-tickets` | Triages complaints and requests from WeChat exports, call logs, forms, and email into classified tickets, proposes crew dispatches with SLA targets for approval, and tracks everything on a resolution board. | Use it when managing property or facilities complaints, dispatching work orders to crews, or running any intake-classify-dispatch-track workflow. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-tickets.html) |
| `kelly-lesson` | Drafts lesson plans from curriculum materials and the school template, runs a compliance checklist against school requirements, and gives the dean a review queue with teacher feedback drafts and document export. | Use it when standardizing lesson plans across teachers, checking plan compliance, or reviewing and approving teaching plans at scale. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-lesson.html) |
| `kelly-inquiry` | Aggregates WhatsApp, Instagram, Messenger, and email inquiries into a sales pipeline with a product knowledge base, quote worksheets with price guards, an approval-gated outbox, and follow-up reminders. | Use it when handling foreign-trade or DTC inquiries, drafting accurate replies and quotes from a product KB, or catching stale deals before they leak. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-inquiry.html) |
| `kelly-picks` | Product-research radar for cross-border sellers: agent-swept trend candidates from BSR movers, TikTok virals, and rising queries, each with a live margin card (price, landed cost, fees, breakeven ACOS) and a competition read. | Use it when hunting products to sell, pressure-testing margins before committing, or running develop/watch/drop decisions with sourcing and listing briefs. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-picks.html) |
| `kelly-listing` | Listing factory: drafts platform-specific listings (Amazon title/bullets/description/backend terms/A+, Shopify, TikTok Shop, eBay) with locale variants, runs per-platform compliance checks, and exports approved copy. | Use it when writing or localizing marketplace listings, enforcing banned-word and character-limit rules, or batch-reviewing listing drafts before upload. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-listing.html) |
| `kelly-legal-contracts` | Legal-contract review desk for NDAs, MSAs, DPAs, and SOWs: the agent prepares clause issues, fallback language, playbook checks, and issue-list exports; legal reviews and approves in a local UI. | Use it when reviewing contracts, triaging clause risk, maintaining fallback playbooks, approving redline positions, or exporting legal issue lists without sending anything automatically. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-legal-contracts.html) |
| `kelly-ads` | Ad-campaign command desk aggregating Amazon, Meta, TikTok, and Google ads into one board with ACOS/ROAS tracking, deterministic anomaly detection, and approval-gated adjustment cards (negative keywords, bids, budgets). | Use it when reviewing ad spend across platforms, catching zero-conversion spend and budget burnouts, or approving bid and keyword adjustments with evidence. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-ads.html) |
| `kelly-standup` | Team standup board: the agent collects members' daily check-ins from chat channels on demand, structures them into yesterday/today/blockers cards with a team digest, and drafts approval-gated nudges for missing check-ins. | Use it when running daily standups asynchronously, seeing what everyone is working on at a glance, or tracking blockers and participation across the team. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-standup.html) |
| `kelly-writer` | Repurposes one source idea, article, transcript, outline, or announcement into channel-ready drafts for platforms like Xiaohongshu, WeChat, newsletters, LinkedIn, X/Twitter, short video, and SEO snippets. | Use it when turning long-form source material into a multi-platform content pack with local review, edits, approvals, and export. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-writer.html) |
| `kelly-pr-review` | Runs a GitHub PR review desk through `gh` CLI. It gathers review-requested pull requests, prepares review notes, uses a local UI for approval, and executes approved `gh pr review` actions. | Use it when reviewing GitHub pull requests, approving/commenting/requesting changes from a local queue, or batching PR review decisions. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-pr-review.html) |
| `kelly-drama` | Produces short-drama series with a local workbench for series overview, character library, relationship map, episode table, and shot sheets. Generates storyboard images with character reference cards and coordinates AI and human tasks. | Use it when planning and producing a short-drama series end-to-end: writing episode scripts, building character sheets, managing storyboard shots, and reviewing AI-generated images before use. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-drama.html) |
| `kelly-mv` | Builds a pure-visual music video workbench: upload an MP3, write the MV concept, build a cast of on-screen characters with reference cards, and create a shot-by-shot storyboard with generated or uploaded images and draft videos. | Use it when producing a pure-visual music video — no narration or subtitles — by generating or uploading shot images and videos and assembling them over the song. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-mv.html) |
| `kelly-creators` | Influencer/creator-marketing command desk built on the Discover→Plan→Activate→Measure pipeline: the agent sweeps and fit-scores creator candidates (C³ ACE), drafts outreach, briefs, and contracts, and a pre-publish gate (SHIP/FIX/BLOCK) checks FTC disclosure and claim authenticity, all reviewed in a local UI with a ROI board. | Use it when discovering and vetting creators, approving outreach and briefs, running a creator-campaign pipeline, or tracking influencer ROI and budget. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-creators.html) |
| `kelly-campaigns` | Outbound email-marketing desk on the SEND lifecycle (Setup→Engage→Nurture→Deliver): the agent builds segments, drafts campaigns, newsletters, and sequences, and runs pre-send deliverability + subject-line QA behind an EQS quality gate (SHIP/FIX/BLOCK) before anything is scheduled or sent. | Use it when planning email campaigns, newsletters, or lifecycle sequences, checking deliverability and A/B subjects, or approving sends — distinct from `kelly-email` inbox triage. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-campaigns.html) |
| `kelly-launch` | Product-launch command desk on the RAMP framework (Research→Assemble→Mobilize→Prove): the agent assembles the launch checklist, drafts assets, Product Hunt / Hacker News submissions, press pitches, and the launch-day runbook, with a readiness gate scoring launch quality (LQS → SHIP/FIX/BLOCK). | Use it when planning and running a product launch: building the checklist, approving assets and channel submissions, gating launch readiness, or conducting launch day. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-launch.html) |
| `kelly-brand` | Brand-narrative single source of truth on the TALE framework (Trace→Architect→Land→Evaluate): the agent drafts positioning, the message house, story bank, evidence-backed proof points, and vocabulary guardrails, scores narrative quality (NQS → SHIP/FIX/BLOCK), and flags cross-channel drift; you curate which drafts become canonical. | Use it when defining or auditing brand positioning and messaging, curating the canonical narrative and story bank, or catching off-brand drift across channels. | [View ↗](https://mr-kelly.github.io/skills/s/kelly-brand.html) |

---

## App UI Screenshots

Most Kelly skills are more than chat prompts: they ship with local browser UIs for review, approval, dashboards, planning, and handoff workflows. They are useful when the agent can prepare work, but Kelly still needs a clear place to inspect context, edit drafts, compare rows, approve safe actions, block risky ones, or send the agent back with notes.

The common pattern is a local command desk: demo-safe data, status filters, detail panes, editable recommendations, approval controls, dashboards, and local handoff records. The screenshots below show the main use cases for each App UI rather than just isolated screens.

<details>
<summary><b>📸 Expand all App UI galleries</b></summary>

### `kelly-email`

<table>
  <tr>
    <td width="50%"><img src="skills/kelly-email/assets/screenshots/overview.png" alt="Kelly Email overview"></td>
    <td width="50%"><img src="skills/kelly-email/assets/screenshots/inbox-approval.png" alt="Kelly Email inbox approval desk"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Inbox-zero command desk with account context, queue metrics, and review workflow controls.</td>
    <td><strong>Inbox approval desk</strong><br>Mock inbox queue with approvals, sender context, reply drafts, and status filters.</td>
  </tr>
  <tr>
    <td><img src="skills/kelly-email/assets/screenshots/needs-review.png" alt="Kelly Email needs review"></td>
    <td><img src="skills/kelly-email/assets/screenshots/blocked-security.png" alt="Kelly Email blocked security request"></td>
  </tr>
  <tr>
    <td><strong>Needs review</strong><br>Human-in-the-loop review scene for a partnership reply that needs tone and timing judgment.</td>
    <td><strong>Blocked security request</strong><br>Risk-heavy email scenario where the assistant blocks a suspicious request instead of drafting a reply.</td>
  </tr>
</table>

### `kelly-money`

Kelly Money is a local finance dashboard for seeing money movement across Mercury, Stripe, Airwallex, and Creem without exposing live credentials or provider data in documentation. Demo mode shows the intended operating surface: total cashflow, provider/account columns, account health, invoice matching, exception review, and drill-down detail for reconciliation.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-money-ui.png" alt="Kelly Money overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-money-ledger.png" alt="Kelly Money total ledger"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Money command desk with account health, recent movement, and top-level inflow, outflow, fees, and net totals.</td>
    <td><strong>Total ledger</strong><br>Normalized cashflow table across providers, accounts, transaction types, fees, statuses, and signed net movement.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-money-accounts.png" alt="Kelly Money accounts"></td>
    <td><img src="docs/screenshots/kelly-money-invoices.png" alt="Kelly Money invoice matching"></td>
  </tr>
  <tr>
    <td><strong>Accounts</strong><br>Provider account inventory with balances, currency, sync status, inflow, fees, and net movement per account.</td>
    <td><strong>Invoice matching</strong><br>Invoice-to-transaction reconciliation with matched items, missing invoices, amount mismatches, and review status.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-money-detail.png" alt="Kelly Money invoice exception detail"></td>
    <td></td>
  </tr>
  <tr>
    <td><strong>Exception detail</strong><br>Invoice exception view with amount/date deltas, matching rule, explicit tolerance, candidate transaction, and audit trail.</td>
    <td></td>
  </tr>
</table>

### `kelly-invest-webull`

Kelly Invest (Webull) is a local read-only portfolio dashboard over a personal Webull brokerage account, connected through the Webull OpenAPI (App Key/Secret, region `us`) with a strict no-trading boundary. Demo mode shows the operating surface without exposing live credentials: portfolio value, unrealized P/L, allocation, positions, and per-account and per-position detail.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-invest-webull-ui.png" alt="Kelly Invest overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-invest-webull-positions.png" alt="Kelly Invest positions"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Portfolio command desk with market value, unrealized P/L, day change, cash, an allocation-by-asset-type donut, and top day movers.</td>
    <td><strong>Positions</strong><br>Sortable holdings table across symbol, asset type, quantity, average cost, last price, market value, unrealized P/L, and portfolio weight.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-invest-webull-accounts.png" alt="Kelly Invest accounts"></td>
    <td><img src="docs/screenshots/kelly-invest-webull-detail.png" alt="Kelly Invest position detail"></td>
  </tr>
  <tr>
    <td><strong>Accounts</strong><br>Per-account view (cash and margin) with net liquidation, total cash, buying power, and the positions held in each account.</td>
    <td><strong>Position detail</strong><br>Single-symbol view with cost basis, market value, unrealized P/L and percentage, day change, weight, and holding account.</td>
  </tr>
</table>

### `kelly-family-office`

Kelly Family Office consolidates the holdings of multiple entities and members — individuals, trusts, and companies — from CSV import and manual entry into one read-only dashboard, converted to a base currency. Demo mode shows the intended operating surface with no live account data: total AUM and unrealized P/L, with roll-ups by entity, asset class, institution, and performance.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-family-office-ui.png" alt="Kelly Family Office overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-family-office-entities.png" alt="Kelly Family Office by entity"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Consolidated command desk with total AUM in the base currency, unrealized P/L, entity and account counts, and headline allocation.</td>
    <td><strong>By entity / member</strong><br>Each family entity (individual, trust, company) with its consolidated AUM, portfolio weight, and unrealized P/L.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-family-office-assets.png" alt="Kelly Family Office by asset class"></td>
    <td><img src="docs/screenshots/kelly-family-office-institutions.png" alt="Kelly Family Office by institution"></td>
  </tr>
  <tr>
    <td><strong>By asset class</strong><br>Allocation across equity, bond, cash, crypto, real estate, private equity, and alternatives, with a donut, weighted bars, and a value table.</td>
    <td><strong>By account / institution</strong><br>Consolidation by custodian and institution to see where assets are held and concentration across banks and brokers.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-family-office-performance.png" alt="Kelly Family Office performance"></td>
    <td></td>
  </tr>
  <tr>
    <td><strong>Performance</strong><br>Cost basis versus market value and unrealized P/L, per entity and for the whole family office, in the base currency.</td>
    <td></td>
  </tr>
</table>

### `kelly-family-fund`

Kelly Family Fund is a local, read-only ledger for a family pooling elderly parents' pensions into one steward-managed fund. It books the fixed care cost (nursing home) and splits the remaining surplus — transport, meals, birthday gifts, gifts of obligation — fairly across the sibling families, so the bookkeeping itself is the guarantee of fairness. Demo mode shows a six-month CNY fund with no real account data.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-family-fund-ui.png" alt="Kelly Family Fund overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-family-fund-ledger.png" alt="Kelly Family Fund ledger"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Fund balance, this-month income / expense / net, care and family totals, an expense-by-category donut, running-balance trend, and read-only insights.</td>
    <td><strong>Ledger</strong><br>Unified income and expense timeline by month, each entry tagged with its category and the sibling family it benefits.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-family-fund-family.png" alt="Kelly Family Fund fairness by family"></td>
    <td><img src="docs/screenshots/kelly-family-fund-category.png" alt="Kelly Family Fund by category"></td>
  </tr>
  <tr>
    <td><strong>By family (fairness)</strong><br>Each sibling family's cumulative benefit, share, and deviation from the average — care excluded, shared costs split equally — so anyone can confirm it is balanced.</td>
    <td><strong>By category</strong><br>Spending across care, transport, meals, gifts, and gifts of obligation, with the care-versus-family split.</td>
  </tr>
</table>

### `kelly-writer`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-content-ui.png" alt="Kelly Writer todo queue"></td>
    <td width="50%"><img src="docs/screenshots/kelly-content-topics.png" alt="Kelly Writer topic discovery"></td>
  </tr>
  <tr>
    <td><strong>Todo queue</strong><br>Confirmed content directions queued for AI writing, with ownership, status, and next-step controls.</td>
    <td><strong>Topic discovery</strong><br>Mock editorial planning with keyword clusters, audience fit, and topic opportunities.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-content-main.png" alt="Kelly Writer main draft"></td>
    <td><img src="docs/screenshots/kelly-content-distribution.png" alt="Kelly Writer distribution review"></td>
  </tr>
  <tr>
    <td><strong>Main draft</strong><br>Long-form writing workspace with outline, draft sections, source notes, and approval status.</td>
    <td><strong>Distribution review</strong><br>Channel handoff view for publishing, social snippets, newsletter framing, and final checks.</td>
  </tr>
</table>

### `kelly-pr-review`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-pr-review-ui.png" alt="Kelly PR Review overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-pr-review-review.png" alt="Kelly PR Review needs review"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Pull request review desk with repository filters, status counts, and reviewer configuration.</td>
    <td><strong>Needs review</strong><br>Mock pull request review with findings, confidence signals, test notes, and suggested actions.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-pr-review-ready.png" alt="Kelly PR Review ready to approve"></td>
    <td><img src="docs/screenshots/kelly-pr-review-blocked.png" alt="Kelly PR Review blocked review"></td>
  </tr>
  <tr>
    <td><strong>Ready to approve</strong><br>Approval-focused review where checks pass and the final recommendation is ready to send.</td>
    <td><strong>Blocked review</strong><br>Security-sensitive PR scenario with unresolved risk, blocking rationale, and reviewer handoff details.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-pr-review-needs-test.png" alt="Kelly PR Review merged PR needs test"></td>
    <td><img src="docs/screenshots/kelly-pr-review-tested.png" alt="Kelly PR Review tested verification"></td>
  </tr>
  <tr>
    <td><strong>Needs test</strong><br>Merged pull request waiting for human verification with a required test note or screenshot evidence.</td>
    <td><strong>Tested</strong><br>Post-merge verification record showing the local test note that proves a human checked the change.</td>
  </tr>
</table>

### `kelly-drama`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-drama-ui.png" alt="Kelly Drama overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-drama-episodes.png" alt="Kelly Drama episode table"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Series workbench with health dashboard, execution timeline, stats, and settings for series parameters.</td>
    <td><strong>Episode table</strong><br>Episode list with script and storyboard status, shot readiness indicators, and per-episode detail pane.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-drama-characters.png" alt="Kelly Drama character library"></td>
    <td><img src="docs/screenshots/kelly-drama-relationships.png" alt="Kelly Drama relationship map"></td>
  </tr>
  <tr>
    <td><strong>Character library</strong><br>Character list with three-view image status, actor settings, wardrobe, and voice preview controls.</td>
    <td><strong>Relationship map</strong><br>Character relationship view with power dynamics, evidence links, and relationship detail pane.</td>
  </tr>
</table>

### `kelly-mv`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-mv-ui.png" alt="Kelly MV concept view"></td>
    <td width="50%"><img src="docs/screenshots/kelly-mv-storyboard.png" alt="Kelly MV storyboard"></td>
  </tr>
  <tr>
    <td><strong>Concept</strong><br>MV concept workbench with project checklist, next-step guidance, concept form, and how-to walkthrough.</td>
    <td><strong>Storyboard</strong><br>Shot list with duration, image status, and a detail pane for description, image generation, and video upload.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-mv-cast.png" alt="Kelly MV cast"></td>
    <td><img src="docs/screenshots/kelly-mv-song.png" alt="Kelly MV song"></td>
  </tr>
  <tr>
    <td><strong>Cast</strong><br>Character list with reference card status and a detail form for visual description, wardrobe, and consistency anchors.</td>
    <td><strong>Song</strong><br>MP3 upload and song metadata form with auto-detected duration and song-gen backend status.</td>
  </tr>
</table>

### `kelly-crm`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-crm-ui.png" alt="Kelly CRM overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-crm-deals.png" alt="Kelly CRM deal pipeline"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>CRM command desk with pipeline totals by stage, follow-ups due, recent activity, and network counts.</td>
    <td><strong>Deals</strong><br>Pipeline table across stages with amounts, probability, next steps, and a per-deal interaction timeline.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-crm-contacts.png" alt="Kelly CRM contacts"></td>
    <td><img src="docs/screenshots/kelly-crm-followups.png" alt="Kelly CRM follow-up queue"></td>
  </tr>
  <tr>
    <td><strong>Contacts</strong><br>Contact list with relationship strength, last touch, and per-contact interaction history and open deals.</td>
    <td><strong>Follow-up queue</strong><br>Agent-drafted follow-up messages with editable drafts, risk badges, and approve/request-changes/block decisions.</td>
  </tr>
</table>

### `kelly-messenger`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-messenger-ui.png" alt="Kelly Messenger overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-messenger-inbox.png" alt="Kelly Messenger unified inbox"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Messaging command desk with reply-decision counts, per-platform sync status, and oldest-waiting indicator.</td>
    <td><strong>Unified inbox</strong><br>Conversations across WhatsApp, Slack, Discord, and Telegram sorted by latest activity with waiting-time badges.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-messenger-chat.png" alt="Kelly Messenger conversation"></td>
    <td><img src="docs/screenshots/kelly-messenger-outbox.png" alt="Kelly Messenger reply outbox"></td>
  </tr>
  <tr>
    <td><strong>Conversation</strong><br>Chat transcript with an agent-suggested reply prefilled in the composer, ready to edit and queue.</td>
    <td><strong>Reply outbox</strong><br>Approval queue for outgoing replies: every message is reviewed before the agent sends it via platform connectors.</td>
  </tr>
</table>

### `kelly-social`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-social-ui.png" alt="Kelly Social overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-social-timeline.png" alt="Kelly Social unified timeline"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Cross-platform KPI cards for X, Instagram, and Facebook with follower trends and top posts of the week.</td>
    <td><strong>Unified timeline</strong><br>Posts across all platforms in one stream with per-post likes, replies, reposts, and view counts.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-social-compose.png" alt="Kelly Social post composer"></td>
    <td><img src="docs/screenshots/kelly-social-calendar.png" alt="Kelly Social content calendar"></td>
  </tr>
  <tr>
    <td><strong>Compose (publishing)</strong><br>Agent-drafted posts in a review queue with hooks, hashtags, and CTAs, behind a social-qa SHIP/FIX/BLOCK gate — one draft blocked for a banned claim.</td>
    <td><strong>Content calendar</strong><br>Scheduled posts across channels by theme pillar and date, with status and approvals.</td>
  </tr>
</table>

### `kelly-support`

Customer-support desk — KB-grounded drafted replies, SLA + CSAT, and a support-qa gate. The visitor chat widget is a documented future extension.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-support-ui.png" alt="Kelly Support overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-support-tickets.png" alt="Kelly Support ticket queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Queue health — open, breaching-SLA, and awaiting-approval counts, CSAT trend, and volume by channel and category.</td>
    <td><strong>Tickets</strong><br>Approval queue with the KB-grounded draft reply and the support-qa gate — a refund draft blocked pending human approval.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-support-knowledge.png" alt="Kelly Support knowledge base"></td>
    <td><img src="docs/screenshots/kelly-support-sla.png" alt="Kelly Support SLA board"></td>
  </tr>
  <tr>
    <td><strong>Knowledge base</strong><br>Articles and canned macros the agent cites when drafting replies.</td>
    <td><strong>SLA &amp; CSAT</strong><br>SLA board of due and breached tickets, plus CSAT scores on resolved tickets.</td>
  </tr>
</table>

### `kelly-seo`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-seo-ui.png" alt="Kelly SEO overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-seo-queries.png" alt="Kelly SEO queries"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Search Console KPI cards with daily clicks/impressions chart, top movers, and per-site freshness.</td>
    <td><strong>Queries</strong><br>Top queries with clicks, impressions, CTR, position, period deltas, and opportunity badges.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-seo-geo.png" alt="Kelly SEO AI visibility"></td>
    <td><img src="docs/screenshots/kelly-seo-optimize.png" alt="Kelly SEO GEO optimizer"></td>
  </tr>
  <tr>
    <td><strong>AI visibility (GEO)</strong><br>An engines×prompts matrix of where the brand is cited across ChatGPT, Perplexity, Gemini, Claude, and Copilot, with an overall visibility score and trend.</td>
    <td><strong>GEO optimizer</strong><br>Agent-proposed rewrites that make pages more citable by AI engines, gated by geo-qa — one blocked for a fabricated stat.</td>
  </tr>
</table>

### `kelly-feedback`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-feedback-ui.png" alt="Kelly Feedback overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-feedback-inbox.png" alt="Kelly Feedback inbox"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Voice-of-customer desk with weekly inflow by channel, sentiment split, top clusters, and source freshness.</td>
    <td><strong>Inbox</strong><br>Raw feedback stream across email, Discord, Slack, X, and app-store reviews with triage controls.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-feedback-requests.png" alt="Kelly Feedback requests"></td>
    <td><img src="docs/screenshots/kelly-feedback-roadmap.png" alt="Kelly Feedback roadmap decisions"></td>
  </tr>
  <tr>
    <td><strong>Requests</strong><br>Clustered feature requests with frequency, weighted scores, trend, and representative quotes.</td>
    <td><strong>Roadmap decisions</strong><br>Agent-proposed promote/decline/merge proposals with drafted changelog notes and user replies for approval.</td>
  </tr>
</table>

### `kelly-radar`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-radar-ui.png" alt="Kelly Radar overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-radar-signals.png" alt="Kelly Radar competitor signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Market-intelligence desk with signals to triage, watchlist freshness, top trend movers, and the research pipeline.</td>
    <td><strong>Signals</strong><br>Competitor pricing, changelog, launch, review, and hiring signals with severity badges and Act/Watch/Ignore triage.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-radar-research.png" alt="Kelly Radar research desk"></td>
    <td><img src="docs/screenshots/kelly-radar-trends.png" alt="Kelly Radar trends"></td>
  </tr>
  <tr>
    <td><strong>Research desk</strong><br>Research questions moving through brief approval, deep research, and cited report review.</td>
    <td><strong>Trends</strong><br>Rising keywords and community topics with momentum sparklines and opportunity cards for content or roadmap handoff.</td>
  </tr>
</table>

### `kelly-devops`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-devops-ui.png" alt="Kelly DevOps overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-devops-services.png" alt="Kelly DevOps services"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Fleet health desk with service, certificate, domain, and spend summaries plus a recent events feed.</td>
    <td><strong>Services</strong><br>Monitored endpoints with uptime, latency sparklines, TLS certificate status, and check history.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-devops-expiries.png" alt="Kelly DevOps expiry ledger"></td>
    <td><img src="docs/screenshots/kelly-devops-actions.png" alt="Kelly DevOps action queue"></td>
  </tr>
  <tr>
    <td><strong>Expiry ledger</strong><br>Domains, SSL certificates, key rotations, and plan renewals in one table with color-coded days-left.</td>
    <td><strong>Action queue</strong><br>Agent-proposed renew/rotate/investigate action cards with evidence and approval controls.</td>
  </tr>
</table>

### `kelly-audit`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-audit-ui.png" alt="Kelly Audit overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-audit-orders.png" alt="Kelly Audit orders"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Finance audit desk with amount at risk, receivable aging bar, anomaly queue preview, and import history.</td>
    <td><strong>Orders</strong><br>Normalized orders with invoice and payment status badges and linked anomaly indicators.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-audit-invoices.png" alt="Kelly Audit invoices"></td>
    <td><img src="docs/screenshots/kelly-audit-anomalies.png" alt="Kelly Audit anomaly queue"></td>
  </tr>
  <tr>
    <td><strong>Invoices</strong><br>Invoice ledger with due dates, paid amounts, days overdue, and match status.</td>
    <td><strong>Anomaly queue</strong><br>Rule-flagged anomalies with the order-invoice-payment evidence chain and a drafted chasing email for approval.</td>
  </tr>
</table>

### `kelly-tickets`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-tickets-ui.png" alt="Kelly Tickets overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-tickets-intake.png" alt="Kelly Tickets intake"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Dispatch command desk with SLA risk, weekly intake by channel, category distribution, and crew load.</td>
    <td><strong>Intake</strong><br>Raw complaints from WeChat, phone, forms, and email with classification fields and convert-to-ticket controls.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-tickets-dispatch.png" alt="Kelly Tickets dispatch queue"></td>
    <td><img src="docs/screenshots/kelly-tickets-board.png" alt="Kelly Tickets board"></td>
  </tr>
  <tr>
    <td><strong>Dispatch queue</strong><br>Agent-proposed crew assignments with priority, SLA target, reasoning, and an editable note to the crew.</td>
    <td><strong>Board</strong><br>Tickets tracked across open, assigned, in-progress, waiting, and resolved with SLA indicators and history timelines.</td>
  </tr>
</table>

### `kelly-lesson`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-lesson-ui.png" alt="Kelly Lesson overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-lesson-plans.png" alt="Kelly Lesson plan library"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Teaching-quality desk with compliance pass rate, grade-by-subject coverage, per-teacher status, and the review queue.</td>
    <td><strong>Plan library</strong><br>Lesson plans by subject, grade, and teacher with source badges, compliance scores, and structured plan detail.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-lesson-checks.png" alt="Kelly Lesson compliance checks"></td>
    <td><img src="docs/screenshots/kelly-lesson-review.png" alt="Kelly Lesson review queue"></td>
  </tr>
  <tr>
    <td><strong>Compliance checks</strong><br>Per-rule pass/warn/fail results with evidence snippets, filterable by rule and teacher.</td>
    <td><strong>Review queue</strong><br>Plan submissions with compliance summaries, agent revision suggestions, and drafted teacher feedback for approval.</td>
  </tr>
</table>

### `kelly-inquiry`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-inquiry-ui.png" alt="Kelly Inquiry overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-inquiry-inquiries.png" alt="Kelly Inquiry pipeline"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Inquiry command desk with reply SLA counters, weekly channel mix, pipeline funnel, and stale-deal alerts.</td>
    <td><strong>Pipeline</strong><br>Inquiries across WhatsApp, Instagram, and email with country, stage, value estimate, and next follow-up.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-inquiry-quotes.png" alt="Kelly Inquiry quotes"></td>
    <td><img src="docs/screenshots/kelly-inquiry-approvals.png" alt="Kelly Inquiry approvals"></td>
  </tr>
  <tr>
    <td><strong>Quotes</strong><br>Quote worksheets with line items sourced from the product KB, validity, and min-price guards.</td>
    <td><strong>Approvals</strong><br>Approval-gated outbox for replies and quotes — nothing is sent until reviewed.</td>
  </tr>
</table>

### `kelly-picks`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-picks-ui.png" alt="Kelly Picks overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-picks-candidates.png" alt="Kelly Picks candidates"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Product-research desk with weekly candidates by source, top movers, and per-source sweep freshness.</td>
    <td><strong>Candidates</strong><br>Candidate table with momentum, estimated margin, competition grade, and develop/watch/drop stages.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-picks-detail.png" alt="Kelly Picks margin card"></td>
    <td><img src="docs/screenshots/kelly-picks-decisions.png" alt="Kelly Picks decision queue"></td>
  </tr>
  <tr>
    <td><strong>Margin card</strong><br>Live-editable margin math — price, landed cost, freight, fees, ad cost → margin % and breakeven ACOS — plus a top-10 review-count competition read.</td>
    <td><strong>Decision queue</strong><br>Agent-proposed develop/watch/drop verdicts with sourcing and listing briefs for approval.</td>
  </tr>
</table>

### `kelly-listing`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-listing-ui.png" alt="Kelly Listing overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-listing-drafts.png" alt="Kelly Listing draft workbench"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Listing command desk with product × platform status matrix, compliance pass rate, and export readiness.</td>
    <td><strong>Draft workbench</strong><br>Amazon draft with live title character count, five bullets, backend search terms byte counter, A+ outline, and locale tabs.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-listing-checks.png" alt="Kelly Listing compliance checks"></td>
    <td><img src="docs/screenshots/kelly-listing-review.png" alt="Kelly Listing review queue"></td>
  </tr>
  <tr>
    <td><strong>Compliance checks</strong><br>Per-rule pass/warn/fail results — banned words, character caps, bullet counts — across all drafts.</td>
    <td><strong>Review queue</strong><br>Draft submissions with compliance summaries and keyword-strategy notes for approval before export or publish.</td>
  </tr>
</table>

### `kelly-legal-contracts`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-legal-contracts-ui.png" alt="Kelly Legal Contracts overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-legal-contracts-issues.png" alt="Kelly Legal Contracts issue workbench"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Legal command desk with contract × workstream status, risk pass rate, review queue preview, and recent activity.</td>
    <td><strong>Clause issues</strong><br>Editable issue detail with fallback language, memo fields, reviewer rationale, and risk-check evidence.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-legal-contracts-checks.png" alt="Kelly Legal Contracts risk checks"></td>
    <td><img src="docs/screenshots/kelly-legal-contracts-review.png" alt="Kelly Legal Contracts review queue"></td>
  </tr>
  <tr>
    <td><strong>Risk checks</strong><br>Per-rule pass/warn/fail results across clause issues, including hard-stop terms and playbook violations.</td>
    <td><strong>Review queue</strong><br>Approval-gated legal issue queue with approve / request changes / block decisions and audit notes.</td>
  </tr>
</table>

### `kelly-ads`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-ads-ui.png" alt="Kelly Ads overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-ads-campaigns.png" alt="Kelly Ads campaigns"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Cross-platform ads board: blended ROAS/ACOS vs target, per-platform cards, spend vs revenue bars, and worst offenders.</td>
    <td><strong>Campaigns</strong><br>Campaign table with budget pace, spend, ROAS, and color-coded ACOS vs target across Amazon, Meta, TikTok, and Google.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-ads-alerts.png" alt="Kelly Ads anomaly alerts"></td>
    <td><img src="docs/screenshots/kelly-ads-adjustments.png" alt="Kelly Ads adjustment queue"></td>
  </tr>
  <tr>
    <td><strong>Alerts</strong><br>Deterministic anomaly feed: ACOS breaches, budget burnouts, zero-conversion spend, CPC spikes, rejected ads.</td>
    <td><strong>Adjustment queue</strong><br>Agent-proposed bid, budget, and negative-keyword changes with evidence and expected impact, gated on approval.</td>
  </tr>
</table>

### `kelly-standup`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-standup-ui.png" alt="Kelly Standup today board"></td>
    <td width="50%"><img src="docs/screenshots/kelly-standup-members.png" alt="Kelly Standup members"></td>
  </tr>
  <tr>
    <td><strong>Today board</strong><br>Daily standup at a glance: team digest, participation count, and per-member yesterday/today/blockers cards with source badges.</td>
    <td><strong>Members</strong><br>Team roster with check-in streaks, 30-day participation, open blockers, and per-member update timelines.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-standup-blockers.png" alt="Kelly Standup blockers"></td>
    <td><img src="docs/screenshots/kelly-standup-reminders.png" alt="Kelly Standup reminders"></td>
  </tr>
  <tr>
    <td><strong>Blockers</strong><br>All blockers across the team with severity, age, and agent-suggested next actions.</td>
    <td><strong>Reminders</strong><br>Approval-gated nudges for missing check-ins — drafted by the agent, sent only after review.</td>
  </tr>
</table>

### `kelly-creators`

Influencer/creator-marketing desk on Aaron's Discover→Plan→Activate→Measure pipeline, with C³ ACE fit scores and a SHIP/FIX/BLOCK disclosure gate.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-creators-ui.png" alt="Kelly Creators overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-creators-creators.png" alt="Kelly Creators candidates"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Pipeline funnel across the four phases, budget allocation, total reach, and the top fit-scored candidates.</td>
    <td><strong>Creators</strong><br>Sortable candidate cards with C³ ACE fit scores, platform, niche, and audience size.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-creators-outreach.png" alt="Kelly Creators outreach queue"></td>
    <td><img src="docs/screenshots/kelly-creators-roi.png" alt="Kelly Creators ROI board"></td>
  </tr>
  <tr>
    <td><strong>Outreach</strong><br>Needs-review approval queue with editable outreach drafts and the FTC/claim disclosure gate.</td>
    <td><strong>ROI</strong><br>Per-creator spend, estimated value, CPM, and return once a partnership goes live.</td>
  </tr>
</table>

### `kelly-campaigns`

Outbound email-marketing desk on the SEND lifecycle (Setup→Engage→Nurture→Deliver), with an EQS pre-send quality gate.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-campaigns-ui.png" alt="Kelly Campaigns overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-campaigns-campaigns.png" alt="Kelly Campaigns queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Send calendar plus list health — subscribers, bounce, churn, and complaint rates.</td>
    <td><strong>Campaigns</strong><br>Draft and approval queue across campaigns, newsletters, and sequence steps.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-campaigns-deliverability.png" alt="Kelly Campaigns deliverability QA"></td>
    <td><img src="docs/screenshots/kelly-campaigns-performance.png" alt="Kelly Campaigns performance"></td>
  </tr>
  <tr>
    <td><strong>Deliverability</strong><br>Pre-send QA — SPF/DKIM/DMARC, spam score, and the EQS SHIP/FIX/BLOCK gate.</td>
    <td><strong>Performance</strong><br>Open, click, and unsubscribe rates by campaign.</td>
  </tr>
</table>

### `kelly-launch`

Product-launch command desk on the RAMP framework (Research→Assemble→Mobilize→Prove), gated by a launch-readiness LQS score.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-launch-ui.png" alt="Kelly Launch overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-launch-checklist.png" alt="Kelly Launch checklist"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Launch countdown, the RAMP readiness gate with its LQS score, phase progress, and channel status.</td>
    <td><strong>Checklist</strong><br>Launch tasks grouped by RAMP phase — Research, Assemble, Mobilize, Prove.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-launch-assets.png" alt="Kelly Launch assets queue"></td>
    <td><img src="docs/screenshots/kelly-launch-launchday.png" alt="Kelly Launch launch-day runbook"></td>
  </tr>
  <tr>
    <td><strong>Assets</strong><br>Approval queue for launch assets, Product Hunt / Hacker News submissions, and press pitches.</td>
    <td><strong>Launch day</strong><br>An ordered launch-day runbook with war-room notes.</td>
  </tr>
</table>

### `kelly-brand`

Brand-narrative single source of truth on the TALE framework (Trace→Architect→Land→Evaluate), scored by NQS with a drift monitor.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-brand-ui.png" alt="Kelly Brand message house"></td>
    <td width="50%"><img src="docs/screenshots/kelly-brand-narrative.png" alt="Kelly Brand narrative"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>The message house — positioning, value pillars, overall NQS, and the drift-alert count.</td>
    <td><strong>Narrative</strong><br>Message pillars and vocabulary guardrails, canonical versus draft.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-brand-stories.png" alt="Kelly Brand story bank"></td>
    <td><img src="docs/screenshots/kelly-brand-drift.png" alt="Kelly Brand drift alerts"></td>
  </tr>
  <tr>
    <td><strong>Story bank</strong><br>Customer stories and evidence-backed proof points.</td>
    <td><strong>Drift</strong><br>Cross-channel off-brand alerts — offending usage versus the canonical guardrail.</td>
  </tr>
</table>

</details>

---

## Layout

- `.claude-plugin/marketplace.json` keeps the bundle installable for Claude Code.
- `skills/` contains one folder per skill.
- Each skill folder contains `SKILL.md`.
- App-based skill folders usually include `app/`, local scripts, schema references, demo mode, and a human-facing `README.md`.

---

## Star History

<a href="https://star-history.com/#mr-kelly/skills&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=mr-kelly/skills&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=mr-kelly/skills&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=mr-kelly/skills&type=Date" width="600" />
  </picture>
</a>

<div align="center">

Built by Kelly · Licensed under [MIT](LICENSE) · [🌐 Skills gallery](https://mr-kelly.github.io/skills/)

</div>
