# Kelly Real Estate Intel

Kelly Real Estate Intel is a Busabase App-in-Skill cockpit for turning listing, transaction, mortgage, district, and competitor movement into reviewable property-agency decisions. It is built for property agency owners, team leads, and individual agents.

## What It Shows

- Overview: today's property-market trigger, ready outreach, blocked pricing claims, and source freshness.
- Signals: transaction, listing, mortgage, district, and competitor signals with evidence and buyer/seller interpretation.
- Actions: owner updates, buyer follow-ups, listing angles, and open-house talking points ready for review.
- Drafts: editable WhatsApp follow-up, agent朋友圈, and listing pitch drafts that stay behind a review gate until approved.
- Sources: monitored portals, media, competitor pages, district/event sources, and coverage gaps.

## How It Flows

1. The agent browses current public sources and writes only business-relevant movement directly into Busabase as signal/action/draft/source records.
2. The app lets Kelly review signals, approve or block actions, and request changes to drafts — every decision writes straight onto the item's own Busabase record.
3. `scripts/execute_decisions.mjs` dry-runs approved handoffs, then marks approved items done with `--apply` after the agent performs the real handoff outside the script.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Real Estate Intel overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Real Estate Intel signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Property-agency desk showing today's market trigger, ready outreach, blocked claims, and coverage gaps.</td>
    <td><strong>Signals</strong><br>Listings, transaction, mortgage, district, and competitor-ad movement tied to buyer or owner intent.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly Real Estate Intel actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Real Estate Intel drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Call scripts, owner notes, listing angles, and open-house talking points queued for approval.</td>
    <td><strong>Drafts</strong><br>Editable WhatsApp follow-up, agent朋友圈, and listing pitch drafts with evidence and approval controls.</td>
  </tr>
</table>

## Demo Mode

```bash
pnpm --dir skills/kelly-real-estate-intel/content/kelly-real-estate-intel-app dev
```

Open the printed URL and use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The AirApp reads and writes its own Busabase Bases only. It may prepare evidence-backed drafts and review decisions, but it never publishes, sends messages, mutates CRMs, spends money, or stores private customer data without explicit approval. The skill blocks unverified price claims, guaranteed appreciation, legal advice, and anything that implies agency without approval.
