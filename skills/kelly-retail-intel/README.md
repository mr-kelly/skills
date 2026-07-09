# Kelly Retail Intel

Kelly Retail Intel is a local App-in-Skill cockpit for stores and consumer brands. It turns weather, local events, competitor promotions, product trends, reviews, and inventory signals into the day's merchandising and sales-floor actions.

## What It Shows

- Overview: today's footfall or hero-SKU trigger, ready store actions, blocked promises, and source freshness.
- Signals: weather, event, mall/neighborhood, competitor promo, product trend, review, and supplier movement.
- Actions: store briefing notes, signage copy, hero-product picks, replenishment checks, and staff scripts.
- Drafts: editable signage, social captions, staff briefs, and customer-message copy.
- Sources: event calendars, weather, competitor pages, review themes, and product trend sources.

## How It Flows

1. The agent turns local demand into a concrete retail operating choice for today.
2. Kelly reviews the source trail, approves store actions, and blocks inventory or discount commitments that are not confirmed.
3. Approved decisions dry-run into local handoffs for store teams or Buda/Busabase review.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Retail Intel overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Retail Intel signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Retail desk with local demand triggers, hero SKUs, ready store actions, and blocked promises.</td>
    <td><strong>Signals</strong><br>Weather, events, competitor promotions, product trends, and review themes tied to merchandising decisions.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly Retail Intel actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Retail Intel drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Store briefs, signage, replenishment checks, and staff scripts queued for approval.</td>
    <td><strong>Drafts</strong><br>Editable campaign, signage, and customer-message copy with local source context.</td>
  </tr>
</table>

## Demo Mode

```bash
skills/kelly-retail-intel/app/start.sh
```

Use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The skill blocks unconfirmed inventory promises, discount commitments, supplier claims, and private customer segmentation unless configured and approved.
