# Kelly Tickets

Kelly Tickets is a Busabase App-in-Skill triage-and-dispatch desk for complaints and service requests. Intake arrives scattered across WeChat group exports, phone-call logs, front-desk forms, and email; `scripts/ingest_intake.mjs` writes normalized rows into Busabase, the agent classifies each item and proposes a dispatch (crew, priority, SLA) via `scripts/apply_triage.mjs`, and the human approves in a quiet review queue while a board tracks tickets to resolution. `scripts/execute_decisions.mjs` prints the crew-notification plan for approved dispatches — the AirApp itself never sends a message or mutates a remote system.

## What It Shows

- Overview: what needs the operator now (proposals to approve, unclassified intake, SLA breaches), KPI cards, intake-by-channel badges, category distribution, and crew load.
- Intake: the raw complaint stream with channel badges, urgency guesses, and triage state; detail views allow reclassifying, converting to a ticket, or ignoring.
- Dispatch: the review queue (`needs_review / changes_requested / approved / done / blocked`) with stable refs like `Dispatch #1`, editable notes to the crew, and approve / request changes / block actions.
- Board: tickets grouped by `open / assigned / in_progress / waiting / resolved` with age and color-coded SLA indicators; ticket detail shows the full auditable history timeline and a resolution note field.
- Help & Settings: sanitized property profile, channels, categories, crews with `contact_env` names, and SLA rules, read live off Busabase.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Tickets overview"></td>
    <td width="50%"><img src="assets/screenshots/board.webp" alt="Kelly Tickets board"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Dispatch command desk with SLA risk, weekly intake by channel, category distribution, and crew load.</td>
    <td><strong>Board</strong><br>Tickets tracked across open, assigned, in-progress, waiting, and resolved with SLA indicators and history timelines.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/dispatch.webp" alt="Kelly Tickets dispatch queue"></td>
    <td width="50%"><img src="assets/screenshots/intake.webp" alt="Kelly Tickets intake"></td>
  </tr>
  <tr>
    <td><strong>Dispatch queue</strong><br>Agent-proposed crew assignments with priority, SLA target, reasoning, and an editable note to the crew.</td>
    <td><strong>Intake</strong><br>Raw complaints from WeChat, phone, forms, and email with classification fields and convert-to-ticket controls.</td>
  </tr>
</table>

## Demo Mode

Start the local preview and open a safe mock-data scene ("Riverside Gardens", a 3-building residential property):

```bash
pnpm --dir skills/kelly-tickets/app dev
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=intake&lang=en#/intake
/?demo=dispatch&lang=en#/dispatch
/?demo=board&lang=en#/board
/?demo=detail&lang=en#/board/T-1001
```

Use `lang=zh` for Chinese screenshots — the demo content itself (小区名、投诉内容、班组、派单理由) is meaningfully localized, e.g. `/?demo=dispatch&lang=zh#/dispatch`. Demo mode never reads or writes Busabase and never persists decisions.

## Ingest And Triage

`scripts/ingest_intake.mjs` accepts a payload JSON file (`{ source, items: [] }`) and dedupes against the Intake Base by `channel + external_id` (falling back to a content hash):

```bash
node skills/kelly-tickets/scripts/ingest_intake.mjs payload.json --apply
```

```json
{
  "source": "wechat_export",
  "items": [
    {
      "channel": "wechat",
      "external_id": "W-88121",
      "reporter": "Mrs. Tang",
      "contact": "13800002214",
      "unit": "12B",
      "location": "Building 2",
      "text": "Water dripping from the bathroom ceiling...",
      "received_at": "2026-07-03T07:36:00Z",
      "urgency_guess": "urgent",
      "category_guess": "plumbing",
      "attachments_note": "2 photos in WeChat group"
    }
  ]
}
```

Contacts are masked before they reach Busabase. Classification and dispatch proposals merge through `node skills/kelly-tickets/scripts/apply_triage.mjs payload.json --apply` (SLA targets computed from the Settings row's `sla_rules`); approved dispatches become a concrete plan via `node skills/kelly-tickets/scripts/execute_decisions.mjs --apply` (dry-run by default). All three scripts are dry runs by default. See `references/tickets-schema.md`.

## Private Config

Property profile, categories, crews, SLA rules, and channels live on the Settings and Crews Bases in Busabase — set them up through onboarding on first run. Crew contacts are env-var references (`contact_env`) only; put the values in local env files. Never commit real contacts or raw channel exports.

## Boundary

The AirApp reads and writes Busabase records only. Actual crew notifications and resident replies are executed by the agent outside the app, only after explicit approval in the dispatch queue, via other skills (messenger/email/WeChat). Resident PII stays masked in the UI.
