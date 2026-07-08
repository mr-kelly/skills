# Kelly Tickets

Kelly Tickets is a local App-in-Skill triage-and-dispatch desk for complaints and service requests. Intake arrives scattered across WeChat group exports, phone-call logs, front-desk forms, and email; the agent classifies each item, proposes a dispatch (crew, priority, SLA), and the human approves in a quiet review queue while a board tracks tickets to resolution.

## What It Shows

- Overview: what needs the operator now (proposals to approve, unclassified intake, SLA breaches), KPI cards, intake-by-channel badges, category distribution, and crew load.
- Intake: the raw complaint stream with channel badges, urgency guesses, and triage state; detail views allow reclassifying, converting to a ticket, or ignoring.
- Dispatch: the review queue (`needs_review / changes_requested / approved / done / blocked`) with stable refs like `Dispatch #1`, editable notes to the crew, and approve / request changes / block actions.
- Board: tickets grouped by `open / assigned / in_progress / waiting / resolved` with age and color-coded SLA indicators; ticket detail shows the full auditable history timeline and a resolution note field.
- Help & Settings: sanitized property profile, channels, categories, crews with contact-env readiness, and SLA rules.

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

Run the app and open a safe mock-data scene ("Riverside Gardens", a 3-building residential property):

```bash
skills/kelly-tickets/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=intake&lang=en#/intake
/?demo=dispatch&lang=en#/dispatch
/?demo=board&lang=en#/board
/?demo=detail&lang=en#/board/T-1001
```

Use `lang=zh` for Chinese screenshots — the demo content itself (小区名、投诉内容、班组、派单理由) is localized, e.g. `/?demo=dispatch&lang=zh#/dispatch`. Demo mode never reads or writes `app/.data/` or private config.

## Intake Payload Format

The agent parses each channel export into a payload and runs the single write path:

```bash
node skills/kelly-tickets/scripts/ingest_intake.mjs payload.json
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

Items are deduped by `channel + external_id` (falling back to a content hash), and contacts are masked before they reach the snapshot. Classification and dispatch proposals merge through `scripts/apply_triage.mjs` (SLA targets computed from config rules); approved dispatches become a concrete plan via `scripts/execute_decisions.mjs` (dry-run by default). See `references/tickets-schema.md`.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-tickets/config.json` and describe your property, categories, crews, SLA rules, and channels. Crew contacts are env-var references (`contact_env`) only — put the values in local env files. Never commit real contacts, raw channel exports, or files under `app/.data/`.

## Boundary

The app renders and edits local files only. Actual crew notifications and resident replies are executed by the agent outside the app, only after explicit approval in the dispatch queue, via other skills (messenger/email/WeChat). Resident PII stays local and masked in the UI.
