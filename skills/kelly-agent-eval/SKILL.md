---
name: kelly-agent-eval
description: Local App-in-Skill review board that runs a fixed suite of mock test cases against a baseline vs candidate agent version and surfaces rubric-scored regressions before a release. Use when the user invokes $kelly-agent-eval or /kelly-agent-eval, wants to review agent-version regressions, compare baseline vs candidate quality, triage a release, or record a release approve/block decision. Deterministic mock rubric scores only — not a real LLM-judge call, and it never deploys anything.
---

# Agent Eval & Regression Board

## Overview

Use this skill as a generic quality gate for teams shipping multiple LLM-agent
workflows who need to catch regressions before a release. It runs a fixed suite
of ~18 mock test cases — support triage, code review, reasoning, planning,
communication tone, extraction, and safety — against a **baseline** agent
version and a **candidate** agent version, scores each transcript on a
four-part rubric (helpfulness, correctness, safety, tone), and surfaces every
case where the candidate scored meaningfully lower than the baseline as a
**regression**.

The rubric scores are deterministic mock values presented as if produced by an
eval rubric — this skill does not call a real LLM judge, and it does not
deploy, publish, or modify anything. It only reads/writes local handoff files.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only
handling, check onboarding/config, generate or load the local eval run, start
or reuse the local app with `app/start.sh`, and give the actual local URL. Use
chat-only mode only when the user says "chat only", "no UI", or similar.

This app combines a **dashboard** (pass-rate comparison, release decision) with
a **review queue** (regressions needing a human verdict).

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Agent Eval Board overview"></td>
    <td width="50%"><img src="assets/screenshots/regressions.webp" alt="Agent Eval Board regressions list"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Baseline vs candidate pass-rate comparison, case-count metrics, and the release approve/block panel.</td>
    <td><strong>Regressions</strong><br>Cases where the candidate scored meaningfully lower than baseline, filterable by review status.</td>
  </tr>
  <tr>
    <td colspan="2"><img src="assets/screenshots/case-detail.webp" alt="Agent Eval Board case detail"></td>
  </tr>
  <tr>
    <td colspan="2"><strong>Case detail</strong><br>Rubric bar comparison (helpfulness/correctness/safety/tone) plus a side-by-side transcript diff and the mark-blocking / mark-acceptable review note.</td>
  </tr>
</table>

## Boundary

- Read/generate the local mock eval run and local handoff files only.
- NEVER call a real model to score transcripts, NEVER deploy or publish a
  release, and NEVER modify any external system. There is no deploy path in
  this skill by design.
- The app reads and writes local files only.
- Treat reviewer notes and release decisions as local review history. Do not
  commit `config.local.json`, env files, or `app/.data/`.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json`. If onboarding is
absent/incomplete, ask for the small, non-secret setup: team name, baseline
version label, candidate version label, and the minimum candidate pass rate
policy. There are no credentials for this skill — it never calls an external
system — so onboarding is quick.

Private config priority:

1. `KELLY_AGENT_EVAL_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-agent-eval/config.local.json`
3. `~/.config/kelly-agent-eval/config.json`
4. `skills/kelly-agent-eval/config.example.json` as template only

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the board with:

```bash
skills/kelly-agent-eval/app/start.sh
```

First run installs `hono` and `@hono/node-server`, then generates the mock
eval run into `app/.data/eval_run.json` if none exists yet. The frontend is
zero-build vanilla. The app uses local HTTP on `127.0.0.1`, preferring port
`3000` through `4000`, or `KELLY_AGENT_EVAL_UI_PORT` when set.

## Demo Mode

- `?demo=1` opens a deterministic, fully offline mock run (18 cases across
  seven categories) for documentation and screenshots.
- `lang=en` or `lang=zh` forces UI chrome (and case titles/categories in the
  demo payload) to that language.
- Demo API responses never read or write `app/.data/`.

UI language: supports English and Chinese chrome with `Auto` default.

## Workflow

1. `node scripts/generate_eval_run.ts` (or the app's first run) writes the
   fixed mock suite to `app/.data/eval_run.json` and clears prior decisions.
2. Open the app. **Overview** shows baseline vs candidate pass rate and case
   counts; **Regressions** lists every case that dropped; **All Cases** lists
   every case with a category filter.
3. For each regression, open the case detail, compare the rubric bars and the
   side-by-side transcript diff, and record `Mark blocking` or
   `Mark acceptable` with a note — written to `app/.data/decisions.json`.
4. Once every regression has a decision, record the overall
   `Approve release` / `Block release` verdict with a note — written to
   `app/.data/release_decision.json`.
5. `node scripts/export_release_report.ts` merges the run, decisions, and
   release verdict into `app/.data/release_report.json`. It refuses to run if
   a regression still has no decision, or no release decision exists yet.

Read `references/eval-schema.md` before editing the app, scripts, or
`lib/eval-data.ts`.

## Data Provider

- Provider selector env: `KELLY_AGENT_EVAL_DATA_PROVIDER=local` (default).
  The contract lives in `lib/data-provider/provider-interface.ts`; the default
  implementation is `lib/data-provider/local-file-provider.ts`.
- Primary local files: `app/.data/eval_run.json`, `app/.data/decisions.json`,
  `app/.data/release_decision.json`, `app/.data/release_report.json`,
  `app/.data/onboarding.json`, `app/.data/agent.lock`.

Use `scripts/validate_ui_schema.ts [path]` before relying on a run file.

## Safety

- Deterministic mock scores only — never present them as a real LLM-judge
  verdict to the user; call them out as rubric-based mock scoring.
- Refuse to export a release report while a regression has no decision.
- Do not invent scores outside the fixed suite; if the user wants a different
  case, add it to `lib/eval-data.ts` and regenerate the run.
