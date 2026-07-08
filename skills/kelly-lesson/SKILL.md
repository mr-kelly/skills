---
name: kelly-lesson
license: MIT
description: Lesson-plan generation and compliance-check desk for a dean of studies or training-program lead. Use when the user invokes $kelly-lesson or /kelly-lesson, mentions lesson plan, 备课, 教案, teaching plan compliance, curriculum template, dean of studies, teacher training, wants lesson plans drafted from curriculum materials and the school template, teacher drafts imported and checked against quality standards, a review queue for approving plans, or a library of approved plans exported as documents.
---

# Kelly Lesson

## Overview

Use this skill as the dean-of-studies (教导主任) lesson-plan operator. The school has a required lesson-plan template and quality standards, but teachers' plans vary wildly and checking them all by hand is expensive. Kelly Lesson lets the agent draft plans from curriculum materials plus the school template, run deterministic and agent-assisted compliance checks, and gives the dean a local review queue (approve / request changes / block) plus a library of approved plans exportable as documents. Teachers' own drafts can also be imported and checked.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or ingest the lesson snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; in that mode present numbered plans (`Plan #1`) and take verdicts in conversation.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Lesson overview"></td>
    <td width="50%"><img src="assets/screenshots/needs-review.webp" alt="Kelly Lesson review queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Teaching-quality desk with compliance pass rate, grade-by-subject coverage, per-teacher status, and the review queue.</td>
    <td><strong>Review queue</strong><br>Plan submissions with compliance summaries, agent revision suggestions, and drafted teacher feedback for approval.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/checks.webp" alt="Kelly Lesson compliance checks"></td>
    <td width="50%"><img src="assets/screenshots/plans.webp" alt="Kelly Lesson plan library"></td>
  </tr>
  <tr>
    <td><strong>Compliance checks</strong><br>Per-rule pass/warn/fail results with evidence snippets, filterable by rule and teacher.</td>
    <td><strong>Plan library</strong><br>Lesson plans by subject, grade, and teacher with source badges, compliance scores, and structured plan detail.</td>
  </tr>
</table>

## Boundary

- The skill may read curriculum materials, parse teachers' documents, draft plans, run checks, and write local handoff files. All documents stay local.
- The app reads and writes local files only. It never contacts teachers, sends messages, or mutates remote systems.
- Feedback to teachers is approval-required: the app only stores drafted notes; after the dean approves, the agent sends them via other channels/skills (for example kelly-email) and records the handoff in the execution report.
- Treat plans, teacher names, and school documents as private school data. Never commit `config.local.json`, env files, `app/.data/`, or `exports/`.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before doing real work.

Private config priority:

1. `KELLY_LESSON_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-lesson/config.local.json`
3. `~/.config/kelly-lesson/config.json`
4. `skills/kelly-lesson/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_LESSON_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-lesson/.env.local`
5. `~/.config/kelly-lesson/.env`

Onboarding asks, turn by turn: school profile (name, kind, term, class length in minutes), the school template sections (keys, labels, which are required), compliance rules with severities (start from `config.example.json` and adjust), subjects and grades in scope, and export preferences. This skill needs no secrets by default; if a feedback handoff channel needs a token, reference it by env var name only. When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the desk with:

```bash
skills/kelly-lesson/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring ports `3000` through `4000`, or `KELLY_LESSON_UI_PORT` when set. `/api/state` reports `app: "kelly-lesson"`.

Required app views:

- `#/overview`: teaching-quality command desk — KPI cards (plans total / approved / in revision, compliance pass rate), coverage by grade and subject, per-teacher status summary, review-queue preview, recent activity.
- `#/plans`: the plan library — subject, grade, unit, teacher, source badge (`agent_draft`/`teacher_import`), compliance score, workflow status.
- `#/plans/<plan_id>`: the full structured plan (objectives, key points and difficulties, materials, lesson-flow stages with timing, board plan, homework, reflection, safety notes, curriculum refs) with the compliance panel alongside and an edit-notes field.
- `#/checks`: compliance results — every rule per plan with pass/warn/fail/agent-review badges and evidence snippets, filterable by rule, teacher, and result.
- `#/review`: the review queue — workflow states (`needs_review` / `changes_requested` / `approved` / `done` / `blocked`), compliance summary, agent revision suggestions, editable feedback-to-teacher draft, `Review note`, decision buttons (approve / request changes / block), stable refs (`Plan #1`).
- `#/settings`: sanitized config — school profile, template sections, compliance rules with severities, subjects/grades, export prefs, env readiness booleans, data provider, onboarding state. Never expose secret values.

Demo mode:

- `?demo=overview`, `?demo=plans`, `?demo=checks`, `?demo=review`, and `?demo=detail` open deterministic mock scenes for documentation and screenshots.
- `lang=en` or `lang=zh` forces UI chrome language; with `lang=zh` the demo content itself (school, teachers, plan titles, rules, feedback drafts) is meaningfully localized.
- Deep links such as `/?demo=review&lang=zh#/review` must work.
- Demo API responses never read or write files under `app/.data/`.

UI language: English and Chinese chrome with `Auto` default. Keep real plan content, teacher names, and imported documents in their original language.

## File Contract

Read `references/lesson-schema.md` before editing the app, scripts, or any generated JSON.

- `app/.data/lesson_snapshot.json`: teachers, plans, rules, checks, review items, metrics, activity log.
- `app/.data/decisions.json`: dean verdicts keyed by review id.
- `app/.data/agent_tasks.json`: queued `revise_plan` work for the agent.
- `app/.data/execution_report.json`: latest executor results.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill writes; the review queue rejects `POST /api/decision` with HTTP 423 while it exists.

Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

## Drafting Workflow

1. Collect inputs: curriculum materials (textbook unit, standards excerpts, prior plans) and the configured template sections.
2. Draft the plan as a structured ingest payload — every required template section filled, at least 3 lesson-flow stages whose minutes sum to the class length, measurable objectives, homework, and a safety note when the lesson is a lab.
3. Acquire `app/.data/agent.lock`, run `node scripts/ingest_plan.ts payload.json` (it validates against template sections and merges), release the lock.
4. For a teacher's document, parse it into the same payload with `"source": "teacher_import"` — do not silently fix deficiencies; let the checks surface them.

## Check Workflow

1. Run `node scripts/run_checks.ts`. Deterministic rules (section presence, stage count and timing, duration sums, homework, measurable-verb heuristics, lab safety) are computed from config; per-plan compliance scores and metrics are recomputed idempotently.
2. Rules typed `agent_review` (for example curriculum alignment) are left as `agent_review`. Judge them yourself by comparing objectives with the cited curriculum refs, then deliver verdicts via an ingest payload's `check_results`; re-running the checker preserves agent-judged results.
3. Summarize failures for the dean in the review items (`compliance_summary`, `suggestions`, `feedback_draft`).

## Review And Agent Tasks Loop

1. Send the dean to `#/review`. Verdicts persist through `POST /api/decision` into `decisions.json` (423 under lock).
2. Poll `app/.data/agent_tasks.json` for `revise_plan` tasks created by `request_changes`. Redraft the plan per the comment, re-ingest, re-run checks, and the item returns to `needs_review`.
3. Before executing anything, re-read decisions and run `node scripts/execute_decisions.ts` (dry-run). With `--apply` it records `publish_plan`, `send_feedback`, and `request_revision` operations in `execution_report.json` — no external side effects.

## Export Workflow

1. `node scripts/export_plans.ts --out <dir>` writes approved plans as clean Markdown (default `exports/`, gitignored).
2. When the user wants Word/PDF documents, convert the exported Markdown with your document skills (docx/pdf); this skill never bundles converters.
3. Keep exports out of git and report the concrete file paths.

## Safety Defaults

- Approving, blocking, and sending teacher feedback are human decisions; never fabricate a verdict.
- Do not alter a teacher's imported content beyond structural parsing; flag problems via checks and suggestions instead.
- Keep local data minimal and ids stable so re-ingest and re-check runs are idempotent.
- If the snapshot and config disagree (unknown rules or sections), stop and reconcile before executing.
