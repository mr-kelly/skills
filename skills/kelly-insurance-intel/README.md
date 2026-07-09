# Kelly Insurance Intel

Kelly Insurance Intel is a local App-in-Skill cockpit for agencies, brokers, and wealth-advisory teams. It turns regulator updates, insurer movement, health/cost-of-living news, and client lifecycle events into compliant review conversations.

## What It Shows

- Overview: today's protection-gap or renewal trigger, ready client education, blocked advice, and source coverage.
- Signals: regulator, insurer, product, claims, premium, health, travel, and cost-of-living movement.
- Actions: compliant meeting agendas, client education notes, renewal scripts, and needs-review checklists.
- Drafts: editable client memos, advisor talking points, and segmented follow-up drafts.
- Sources: regulator pages, insurer announcements, market news, and approved client-question themes.

## How It Flows

1. The agent maps market movement to a review reason without making suitability conclusions.
2. Kelly reviews client-facing language and blocks anything that crosses into advice or promises.
3. Approved handoffs are dry-run locally before follow-up tasks or documents are exported.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Insurance Intel overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Insurance Intel signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Insurance-advisor desk with protection-gap triggers, renewal actions, blocked advice, and source freshness.</td>
    <td><strong>Signals</strong><br>Regulator, insurer, premium, benefit, health, travel, and lifecycle signals interpreted as review reasons.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly Insurance Intel actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Insurance Intel drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Meeting agendas, renewal checklists, and education tasks with compliance-aware approval status.</td>
    <td><strong>Drafts</strong><br>Editable client education and advisor scripts that avoid suitability or return promises.</td>
  </tr>
</table>

## Demo Mode

```bash
skills/kelly-insurance-intel/app/start.sh
```

Use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The skill blocks personalized financial advice, product suitability conclusions, return promises, unsupported policy interpretation, and outbound claims without approval.
