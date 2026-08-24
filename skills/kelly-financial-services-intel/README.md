# Kelly Financial Services Intel

Kelly Financial Services Intel is a Busabase App-in-Skill cockpit for turning market, macro, regulatory, portfolio-theme, and client-question movement into reviewable relationship-management decisions. It is built for financial-service founders, family office operators, analysts, and client advisors.

## What It Shows

- Overview: the client-question trigger worth acting on today, top source-backed signals, ready actions, blocked claims, and source freshness.
- Signals: regulatory, macro, market, portfolio-theme, and client-question movement with evidence links, buyer-intent interpretation, confidence, and risk badges.
- Actions: approved, watch-only, or blocked internal briefs, client education memos, advisor talking points, and risk reminders tied to a specific trigger.
- Drafts: editable client memo, internal brief, and advisor script drafts that stay behind a review gate until approved.
- Sources: monitored regulator/exchange/market-news/competitor/trend source categories, freshness, missing coverage, and config readiness.

## How It Flows

1. The agent browses current public sources and writes only business-relevant movement directly into Busabase as signal/action/draft/source records.
2. The app lets Kelly review signals, approve or block actions, and request changes to drafts — every decision writes straight onto the item's own Busabase record.
3. `scripts/execute_decisions.mjs` dry-runs approved handoffs, then marks approved items done with `--apply` after the agent performs the real handoff outside the script.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Financial Services Intel overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Financial Services Intel signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Financial-services desk with client-question triggers, advisor prep, blocked advice, and source freshness.</td>
    <td><strong>Signals</strong><br>Regulatory, macro, market, portfolio-theme, and competitor movement interpreted as client concern.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly Financial Services Intel actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Financial Services Intel drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Internal briefs, client education tasks, advisor scripts, and risk reminders queued for approval.</td>
    <td><strong>Drafts</strong><br>Editable client memos and advisor scripts that avoid personalized advice and performance promises.</td>
  </tr>
</table>

## Demo Mode

```bash
pnpm --dir skills/kelly-financial-services-intel/content/kelly-financial-services-intel-app dev
```

Open the printed URL and use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The AirApp reads and writes its own Busabase Bases only. It may prepare evidence-backed drafts and review decisions, but it never publishes, sends messages, mutates CRMs, spends money, or stores private customer data without explicit approval. The skill blocks personalized investment advice, suitability conclusions, performance promises, tax/legal advice, and any trade or money movement.
