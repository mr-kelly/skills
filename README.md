# mr-kelly/skills

Kelly's personal AI skills workspace for daily business operations.

[中文版 README](docs/README-zh-CN.md) · **[Browse all skills on the website](https://mr-kelly.github.io/skills/)**

This repo collects the skills Kelly uses repeatedly across email, money, content, PR review, short-drama production, music-video planning, and agent setup. Many of these are **App-in-Skill** workflows: the skill gives the agent the operating procedure, while a bundled local browser UI gives Kelly a calmer place to review, approve, edit, inspect dashboards, or hand work back to the agent.

It is still installable as a skill/plugin bundle, but the center of gravity is not a generic public marketplace. It is a practical set of Kelly-shaped business tools.

## Install

For Codex and other agents that can install skills:

```bash
npx skills add mr-kelly/skills
```

In Claude Code:

```text
/plugin marketplace add mr-kelly/skills
/plugin install mr-kelly-skills
```

## Skills

The `kelly-*` skills are the everyday business tools. Helper skills such as `agent-rules` and `app-in-skill-creator` support the workspace itself.

| Skill | What It Does | When To Use It | README |
| --- | --- | --- | --- |
| `agent-rules` | Keeps rules and skills for Codex, Claude Code, Copilot, Kiro, Cursor, and Gemini aligned from one source of truth. It creates and verifies symlinks so agents share `AGENTS.md` and `.agents/skills/`. | Use it when setting up a repo for multiple coding agents, checking agent rule drift, or fixing broken skill/rule symlinks. | [Open README](skills/agent-rules/README.md) |
| `app-in-skill-creator` | Documents and scaffolds the App-in-Skill pattern: a skill bundled with a small local review UI, local handoff files, locks, scripts, and safe approval boundaries. | Use it when building a skill that needs a browser-based review queue, approval desk, dashboard, or lightweight local workflow. | [Open README](skills/app-in-skill-creator/README.md) |
| `kelly-email` | Runs an AI-assisted inbox-zero workflow across configured email accounts. It triages unread mail, drafts replies, prepares cleanup actions, and uses a local UI for human approval before execution. | Use it when processing unread email, drafting support replies, archiving or marking messages read after approval, or managing email through an App-in-Skill UI. | [Open README](skills/kelly-email/README.md) |
| `kelly-money` | Aggregates Mercury, Stripe, Airwallex, and Creem into a local money ledger dashboard with total cashflow, account health, and account detail views. | Use it when reviewing balances, payments, payouts, fees, refunds, transfers, provider sync status, or total money movement across configured accounts. | [Open README](skills/kelly-money/README.md) |
| `kelly-crm` | Runs a personal CRM over contacts, companies, deals, and interactions with a pipeline dashboard and an agent-drafted follow-up review queue. | Use it when tracking deals and relationships, reviewing pipeline health, or approving and editing follow-up drafts before the agent sends them through other channels. | [Open README](skills/kelly-crm/README.md) |
| `kelly-messenger` | Aggregates WhatsApp, Discord, Slack, and Telegram into one unified local inbox with full conversation transcripts and an approval-gated reply outbox. | Use it when reading messages across chat platforms in one place, drafting replies in a single composer, and approving queued outbound messages that the agent then sends via platform connectors. | [Open README](skills/kelly-messenger/README.md) |
| `kelly-social` | Aggregates Twitter/X, Facebook, and Instagram into one local dashboard: unified timeline, account stats, follower trends, and engagement metrics, collected agent-side via browser automation, analytics exports, or APIs. | Use it when reviewing social accounts, timelines, post performance, follower growth, or traffic across platforms without depending on official APIs. | [Open README](skills/kelly-social/README.md) |
| `kelly-seo` | Connects Google Search Console into a local SEO desk: clicks, impressions, CTR, and position by query and page, with trends and an agent-proposed SEO opportunities review queue. | Use it when analyzing search performance, spotting striking-distance queries, or approving title rewrites, internal links, and content briefs. | [Open README](skills/kelly-seo/README.md) |
| `kelly-feedback` | Aggregates user feedback from every channel, clusters it into weighted feature requests, and runs a roadmap decision queue with drafted replies and changelog notes. | Use it when triaging user feedback, prioritizing feature requests, or making evidence-backed roadmap promote/decline decisions. | [Open README](skills/kelly-feedback/README.md) |
| `kelly-radar` | Market-intelligence desk merging competitor signal monitoring (pricing, changelog, launch, review diffs), a research question workbench with brief approval and cited reports, and keyword/topic trend tracking. | Use it when watching competitors, commissioning deep research reports, or turning rising search and community trends into opportunity cards. | [Open README](skills/kelly-radar/README.md) |
| `kelly-devops` | Watches the product fleet: service uptime and latency, SSL certificate and domain expiry, API key rotation, and cloud spend anomalies, with agent-proposed action cards for approval. | Use it when checking service health, catching expiring domains and certificates, reviewing cloud spend spikes, or approving renewal and rotation actions. | [Open README](skills/kelly-devops/README.md) |
| `kelly-audit` | Imports orders, invoices, and payments from business exports and audits them against each other: missing invoices, amount mismatches, overdue receivables with aging, duplicates, and unmatched payments, each with an evidence chain and drafted follow-up. | Use it when reconciling the order-invoice-payment chain, chasing receivables, or reviewing finance anomalies before month-end. | [Open README](skills/kelly-audit/README.md) |
| `kelly-tickets` | Triages complaints and requests from WeChat exports, call logs, forms, and email into classified tickets, proposes crew dispatches with SLA targets for approval, and tracks everything on a resolution board. | Use it when managing property or facilities complaints, dispatching work orders to crews, or running any intake-classify-dispatch-track workflow. | [Open README](skills/kelly-tickets/README.md) |
| `kelly-lesson` | Drafts lesson plans from curriculum materials and the school template, runs a compliance checklist against school requirements, and gives the dean a review queue with teacher feedback drafts and document export. | Use it when standardizing lesson plans across teachers, checking plan compliance, or reviewing and approving teaching plans at scale. | [Open README](skills/kelly-lesson/README.md) |
| `kelly-inquiry` | Aggregates WhatsApp, Instagram, Messenger, and email inquiries into a sales pipeline with a product knowledge base, quote worksheets with price guards, an approval-gated outbox, and follow-up reminders. | Use it when handling foreign-trade or DTC inquiries, drafting accurate replies and quotes from a product KB, or catching stale deals before they leak. | [Open README](skills/kelly-inquiry/README.md) |
| `kelly-writer` | Repurposes one source idea, article, transcript, outline, or announcement into channel-ready drafts for platforms like Xiaohongshu, WeChat, newsletters, LinkedIn, X/Twitter, short video, and SEO snippets. | Use it when turning long-form source material into a multi-platform content pack with local review, edits, approvals, and export. | [Open README](skills/kelly-content/README.md) |
| `kelly-pr-review` | Runs a GitHub PR review desk through `gh` CLI. It gathers review-requested pull requests, prepares review notes, uses a local UI for approval, and executes approved `gh pr review` actions. | Use it when reviewing GitHub pull requests, approving/commenting/requesting changes from a local queue, or batching PR review decisions. | [Open README](skills/kelly-pr-review/README.md) |
| `kelly-drama` | Produces short-drama series with a local workbench for series overview, character library, relationship map, episode table, and shot sheets. Generates storyboard images with character reference cards and coordinates AI and human tasks. | Use it when planning and producing a short-drama series end-to-end: writing episode scripts, building character sheets, managing storyboard shots, and reviewing AI-generated images before use. | [Open README](skills/kelly-drama/SKILL.md) |
| `kelly-mv` | Builds a pure-visual music video workbench: upload an MP3, write the MV concept, build a cast of on-screen characters with reference cards, and create a shot-by-shot storyboard with generated or uploaded images and draft videos. | Use it when producing a pure-visual music video — no narration or subtitles — by generating or uploading shot images and videos and assembling them over the song. | [Open README](skills/kelly-mv/SKILL.md) |

## App UI Screenshots

Most Kelly skills are more than chat prompts: they ship with local browser UIs for review, approval, dashboards, planning, and handoff workflows. They are useful when the agent can prepare work, but Kelly still needs a clear place to inspect context, edit drafts, compare rows, approve safe actions, block risky ones, or send the agent back with notes.

The common pattern is a local command desk: demo-safe data, status filters, detail panes, editable recommendations, approval controls, dashboards, and local handoff records. The screenshots below show the main use cases for each App UI rather than just isolated screens.

### `kelly-email`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-email-ui.png" alt="Kelly Email overview"></td>
    <td width="50%"><img src="docs/screenshots/kelly-email-all.png" alt="Kelly Email inbox approval desk"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Inbox-zero command desk with account context, queue metrics, and review workflow controls.</td>
    <td><strong>Inbox approval desk</strong><br>Mock inbox queue with approvals, sender context, reply drafts, and status filters.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-email-review.png" alt="Kelly Email needs review"></td>
    <td><img src="docs/screenshots/kelly-email-blocked.png" alt="Kelly Email blocked security request"></td>
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
    <td><img src="docs/screenshots/kelly-social-accounts.png" alt="Kelly Social accounts"></td>
    <td><img src="docs/screenshots/kelly-social-detail.png" alt="Kelly Social account detail"></td>
  </tr>
  <tr>
    <td><strong>Accounts</strong><br>Account inventory with follower counts, engagement rates, collection method, and sync freshness.</td>
    <td><strong>Account detail</strong><br>Per-account profile with follower trend sparkline, top posts, and sync history.</td>
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
    <td><img src="docs/screenshots/kelly-seo-pages.png" alt="Kelly SEO pages"></td>
    <td><img src="docs/screenshots/kelly-seo-opportunities.png" alt="Kelly SEO opportunities"></td>
  </tr>
  <tr>
    <td><strong>Pages</strong><br>Top pages with search performance deltas and indexing warnings.</td>
    <td><strong>Opportunities</strong><br>Agent-proposed SEO actions — title rewrites, internal links, content briefs — with editable drafts and approvals.</td>
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

## Layout

- `.claude-plugin/marketplace.json` keeps the bundle installable for Claude Code.
- `skills/` contains one folder per skill.
- Each skill folder contains `SKILL.md`.
- App-based skill folders usually include `app/`, local scripts, schema references, demo mode, and a human-facing `README.md`.
