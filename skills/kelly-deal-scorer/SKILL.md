---
name: kelly-deal-scorer
description: Review-queue App-in-Skill that scores candidate SME financing deals (revenue-based/RBF-style credit) with a deterministic, fully auditable rule-based rubric — never an LLM or API call. Use when the user invokes $kelly-deal-scorer or /kelly-deal-scorer, wants to review a deal-underwriting queue, score financing candidates, compute a composite score breakdown, see a suggested revenue-share rate range, or record approve/send-back/reject decisions for a private-credit or RBF-style lending pipeline.
---

# Deal Scoring Desk

## Overview

Use this skill as a local review-queue operator for a generic SME financing
deal desk (private-credit / revenue-based-financing style). It ingests a mock
queue of candidate businesses (name, category, city, monthly revenue history,
requested principal, red flags) and computes a deterministic composite score
(0-100) per candidate with a full, hand-recomputable breakdown: each
sub-factor's raw score, weight, and contribution, plus a suggested
revenue-share rate range. This is a generic, brand-free tool — it does not
reference any specific real company, lender, or fund.

**The scoring rubric is plain arithmetic in `lib/scoring.ts`, not an LLM or API
call.** Every number the app shows can be recomputed with a calculator from the
candidate's raw fields and the rubric weights in `config.json`.

Default interaction mode: App UI. Unless the user explicitly asks for
chat-only handling, check onboarding/config, seed or reuse the local batch,
start/reuse the local app with `app/start.sh`, and give the actual local URL.
Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI",
or similar.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Deal Scoring Desk overview"></td>
    <td width="50%"><img src="assets/screenshots/candidate-detail.webp" alt="Deal Scoring Desk candidate detail"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Queue-level summary header — score distribution, counts needing review vs. high-confidence — plus the candidate list.</td>
    <td><strong>Candidate detail</strong><br>Revenue history, red flags, requested principal, and the decision row (approve for term sheet / send back for more data / reject).</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/score-breakdown.webp" alt="Deal Scoring Desk score breakdown"></td>
    <td width="50%"></td>
  </tr>
  <tr>
    <td><strong>Score breakdown</strong><br>Per-factor raw score, weight, and contribution with an arithmetic trace for every sub-factor, plus the suggested revenue-share rate range.</td>
    <td></td>
  </tr>
</table>

## Boundary

- Review-only. The skill prepares/scores a candidate queue and writes local
  handoff files; it never wires money, signs a term sheet, or contacts a
  business.
- NEVER treat the composite score as legal or financial advice, and never
  auto-approve: a human decision (`approve_term_sheet` / `send_back_for_data`
  / `reject`) is always required before `scripts/execute_decisions.ts` marks
  anything `done`.
- The app reads and writes local files only. Treat candidate financials as
  sensitive; do not commit `config.local.json`, env files, or `app/.data/`.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json`. If absent/incomplete, ask the
user to confirm the rubric weights and category risk tiers in
`config.local.json` (copy from `config.example.json`) match their fund's
underwriting policy, then write the completion marker.

Private config priority:

1. `KELLY_DEAL_SCORER_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-deal-scorer/config.local.json`
3. `~/.config/kelly-deal-scorer/config.json`
4. `skills/kelly-deal-scorer/config.example.json` as template only

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{ "completed": true, "completed_at": "ISO timestamp", "config_version": "1" }
```

## Local App

```bash
skills/kelly-deal-scorer/app/start.sh
```

First run installs `hono` + `@hono/node-server`, seeds a mock candidate queue
(`scripts/generate_batch.ts`) if none exists, and starts the server on
`127.0.0.1`, preferring port `3000` through `4000`, or
`KELLY_DEAL_SCORER_UI_PORT` when set. The frontend is zero-build vanilla.

## Demo Mode

- `?demo=1` opens a deterministic, fully offline mock queue (8 candidates
  across F&B/Retail/Fitness/Education) for documentation and screenshots.
- `?demo=overview`, `?demo=detail` select named mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses never read or write real candidate/queue files.

UI language: English and Chinese chrome with `Auto` default.

## Data Provider

- Provider selector env: `KELLY_DEAL_SCORER_DATA_PROVIDER=local` (default).
  App code reaches storage only through `lib/data-provider/` — see
  `lib/data-provider/provider-interface.ts` for the contract every future
  provider (postgres/aitable/notion/busabase) must implement.
- Read `references/scoring-schema.md` before editing the batch shape, the
  rubric, the app, or the scripts.

Primary local files:

- `app/.data/current_batch.json`: latest scored candidate queue.
- `app/.data/decisions.json`: human decisions keyed by candidate id.
- `app/.data/execution_report.json`: latest execution run (term-sheet prep / close).
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while writing.

Use `scripts/generate_batch.ts` to (re)seed the mock queue,
`scripts/validate_ui_schema.ts app/.data/current_batch.json` before trusting a
batch in the UI, and `scripts/execute_decisions.ts` to apply approved/blocked
decisions.

## Views

- `#/overview`: queue-level summary — score distribution (high-confidence /
  needs review / low-confidence), workflow counts, and the candidate list.
- `#/candidates/<id>`: candidate detail — revenue history, red flags,
  requested principal, score breakdown, suggested revenue-share range, and the
  decision row.
- `#/settings`: sanitized rubric summary (weights, thresholds), active data
  provider, and onboarding state.

## Safety

- Deterministic scoring only: never call an LLM or external API to produce a
  candidate's score — `lib/scoring.ts` is plain arithmetic so every number is
  auditable.
- Never auto-execute a decision the human has not made.
- Keep local exports minimal and use stable candidate ids so repeated runs are
  idempotent.
