# Kelly Real Estate Intel

Kelly Real Estate Intel is a local App-in-Skill cockpit for property agencies, broker teams, and developers. It turns listings, transaction news, mortgage movement, district updates, and competitor ads into daily client-follow-up actions.

## What It Shows

- Overview: today's property-market trigger, ready outreach, blocked pricing claims, and source freshness.
- Signals: transaction, listing, mortgage, district, and competitor signals with evidence and buyer/seller interpretation.
- Actions: owner updates, buyer follow-ups, listing angles, and open-house talking points ready for review.
- Drafts: editable scripts and channel copy for WhatsApp, email, listing pages, or client memos.
- Sources: monitored portals, media, competitor pages, district/event sources, and coverage gaps.

## How It Flows

1. The agent collects public market movement and chooses one concrete buyer, seller, landlord, or project-positioning scene.
2. Kelly reviews the signal cards and approves only sourced outreach or listing actions.
3. Approved items dry-run into local handoff records before any external channel is touched.

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
    <td><strong>Drafts</strong><br>Editable client follow-ups and property-market memos with evidence and approval controls.</td>
  </tr>
</table>

## Demo Mode

```bash
skills/kelly-real-estate-intel/app/start.sh
```

Use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The skill blocks unverified price claims, guaranteed appreciation, legal advice, and outbound agency commitments until a human approves the sourced draft.
