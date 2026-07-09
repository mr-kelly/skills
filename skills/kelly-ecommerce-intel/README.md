# Kelly Ecommerce Intel

Kelly Ecommerce Intel is a local App-in-Skill cockpit for marketplace and DTC sellers. It turns platform policy, competitor pricing, listing changes, search trends, reviews, and ad-library movement into listing, ad, and offer decisions.

## What It Shows

- Overview: today's SKU, platform, or campaign trigger, ready actions, blocked risks, and source coverage.
- Signals: marketplace policy, ranking, fee, logistics, competitor price, ad, review, and search-intent movement.
- Actions: listing edits, ad angles, bundle tests, review replies, campaign briefs, and account-health checks.
- Drafts: editable listing copy, ad hooks, product explanations, and customer-response drafts.
- Sources: marketplace pages, competitor listings, policy notices, ad libraries, review themes, and trend sources.

## How It Flows

1. The agent maps marketplace changes to conversion, margin, ranking, or policy risk.
2. Kelly reviews proposed listing or campaign moves before any seller-center, ad, or pricing action happens.
3. Approved items dry-run locally and can be handed to Buda, Busabase, or a human operator.

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
skills/kelly-ecommerce-intel/app/start.sh
```

Use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The skill blocks platform-policy workarounds, fake review behavior, unsupported product claims, IP infringement, and price changes without approval.
