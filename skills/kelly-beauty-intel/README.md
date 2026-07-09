# Kelly Beauty Intel

Kelly Beauty Intel is a local App-in-Skill cockpit for beauty, wellness, and medical-aesthetic teams. It turns competitor offers, treatment trends, safety notices, reviews, and seasonal demand into safe consultation and campaign actions.

## What It Shows

- Overview: today's consultation or campaign trigger, blocked medical claims, and source coverage.
- Signals: treatment trend, competitor offer, review, safety, regulator, influencer, and seasonal demand movement.
- Actions: consultation scripts, staff talking points, review-recovery notes, and campaign angles.
- Drafts: editable client education, promotion, social, and consultation copy.
- Sources: competitor pages, review sites, safety notices, trend posts, and demand calendars.

## How It Flows

1. The agent separates demand signals from clinical or safety claims that need professional review.
2. Kelly approves only non-diagnostic education, offer positioning, and staff scripts with clear evidence.
3. Approved decisions dry-run locally before any campaign or client-facing message is handed off.

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

## Demo Mode

```bash
skills/kelly-beauty-intel/app/start.sh
```

Use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The skill blocks diagnosis, treatment guarantees, prescription guidance, before/after certainty, and unsupported safety claims.
