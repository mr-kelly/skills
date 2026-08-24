# Kelly Restaurant Intel

Kelly Restaurant Intel is a Busabase App-in-Skill cockpit for turning weather, event, competitor-menu, review, and delivery-platform movement into reviewable operating and marketing decisions. It is built for restaurant owners, cafe operators, F&B marketers, and group managers.

## What It Shows

- Overview: today's demand trigger, meal-period focus, ready actions, blocked food-safety claims, and source freshness.
- Signals: weather, event, transport, tourism, competitor menu, delivery, booking, and review movement with evidence links, buyer-intent interpretation, confidence, and risk badges.
- Actions: approved, watch-only, or blocked shift briefs, hero-menu picks, delivery copy, review replies, and booking scripts tied to a specific trigger.
- Drafts: editable staff brief, IG post, and delivery blurb drafts that stay behind a review gate until approved.
- Sources: monitored local-event/weather/competitor/trend/delivery source categories, freshness, missing coverage, and config readiness.

## How It Flows

1. The agent browses current public sources and writes only business-relevant movement directly into Busabase as signal/action/draft/source records.
2. The app lets Kelly review signals, approve or block actions, and request changes to drafts — every decision writes straight onto the item's own Busabase record.
3. `scripts/execute_decisions.mjs` dry-runs approved handoffs, then marks approved items done with `--apply` after the agent performs the real handoff outside the script.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Restaurant Intel overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Restaurant Intel signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Restaurant-group desk with demand triggers, meal-period focus, ready actions, and blocked food-safety claims.</td>
    <td><strong>Signals</strong><br>Weather, events, competitor menus, delivery movement, and review themes tied to operations.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly Restaurant Intel actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Restaurant Intel drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Shift briefs, hero-menu picks, booking scripts, and delivery-copy actions ready for approval.</td>
    <td><strong>Drafts</strong><br>Editable staff brief, IG post, and delivery blurb drafts with menu and safety boundaries.</td>
  </tr>
</table>

## Demo Mode

```bash
pnpm --dir skills/kelly-restaurant-intel/content/kelly-restaurant-intel-app dev
```

Open the printed URL and use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The AirApp reads and writes its own Busabase Bases only. It may prepare evidence-backed drafts and review decisions, but it never publishes, sends messages, mutates CRMs, spends money, or stores private customer data without explicit approval. The skill blocks allergen/food-safety claims unless sourced, price/menu promises without confirmation, and any health or nutrition advice beyond approved copy.
