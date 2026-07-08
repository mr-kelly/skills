# Kelly Lesson

Kelly Lesson is a local App-in-Skill desk for a dean of studies (教导主任) or training-program lead: the agent drafts lesson plans from curriculum materials and the school template, runs compliance checks against school quality standards, and the dean reviews, approves, and exports the plans — all over local files.

## What It Shows

- Overview: KPI cards (plans total / approved / in revision, compliance pass rate), coverage by grade and subject, per-teacher status, recent activity.
- Plans: the plan library with source badges (agent draft / teacher import), compliance scores, and workflow status; detail pages render the full structured plan (objectives, lesson-flow stages with timing, board plan, homework, and more) next to its compliance panel.
- Checks: every compliance rule per plan with pass/warn/fail/agent-review badges and evidence snippets, filterable by rule, teacher, and result.
- Review: the queue with approve / request changes / block decisions, agent suggestions, and an editable feedback-to-teacher draft per plan (`Plan #1` refs).
- Settings: sanitized school profile, template sections, compliance rules, subjects/grades, and export preferences.

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

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-lesson/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=plans&lang=en#/plans
/?demo=checks&lang=en#/checks
/?demo=review&lang=en#/review
/?demo=detail&lang=en#/plans/plan-math-linear-eq
```

Use `lang=zh` for Chinese screenshots — the demo school, teachers, plan content, rules, and feedback drafts are localized (北湖中学). Demo mode never reads or writes files under `app/.data/`.

## Plan Payload Format

`scripts/ingest_plan.ts` accepts a single plan object or `{ "plans": [...], "check_results": [...] }`:

```json
{
  "title": "Buoyancy — Lesson 1",
  "subject": "Physics",
  "grade": "Grade 8",
  "unit": "Chapter 10",
  "teacher": "Grace Hu",
  "source": "agent_draft",
  "sections": {
    "objectives": ["Measure the buoyant force on a block with a spring scale."],
    "key_points": ["Weight-difference method"],
    "difficulties": ["Buoyant force on sinking objects"],
    "materials": ["Spring scales, beakers"],
    "stages": [{ "name": "Lab activity", "minutes": 18, "activities": "Groups measure at three depths." }],
    "board_plan": "Force diagram and data table.",
    "homework": "Worksheet 10.1 questions 1–5.",
    "reflection": "",
    "curriculum_refs": ["Standards 2.2.9"],
    "safety_notes": "Keep water away from sockets."
  }
}
```

After ingesting, run `node scripts/run_checks.ts` to refresh compliance results, and `node scripts/export_plans.ts --out <dir>` to export approved plans as Markdown. See `references/lesson-schema.md` for the full contract.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-lesson/config.json` and adjust the school profile, template sections, and compliance rules. No secrets are required by default; if a feedback channel needs one, reference it by env var name in local env files only.

## Boundary

The app renders local files only — it never contacts teachers or remote systems. Feedback to teachers is approval-required and sent by the agent via other channels after the dean approves. Never commit school data: `config.local.json`, `.env*`, `app/.data/`, and `exports/` are gitignored.
