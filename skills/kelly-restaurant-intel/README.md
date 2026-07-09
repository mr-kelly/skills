# Kelly Restaurant Intel

Kelly Restaurant Intel is a local App-in-Skill cockpit for restaurants, cafes, and F&B groups. It turns weather, events, competitor menus, review themes, booking demand, and delivery-platform activity into daily menu, staffing, and promotion actions.

## What It Shows

- Overview: today's demand trigger, meal-period focus, ready actions, blocked food-safety claims, and source freshness.
- Signals: event, weather, transport, tourism, competitor menu, delivery, booking, and review movement.
- Actions: shift briefs, hero-menu picks, delivery copy, review replies, booking scripts, and group-promo tasks.
- Drafts: editable social posts, delivery blurbs, staff notes, and guest-recovery replies.
- Sources: local event calendars, weather, delivery platforms, competitor menus, booking signals, and review themes.

## How It Flows

1. The agent converts local conditions into a concrete service-period or promotion decision.
2. Kelly reviews menu, staffing, and guest-facing actions before anything goes to staff or channels.
3. Approved items dry-run locally for Buda/Busabase or restaurant-ops handoff.

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
    <td><strong>Drafts</strong><br>Editable guest messages, review replies, and social copy with menu and safety boundaries.</td>
  </tr>
</table>

## Demo Mode

```bash
skills/kelly-restaurant-intel/app/start.sh
```

Use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The skill blocks allergen or food-safety claims unless sourced, unconfirmed price/menu promises, and health or nutrition advice beyond approved copy.
