# Kelly Retail Intel

Kelly Retail Intel is a Busabase App-in-Skill cockpit for turning weather, event, competitor promotion, and product-trend movement into reviewable, store-ready decisions. It is built for retail owners, brand operators, store managers, and merchandisers.

## What It Shows

- Overview: today's footfall or hero-SKU trigger worth acting on, top source-backed signals, ready actions, blocked promises, and source freshness.
- Signals: weather, event, holiday, traffic, mall/neighborhood, competitor promotion, product trend, and customer review movement with evidence links, buyer-intent interpretation, confidence, and risk badges.
- Actions: approved, watch-only, or blocked store briefing notes, hero-product picks, signage copy, staff scripts, and replenishment checks tied to a specific trigger.
- Drafts: editable staff brief, IG story, and store sign drafts that stay behind a review gate until approved.
- Sources: monitored news/weather/event/competitor/trend source categories, freshness, missing coverage, and config readiness.

## How It Flows

1. The agent browses current public sources and writes only business-relevant movement directly into Busabase as signal/action/draft/source records.
2. The app lets Kelly review signals, approve or block actions, and request changes to drafts — every decision writes straight onto the item's own Busabase record.
3. `scripts/execute_decisions.mjs` dry-runs approved handoffs, then marks approved items done with `--apply` after the agent performs the real handoff outside the script.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Retail Intel overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Retail Intel signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Retail desk with footfall/hero-SKU triggers, ready store actions, blocked promises, and source freshness.</td>
    <td><strong>Signals</strong><br>Weather, event, competitor promotion, product trend, and review signals interpreted as merchandising reasons.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly Retail Intel actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Retail Intel drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Store briefs, signage, replenishment checks, and staff scripts queued for approval.</td>
    <td><strong>Drafts</strong><br>Editable staff brief, IG story, and store sign drafts that avoid unconfirmed inventory or discount promises.</td>
  </tr>
</table>

## Demo Mode

```bash
pnpm --dir skills/kelly-retail-intel/content/kelly-retail-intel-app dev
```

Open the printed URL and use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The AirApp reads and writes its own Busabase Bases only. It may prepare evidence-backed drafts and review decisions, but it never publishes, sends messages, mutates CRMs, spends money, or stores private customer data without explicit approval. The skill blocks unconfirmed inventory promises, discount commitments, supplier claims, and customer segmentation using private data unless explicitly configured.
