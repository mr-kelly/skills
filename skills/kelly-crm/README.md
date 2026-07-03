# Kelly CRM

Kelly CRM is a local App-in-Skill dashboard and review queue over contacts, companies, deals, and agent-drafted follow-ups.

## What It Shows

- Overview: pipeline summary by stage, follow-ups due, recent activity, and contact/company totals.
- Deals: pipeline table with stage, amount, probability, next step, and owner; per-deal timeline and agent-suggested next action.
- Contacts: relationship list with strength, tags, last touch, and next follow-up; per-contact timeline and open deals.
- Follow-ups: review queue of agent-drafted messages with editable drafts, risk badges, review notes, and Approve / Request changes / Block decisions.
- The app never sends anything. Approved follow-ups are executed by the skill through other channels (for example kelly-email) only after explicit approval.

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
