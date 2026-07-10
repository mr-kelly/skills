---
name: kelly-lead-funnel
license: MIT
description: Local App-in-Skill control panel / kanban board for a BD or sourcing team triaging merchant and business financing leads for a lender or investment fund. Use when the user invokes $kelly-lead-funnel or /kelly-lead-funnel, wants to review the deal sourcing pipeline, funnel, lead board, or asks to move a lead's stage, reject a lead, add a note, score a lead, or see funnel conversion rates. Deterministic rule-based lead scoring only — never an LLM call — and never sends outreach, signs term sheets, or moves money.
---

# Deal Sourcing Funnel

## Overview

Use this skill as a generic BD/sourcing pipeline operator for any lender or
investment fund sourcing SME financing candidates (merchant cash advance,
revenue-based financing, or similar). It ingests a mock/local pipeline of
merchant leads, computes a deterministic lead-quality score, and gives the
sourcing team a kanban board plus a per-lead detail panel to move stages,
reject with a reason, and leave notes — all written to local handoff files.

This is a control-panel/kanban App-in-Skill, not a review queue: there is no
AI-authored draft to approve. The score and suggested next action are
computed by a documented rule-based function (`lib/scoring.ts`); the human
makes the stage/reject/note decisions.

Default interaction mode: App UI. Unless the user explicitly asks for
chat-only handling, check onboarding/config, seed the pipeline if empty, and
start/reuse the local app with `app/start.sh`, giving the actual local URL.
Use chat-only mode only when the user says "纯聊天", "chat only", or similar.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.png" alt="Deal Sourcing Funnel overview"></td>
    <td width="50%"><img src="assets/screenshots/kanban.png" alt="Deal Sourcing Funnel kanban board"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Funnel summary header with per-stage counts, conversion rates, and rejection rate.</td>
    <td><strong>Kanban board</strong><br>Leads across New → Data-Verified → Scored → Term-Sheet-Ready → Rejected, with a score chip per card.</td>
  </tr>
  <tr>
    <td colspan="2"><img src="assets/screenshots/lead-detail.png" alt="Deal Sourcing Funnel lead detail"></td>
  </tr>
  <tr>
    <td colspan="2"><strong>Lead detail</strong><br>Score breakdown by factor, suggested next action, notes, stage-move actions, and reject-with-reason.</td>
  </tr>
</table>

## Boundary

- Deterministic, rule-based lead-quality score only (`lib/scoring.ts`). NEVER
  call an LLM to score, rank, or auto-reject a lead.
- The app reads and writes local files only (`app/.data/`). It never sends
  outreach, emails, signs term sheets, disburses funds, or touches any
  external system.
- Generic, brand-neutral tool: never hardcode or reference a specific real
  company, lender, or fund name in code, templates, or docs — only the
  user's own private `config.local.json` may name their fund.
- Treat lead financial data as sensitive. Do not commit `config.local.json`,
  env files, `app/.data/`, or exports.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json`. If absent/incomplete, ask
for non-secret setup only: fund display name, product description, target
check size, and scoring-criteria bands (ideal store-count band, ideal
monthly-revenue band, category risk tiers). Write these to
`config.local.json` (never paste them into chat as secrets — there are no
secrets in this skill's default config). When the user confirms, write
`app/.data/onboarding.json`:

```json
{ "completed": true, "completed_at": "ISO timestamp", "config_version": "1" }
```

If `app/.data/leads.json` is empty or missing, run `scripts/seed_leads.ts` to
write a deterministic 21-lead mock pipeline before opening the app.

## Local App

Start the board with:

```bash
skills/kelly-lead-funnel/app/start.sh
```

Local HTTP on `127.0.0.1`, preferring port `3000`-`4000`, or
`KELLY_LEAD_FUNNEL_UI_PORT` when set. First run installs `hono` and
`@hono/node-server`; the frontend is zero-build vanilla.

## Demo Mode

- `?demo=1` or `?demo=board` opens a deterministic, fully offline mock
  pipeline (21 leads across all 5 stages) for documentation and screenshots.
- `?demo=lead` opens the first lead's detail pane; `?demo=settings` opens
  Help & Settings.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses never read or write `app/.data/`.

UI language: English and Chinese chrome with `Auto` default.

## Data Provider

- Provider selector env: `KELLY_LEAD_FUNNEL_DATA_PROVIDER=local` (default).
  Reserve `postgres`, `aitable`, `notion`, `busabase` as future provider
  names — app/scripts only ever depend on `lib/data-provider/provider-interface.ts`.
- `lib/scoring.ts`: pure, deterministic 0-100 score from `store_count`,
  `est_monthly_revenue`, `category`, and `data_verifiable` — 4 weighted
  factors (30/30/25/15) with a human-readable rationale per factor. Read this
  file before changing scoring behavior.
- `lib/funnel-summary.ts`: pure per-stage counts and conversion rates.

Primary local files:

- `app/.data/leads.json`: the pipeline (see `references/lead-schema.md`).
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/handoff_log.json`: append-only audit log of every stage move,
  rejection, and note (the human-decision handoff record).
- `app/.data/agent.lock`: temporary lock while the app is writing.
- `config.local.json`: private fund profile / scoring criteria, ignored by git.

Use `scripts/validate_ui_schema.ts app/.data/leads.json` before relying on a
seeded pipeline in the UI. `scripts/seed_leads.ts` writes the 21-lead mock
pipeline via `lib/mock-leads.ts` (shared with the demo API so both stay
consistent).

## Views

- `#/board`: funnel summary header + kanban across all 5 stages.
- `#/board/<stage>`: single-stage filtered list (used by the human-attention
  shortcuts for New / Scored / Rejected).
- `#/leads/<id>`: score breakdown, suggested next action, notes, stage-move
  buttons, reject-with-reason.
- `#/settings`: sanitized fund profile and scoring-criteria summary.

## Safety

- Read/write local files only; no outbound network calls of any kind.
- Score and suggested_action are always explainable via `score_breakdown`;
  never show a bare number without its factor rationale.
- Rejections always require a `reason`; it is stored on the lead and appended
  to the handoff log.
- Keep local exports minimal and use stable lead ids so repeated seeds/syncs
  stay idempotent.
