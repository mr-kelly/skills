# Kelly Ecommerce Intel

Kelly Ecommerce Intel is a Busabase App-in-Skill cockpit for turning marketplace, competitor, and buyer-intent movement into listing, ad, and offer decisions. It is built for e-commerce founders, marketplace operators, DTC marketers, and cross-border sellers.

## What It Shows

- Overview: the one SKU, platform, or campaign trigger worth acting on today, top source-backed signals, ready actions, blocked claims, and source freshness.
- Signals: marketplace policy, ranking, fee, logistics, competitor price, ad, review, and search-intent movement with evidence links, buyer-intent interpretation, confidence, and risk badges.
- Actions: approved, watch-only, or blocked listing edits, ad angles, bundle tests, review replies, and campaign briefs tied to a specific trigger.
- Drafts: editable listing copy, ad angles, and customer-reply drafts that stay behind a review gate until approved.
- Sources: monitored marketplace/competitor/trend source categories, freshness, missing coverage, and config readiness.

## How It Flows

1. The agent browses current public sources and writes only business-relevant movement directly into Busabase as signal/action/draft/source records.
2. The app lets Kelly review signals, approve or block actions, and request changes to drafts — every decision writes straight onto the item's own Busabase record.
3. `scripts/execute_decisions.mjs` dry-runs approved handoffs, then marks approved items done with `--apply` after the agent performs the real handoff outside the script.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Ecommerce Intel overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Ecommerce Intel signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Ecommerce seller desk with SKU triggers, platform risks, ready optimizations, and blocked claims.</td>
    <td><strong>Signals</strong><br>Marketplace policy, competitor price, ranking, ad, review, and search-intent changes.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly Ecommerce Intel actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Ecommerce Intel drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Listing edits, ad angles, bundle tests, and review-response tasks with approval status.</td>
    <td><strong>Drafts</strong><br>Editable listing, ad, and customer-response copy held behind the review gate.</td>
  </tr>
</table>

## Demo Mode

```bash
pnpm --dir skills/kelly-ecommerce-intel/content/kelly-ecommerce-intel-app dev
```

Open the printed URL and use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The AirApp reads and writes its own Busabase Bases only. It may prepare evidence-backed drafts and review decisions, but it never publishes, sends messages, mutates CRMs, spends money, or stores private customer data without explicit approval. The skill blocks platform-policy workarounds, fake review behavior, unsupported product claims, IP infringement, and price changes without approval.
