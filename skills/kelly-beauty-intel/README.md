# Kelly Beauty Intel

Kelly Beauty Intel is a Busabase-backed App-in-Skill cockpit for beauty, wellness, and medical-aesthetic teams. It turns competitor offers, treatment trends, safety notices, reviews, and seasonal demand into safe consultation and campaign actions.

## What It Shows

- Overview: today's consultation or campaign trigger, blocked medical claims, and source coverage.
- Signals: treatment trend, competitor offer, review, safety, regulator, influencer, and seasonal demand movement.
- Actions: consultation scripts, staff talking points, review-recovery notes, and campaign angles.
- Drafts: editable client education, promotion, social, and consultation copy.
- Sources: competitor pages, review sites, safety notices, trend posts, and demand calendars.

## How It Flows

1. The agent separates demand signals from clinical or safety claims that need professional review.
2. Kelly approves only non-diagnostic education, offer positioning, and staff scripts with clear evidence — the verdict writes directly onto the signal/action/draft record in Busabase.
3. Approved decisions are never sent automatically; handoff to any campaign or client-facing channel still requires a separate, explicit step outside this app.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Beauty Intel overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Beauty Intel signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Beauty and medical-aesthetic desk with demand triggers, reviewable actions, and blocked medical claims.</td>
    <td><strong>Signals</strong><br>Competitor offers, treatment trends, reviews, safety notices, and seasonal demand with risk badges.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly Beauty Intel actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Beauty Intel drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Consultation scripts, staff notes, campaign angles, and review-recovery actions queued for approval.</td>
    <td><strong>Drafts</strong><br>Editable client education and promotion copy that stays within safe-claim boundaries.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir app install
pnpm --dir app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see mock data without a Busabase connection:

```text
/?demo=1&lang=en#/overview
/?demo=1&lang=en#/signals
/?demo=1&lang=en#/actions
/?demo=1&lang=en#/drafts
```

## Data

All state — signals, actions, drafts, sources, and the operator brand
profile — lives in five Busabase Bases under one application Folder. See
`SKILL.md` and `references/ui-schema.md` for the resource map.

## Boundary

The skill blocks diagnosis, treatment guarantees, prescription guidance, before/after certainty, and unsupported safety claims. It never posts content, sends messages, or performs any other external side effect.
