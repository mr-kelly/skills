# Deal Sourcing Funnel

Deal Sourcing Funnel is a Busabase-backed App-in-Skill control panel for a
BD/sourcing team at any lender or investment fund that sources SME financing
candidates (merchant cash advance, revenue-based financing, or similar). It
computes a deterministic, rule-based lead-quality score, and lets the team
triage the pipeline as a kanban board — moving stages, rejecting with a
reason, and leaving notes, all written directly to Busabase. It never sends
outreach, signs term sheets, or moves money.

## What It Shows

- **Kanban board** across five funnel stages: New → Data-Verified → Scored →
  Term-Sheet-Ready, with Rejected reachable from any prior stage.
- **Funnel summary header**: per-stage lead counts, stage-by-stage
  conversion rates from New, overall New → Term-Sheet-Ready conversion, and
  the rejection rate.
- **Deterministic lead-quality score** (0-100,
  `app/app/js/lead-funnel-model.js`, not an LLM call) from four weighted,
  explainable factors: chain-size fit (30), revenue-scale fit (30), category
  risk (25), and data verifiability (15).
- **Lead detail panel**: full score breakdown with a rationale per factor,
  suggested next action, notes, stage-move buttons, and reject-with-reason.
- **Direct kanban actions**, all written straight to Busabase: move a lead's
  stage, reject with a required reason, add a note — no separate approval
  step.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Deal Sourcing Funnel overview"></td>
    <td width="50%"><img src="assets/screenshots/kanban.webp" alt="Deal Sourcing Funnel kanban board"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Funnel summary header with per-stage counts, conversion rates, and rejection rate.</td>
    <td><strong>Kanban board</strong><br>Leads across New → Data-Verified → Scored → Term-Sheet-Ready → Rejected, with a score chip per card.</td>
  </tr>
  <tr>
    <td colspan="2"><img src="assets/screenshots/lead-detail.webp" alt="Deal Sourcing Funnel lead detail"></td>
  </tr>
  <tr>
    <td colspan="2"><strong>Lead detail</strong><br>Score breakdown by factor, suggested next action, notes, stage-move actions, and reject-with-reason.</td>
  </tr>
</table>

Chinese (zh-CN) screenshots are also bundled: `overview-zh-CN.png`,
`kanban-zh-CN.png`, `lead-detail-zh-CN.png`.

## Demo Mode

Run the app and open a safe, fully offline mock scene:

```bash
pnpm --dir skills/kelly-lead-funnel/app dev
```

Use the printed local URL, then add one of these demo paths:

```text
/?demo=1&lang=en#/board
/?demo=board&lang=zh#/board
/?demo=lead&lang=en#/leads/lead-001
/?demo=settings&lang=en#/settings
```

Demo mode is fully offline (21 mock leads across all 5 stages, ported
verbatim from the retired `lib/mock-leads.ts`) and never reads or writes
Busabase.

## Busabase Data

The AirApp is Busabase-backed: leads, notes, stage history, and fund
settings all live in Busabase Bases declared in `app/app/js/config.js` (see
`references/lead-schema.md`). Resources provision lazily on first run. There
is no local file storage and no separate provider choice.
