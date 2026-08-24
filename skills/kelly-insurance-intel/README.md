# Kelly Insurance Intel

Kelly Insurance Intel is a Busabase App-in-Skill cockpit for turning regulator, insurer, product, health, and client-lifecycle movement into reviewable, compliant advisor decisions. It is built for insurance advisors, agency managers, and independent financial consultants.

## What It Shows

- Overview: today's protection-gap or renewal trigger worth acting on, top source-backed signals, ready actions, blocked claims, and source freshness.
- Signals: regulator, insurer, product, premium, claims, benefit, health, travel, and lifecycle movement with evidence links, buyer-intent interpretation, confidence, and risk badges.
- Actions: approved, watch-only, or blocked meeting agendas, client education notes, renewal scripts, and needs-review checklists tied to a specific trigger.
- Drafts: editable client WhatsApp, advisor email, and meeting agenda drafts that stay behind a review gate until approved.
- Sources: monitored news/insurer/regulator/competitor/trend source categories, freshness, missing coverage, and config readiness.

## How It Flows

1. The agent browses current public sources and writes only business-relevant movement directly into Busabase as signal/action/draft/source records.
2. The app lets Kelly review signals, approve or block actions, and request changes to drafts — every decision writes straight onto the item's own Busabase record.
3. `scripts/execute_decisions.mjs` dry-runs approved handoffs, then marks approved items done with `--apply` after the agent performs the real handoff outside the script.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Insurance Intel overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Insurance Intel signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Insurance-advisor desk with protection-gap triggers, renewal actions, blocked advice, and source freshness.</td>
    <td><strong>Signals</strong><br>Regulator, insurer, premium, benefit, health, travel, and lifecycle signals interpreted as review reasons.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly Insurance Intel actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Insurance Intel drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Meeting agendas, renewal checklists, and education tasks queued for approval.</td>
    <td><strong>Drafts</strong><br>Editable client WhatsApp, advisor email, and meeting agenda drafts that avoid suitability or return promises.</td>
  </tr>
</table>

## Demo Mode

```bash
pnpm --dir skills/kelly-insurance-intel/content/kelly-insurance-intel-app dev
```

Open the printed URL and use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The AirApp reads and writes its own Busabase Bases only. It may prepare evidence-backed drafts and review decisions, but it never publishes, sends messages, mutates CRMs, spends money, or stores private customer data without explicit approval. The skill blocks personalized financial advice, product suitability conclusions, return promises, policy interpretation beyond sourced text, and outbound claims without approval.
