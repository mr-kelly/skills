# Kelly AI Newsroom

Kelly AI Newsroom is a Busabase App-in-Skill cockpit for turning AI and news-source movement into buyer-trigger sales actions. It is built for founders, agencies, consultants, and product sellers who need to know which AI stories actually affect what customers buy.

## What It Shows

- Overview: the one buyer scene worth acting on today, top source-backed signals, ready actions, blocked claims, and source freshness.
- Signals: AI platform, search, enterprise-software, regulator, and media-source changes with evidence links, buyer-intent interpretation, confidence, and risk badges.
- Actions: approved, watch-only, or blocked sales and operating moves tied to a specific trigger.
- Drafts: editable sales openers, LinkedIn posts, and client memos that stay local until approved.
- Sources: monitored news/source categories, freshness, missing coverage, and config readiness.

## How It Flows

1. The agent browses current public sources and writes only business-relevant movement directly into Busabase as signal/action/draft/source records.
2. The app lets Kelly review signals, approve or block actions, and request changes to drafts — every decision writes straight onto the item's own Busabase record.
3. `scripts/execute_decisions.mjs` dry-runs approved handoffs, then marks approved items done with `--apply` after the agent performs the real handoff outside the script.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly AI Newsroom overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly AI Newsroom signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Daily buyer-trigger cockpit with top AI/source signals, approved actions, blocked claims, and source coverage.</td>
    <td><strong>Signals</strong><br>Evidence-backed AI, search, and platform movement interpreted as purchase intent or watch-only noise.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly AI Newsroom actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly AI Newsroom drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Sales and operating moves with approval status, risk notes, and the next concrete handoff.</td>
    <td><strong>Drafts</strong><br>Editable sales openers, LinkedIn posts, and client memos kept behind a review gate.</td>
  </tr>
</table>

## Demo Mode

```bash
pnpm --dir skills/kelly-ai-newsroom/content/kelly-ai-newsroom-app dev
```

Open the printed URL and use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The AirApp reads and writes its own Busabase Bases only. It may prepare evidence-backed drafts and review decisions, but it never publishes, sends messages, mutates CRMs, spends money, or stores private customer data without explicit approval.
