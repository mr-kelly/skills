# Kelly CRM

Kelly CRM is a Busabase-backed App-in-Skill dashboard and review queue over
contacts, companies, deals, and agent-drafted follow-ups.

## What It Shows

- Overview: pipeline summary by stage, follow-ups due, recent activity, and contact/company totals.
- Deals: pipeline table with stage, amount, probability, next step, and owner; per-deal timeline and agent-suggested next action.
- Contacts: relationship list with strength, tags, last touch, and next follow-up; per-contact timeline and open deals.
- Follow-ups: review queue of agent-drafted messages with editable drafts, risk badges, review notes, and Approve / Request changes / Block decisions.
- The app never sends anything. Approved follow-ups are executed by the skill through other channels (for example kelly-email) only after explicit approval.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly CRM overview"></td>
    <td width="50%"><img src="assets/screenshots/deals.webp" alt="Kelly CRM deal pipeline"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>CRM command desk with pipeline totals by stage, follow-ups due, recent activity, and network counts.</td>
    <td><strong>Deals</strong><br>Pipeline table across stages with amounts, probability, next steps, and a per-deal interaction timeline.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/contacts.webp" alt="Kelly CRM contacts"></td>
    <td width="50%"><img src="assets/screenshots/followups.webp" alt="Kelly CRM follow-up queue"></td>
  </tr>
  <tr>
    <td><strong>Contacts</strong><br>Contact list with relationship strength, last touch, and per-contact interaction history and open deals.</td>
    <td><strong>Follow-up queue</strong><br>Agent-drafted follow-up messages with editable drafts, risk badges, and approve/request-changes/block decisions.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir content/kelly-crm-app install
pnpm --dir content/kelly-crm-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see mock data without a Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=deals&lang=en#/deals
/?demo=contacts&lang=en#/contacts
/?demo=followups&lang=en#/followups
/?demo=detail&lang=en#/deals/deal-beacon-api
```

Demo mode never reads or writes Busabase.

## Data

All persistent data — companies, contacts, deals, interactions, follow-ups,
and settings — lives in Busabase Bases under one application Folder. See
`SKILL.md` and `references/crm-schema.md` for the resource map and record
shapes. `scripts/execute_decisions.mjs` is the trusted process that hands off
an approved follow-up's status; it connects with `BUSABASE_BASE_URL` /
`BUSABASE_API_KEY` / `BUSABASE_SPACE_ID` and performs no external send.
