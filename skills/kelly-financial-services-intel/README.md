# Kelly Financial Services Intel

Kelly Financial Services Intel is a local App-in-Skill cockpit for advisory, family-office, and financial-services teams. It turns market, macro, regulatory, portfolio-theme, and client-question signals into reviewable education and relationship-management actions.

## What It Shows

- Overview: today's client-question trigger, ready advisor actions, blocked advice, and source coverage.
- Signals: regulator, exchange, central-bank, macro, company, portfolio-theme, competitor, and client-question movement.
- Actions: internal briefs, client education memos, advisor talking points, risk reminders, and meeting agendas.
- Drafts: editable client memos, market explainers, meeting notes, and internal briefing copy.
- Sources: regulatory pages, market news, macro data, company announcements, and approved client-question themes.

## How It Flows

1. The agent frames market movement as education or preparation, not personalized advice.
2. Kelly reviews risk language and blocks any suitability, performance, tax, or trading implication.
3. Approved items dry-run locally before export to an advisor, Busabase, or a client-review workflow.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Financial Services Intel overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Financial Services Intel signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Financial-services desk with client-question triggers, advisor prep, blocked advice, and source freshness.</td>
    <td><strong>Signals</strong><br>Regulatory, macro, market, portfolio-theme, and competitor movement interpreted as client concern.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly Financial Services Intel actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Financial Services Intel drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Internal briefs, client education tasks, advisor scripts, and risk reminders queued for approval.</td>
    <td><strong>Drafts</strong><br>Editable explainers and meeting notes that avoid personalized advice and performance promises.</td>
  </tr>
</table>

## Demo Mode

```bash
skills/kelly-financial-services-intel/app/start.sh
```

Use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The skill blocks personalized investment advice, suitability conclusions, performance promises, tax/legal advice, trades, and money movement.
