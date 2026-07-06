# Kelly CRM

Kelly CRM is a local App-in-Skill dashboard and review queue over contacts, companies, deals, and agent-drafted follow-ups.

## What It Shows

- Overview: pipeline summary by stage, follow-ups due, recent activity, and contact/company totals.
- Deals: pipeline table with stage, amount, probability, next step, and owner; per-deal timeline and agent-suggested next action.
- Contacts: relationship list with strength, tags, last touch, and next follow-up; per-contact timeline and open deals.
- Follow-ups: review queue of agent-drafted messages with editable drafts, risk badges, review notes, and Approve / Request changes / Block decisions.
- The app never sends anything. Approved follow-ups are executed by the skill through other channels (for example kelly-email) only after explicit approval.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.png" alt="Kelly CRM overview"></td>
    <td width="50%"><img src="assets/screenshots/deals.png" alt="Kelly CRM deal pipeline"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>CRM command desk with pipeline totals by stage, follow-ups due, recent activity, and network counts.</td>
    <td><strong>Deals</strong><br>Pipeline table across stages with amounts, probability, next steps, and a per-deal interaction timeline.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/contacts.png" alt="Kelly CRM contacts"></td>
    <td width="50%"><img src="assets/screenshots/followups.png" alt="Kelly CRM follow-up queue"></td>
  </tr>
  <tr>
    <td><strong>Contacts</strong><br>Contact list with relationship strength, last touch, and per-contact interaction history and open deals.</td>
    <td><strong>Follow-up queue</strong><br>Agent-drafted follow-up messages with editable drafts, risk badges, and approve/request-changes/block decisions.</td>
  </tr>
</table>

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-crm/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=deals&lang=en#/deals
/?demo=contacts&lang=en#/contacts
/?demo=followups&lang=en#/followups
/?demo=detail&lang=en#/deals/deal-beacon-api
```

Demo mode never reads local CRM files or private config.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-crm/config.json`, then put channel tokens in local env files only. Never commit real contact data, tokens, or files under `app/.data/`.
