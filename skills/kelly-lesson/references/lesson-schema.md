# Kelly Lesson Schema

Use this schema when reading or writing Kelly Lesson's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`app/app/js/providers/busabase-provider.js`, `app/app/js/lesson-model.js`).
Compliance checks, per-plan compliance scores, review-item content, the
recent-activity feed, and metrics are all computed client-side from the
`teachers`/`plans`/`checks`/`settings` Bases on every read (`buildSnapshot`/
`assembleSnapshot` in `lesson-model.js`) — the only persisted state is what
lives directly on those four Bases.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `revise`.

Plan sources: `agent_draft`, `teacher_import`.

Check results: `pass`, `warn`, `fail`, `agent_review`.

## Teachers (`kelly-lesson-teachers-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `teacher-id` | `teacher_id` | text | stable domain id, required |
| `name` | `name` | text | display name |
| `subject` | `subject` | text | |
| `grades` | `grades` | longtext | JSON array, e.g. `["Grade 7","Grade 8"]` |

## Plans (`kelly-lesson-plans-v1`)

A plan record is both the lesson plan and its review-queue item — there is
no separate review-item or decisions Base. `scripts/ingest_plan.mjs` writes
the plan/section fields; `scripts/run_checks.mjs` writes `compliance-score`;
the AirApp (or a human in a standalone local preview) writes the
`decision-*` fields; `scripts/execute_decisions.mjs` writes the
`execution-*` fields.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `plan-id` | `plan_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-Base row number so the dean can say "Plan #2" |
| `title` | `title` | text | |
| `subject` | `subject` | text | |
| `grade` | `grade` | text | |
| `unit` | `unit` | text | unit or chapter label |
| `teacher-id` | `teacher_id` | text | references `teachers.teacher-id` |
| `source` | `source` | text | `agent_draft\|teacher_import` |
| `status` | `status` | text | workflow status |
| `compliance-score` | `compliance_score` | number | `round(points/total*100)`, POINTS = pass 1 / warn 0.5 / fail 0 |
| `class-length-minutes` | `class_length_minutes` | number | |
| `duration-minutes` | `duration_minutes` | number | sum of `stages[].minutes` |
| `objectives` | `objectives` | longtext | JSON array of measurable objectives |
| `key-points` | `key_points` | longtext | JSON array |
| `difficulties` | `difficulties` | longtext | JSON array |
| `materials` | `materials` | longtext | JSON array |
| `curriculum-refs` | `curriculum_refs` | longtext | JSON array of curriculum standard references |
| `board-plan` | `board_plan` | longtext | board layout description |
| `homework` | `homework` | longtext | |
| `reflection` | `reflection` | longtext | post-lesson reflection |
| `safety-notes` | `safety_notes` | longtext | required for lab lessons |
| `stages` | `stages` | longtext | JSON array of `{name, minutes, activities}` |
| `notes` | `notes` | longtext | dean's freeform notes (see below) |
| `compliance-summary` | `compliance_summary` | longtext | one-line check summary for the review queue |
| `suggestions` | `suggestions` | longtext | JSON array of agent revision suggestions |
| `feedback-draft` | `feedback_draft` | longtext | editable feedback-to-teacher draft |
| `decision-action` | `decision_action` | text | `approve\|request_changes\|block\|revise` |
| `decision-note` | `decision_note` | longtext | dean's review note; also what the "Edit notes" panel writes |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent`, written by `execute_decisions.mjs` |
| `execution-operation` | `execution_operation` | text | `publish_plan\|request_revision` |
| `execution-target` | `execution_target` | text | export path (`publish_plan`) or `plan-id` (`request_revision`) |
| `execution-detail` | `execution_detail` | longtext | human-readable next step |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Checks (`kelly-lesson-checks-v1`)

One row per plan × compliance rule, keyed by `check-id = chk-<plan without
"plan-" prefix>-<rule-id>`. `scripts/run_checks.mjs` upserts every row;
`scripts/ingest_plan.mjs` can also upsert `agent_review`-typed rows via an
ingest payload's `check_results` (marking `judged-by: "agent"`, which
`run_checks.mjs` then preserves on re-runs).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `check-id` | `check_id` | text | `chk-<plan>-<rule>`, required |
| `plan-id` | `plan_id` | text | references `plans.plan-id` |
| `rule-id` | `rule_id` | text | e.g. `measurable_objectives`, `stage_count_timing` |
| `severity` | `severity` | text | `error\|warning` |
| `result` | `result` | text | `pass\|warn\|fail\|agent_review` |
| `evidence` | `evidence` | longtext | short evidence snippet |
| `judged-by` | `judged_by` | text | `agent`, only set for agent-judged `agent_review` rules |
| `checked-at` | `checked_at` | text | ISO timestamp |

## Settings (`kelly-lesson-settings-v1`)

A single row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `school-name` | `school_name` | text | |
| `school-kind` | `school_kind` | text | `middle_school\|primary_school\|high_school\|training_program` |
| `school-term` | `school_term` | text | term label |
| `class-length-minutes` | `class_length_minutes` | number | default class length; a plan may override |
| `subjects` | `subjects` | longtext | JSON array |
| `grades` | `grades` | longtext | JSON array |
| `template-sections` | `template_sections` | longtext | JSON array of `{key, label, required}` |
| `compliance-rules` | `compliance_rules` | longtext | JSON array of `{rule_id, name, severity, type, params?}` |
| `export-format` | `export_format` | text | `markdown` |
| `export-out-dir` | `export_out_dir` | text | default `exports` |
| `docx-via-agent` | `docx_via_agent` | text | `"true"\|"false"` |
| `feedback-handoff-skill` | `feedback_handoff_skill` | text | e.g. `kelly-email` |
| `feedback-requires-approval` | `feedback_requires_approval` | text | `"true"\|"false"` |

## Deterministic Compliance Rules

Evaluated by `evaluateRule()` in `lesson-model.js` (same logic in the AirApp
and `scripts/run_checks.mjs`), driven by `compliance-rules[].params`:

- `measurable_objectives` — every objective must contain a measurable verb (`params.measurable_verbs`, default English + Chinese list) and there must be at least `params.min_objectives` (default 2).
- `stage_count_timing` — at least `params.min_stages` (default 3) lesson-flow stages, every stage with `minutes > 0`.
- `duration_sum` — `sum(stages[].minutes)` within `params.tolerance_minutes` (default 2) of the class length passes; within 5 minutes warns; beyond that fails.
- `homework_assigned` — the `homework` section must be non-empty.
- `template_sections` — every `template-sections` row with `required: true` must be present on the plan.
- `safety_note_lab` — a lab lesson (title/unit/materials/stage text matching `params.lab_keywords`, default `["lab","experiment","实验"]`) must have a non-empty `safety-notes` section.

`agent_review`-typed rules (for example `curriculum_alignment`) are not
evaluated deterministically: an existing agent-judged pass/warn/fail is
preserved; otherwise the check is `warn` (no `curriculum-refs` to judge
against) or `agent_review` (pending).

## Decisions

A human verdict writes `status` (via `statusForVerdict()`), `decision-action`,
`decision-note`, and `decided-at` directly onto the plan record —
approving/revising with an edited draft also writes `feedback-draft`. There
is no separate decisions file: the plan record is the single source of truth
for both the draft and its review state. `revise` never changes `status`.

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step. Reads plans with `decision-action: "approve"` or
`"request_changes"`, and with `--apply` writes `execution-status`/
`execution-operation`/`execution-target`/`execution-detail`/`executed-at`
back onto each — it never changes `status` itself. Operations:

- `publish_plan` (from `approve`) → the agent runs `scripts/export_plans.mjs` to write the Markdown, then sends `feedback-draft` to the teacher via other channels (e.g. `kelly-email`) per SKILL.md's Boundary.
- `request_revision` (from `request_changes`) → the agent redrafts the plan per `decision-note`, re-ingests with `scripts/ingest_plan.mjs`, and re-runs `scripts/run_checks.mjs`.

## Export (`scripts/export_plans.mjs`)

Read-only against Busabase. Reads plans with `status` `approved` or `done`
and writes one Markdown file per plan to `--out` (default `exports/` at the
skill root, gitignored): a metadata table (school/subject/grade/unit/
teacher/class length/compliance score) followed by objectives, key points,
difficulties, materials, a lesson-flow table, board plan, homework, safety
notes, teaching reflection, and curriculum refs — whichever sections are
non-empty.

## Ingest Payload (`scripts/ingest_plan.mjs`)

Accepts a single plan object or:

```json
{
  "plans": [
    {
      "plan_id": "optional; derived from subject+title when absent",
      "title": "required",
      "subject": "required",
      "grade": "required",
      "unit": "optional",
      "teacher": "teacher display name (or teacher_id)",
      "source": "agent_draft|teacher_import",
      "status": "optional; defaults to needs_review",
      "sections": { "objectives": [], "key_points": [], "difficulties": [], "materials": [], "curriculum_refs": [], "board_plan": "", "homework": "", "reflection": "", "safety_notes": "", "stages": [{ "name": "", "minutes": 0, "activities": "" }] },
      "compliance_summary": "optional review-item summary",
      "suggestions": ["optional review-item suggestions"],
      "feedback_draft": "optional feedback draft"
    }
  ],
  "check_results": [
    { "plan_id": "…", "rule_id": "curriculum_alignment", "result": "pass|warn|fail", "evidence": "…" }
  ]
}
```

A new teacher name (with no matching `teacher_id`) is created on the fly in
the `teachers` Base, mirroring the retired local importer's behavior.
