# Kelly Lesson Snapshot Schema

Use this schema for `app/.data/lesson_snapshot.json`. Keep the shape stable so the local app, scripts, and the agent's drafting workflow can evolve independently. Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-lesson",
  "school": {
    "name": "Example Middle School",
    "kind": "middle_school|primary_school|high_school|training_program",
    "class_length_minutes": 45,
    "term": "term label"
  },
  "metrics": {
    "teacher_count": 0,
    "plan_count": 0,
    "plans_approved": 0,
    "plans_in_revision": 0,
    "plans_needs_review": 0,
    "checks_failed": 0,
    "compliance_pass_rate": 0
  },
  "teachers": [],
  "plans": [],
  "rules": [],
  "checks": [],
  "review_items": [],
  "activity_log": [],
  "warnings": []
}
```

`plans_approved` counts `approved` plus `done`; `compliance_pass_rate` is the percentage of resolved checks (pass/warn/fail) that pass.

## Teacher

```json
{
  "teacher_id": "stable local id",
  "name": "display name",
  "subject": "Math",
  "grades": ["Grade 7"]
}
```

## Plan

```json
{
  "plan_id": "stable local id",
  "ref": 1,
  "title": "human-readable lesson title",
  "subject": "Math",
  "grade": "Grade 7",
  "unit": "unit or chapter label",
  "teacher_id": "teacher id",
  "source": "agent_draft|teacher_import",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "compliance_score": 0,
  "class_length_minutes": 45,
  "duration_minutes": 45,
  "sections": {
    "objectives": ["measurable objective"],
    "key_points": ["key point"],
    "difficulties": ["difficulty"],
    "materials": ["material"],
    "stages": [
      { "name": "stage name", "minutes": 10, "activities": "what happens" }
    ],
    "board_plan": "board layout description",
    "homework": "homework description",
    "reflection": "post-lesson reflection",
    "curriculum_refs": ["curriculum standard reference"],
    "safety_notes": "required for lab lessons"
  },
  "notes": "dean's edit notes",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

`ref` is a stable per-snapshot number so the dean can say "Plan #2" in chat. `duration_minutes` is the sum of stage minutes. Sections mirror the school template; the keys above are the built-in set, and extra keys must be declared in `config template_sections`.

## Rule

```json
{
  "rule_id": "stable rule id",
  "name": "human-readable rule name",
  "severity": "error|warning",
  "type": "deterministic|agent_review"
}
```

Rules live in private config (`compliance_rules`, with optional `params`); `scripts/run_checks.ts` copies the sanitized list into the snapshot for display.

## Check

```json
{
  "check_id": "chk-<plan>-<rule>",
  "plan_id": "plan id",
  "rule_id": "rule id",
  "severity": "error|warning",
  "result": "pass|warn|fail|agent_review",
  "evidence": "short evidence snippet",
  "judged_by": "agent (optional, for agent_review rules)",
  "checked_at": "ISO timestamp"
}
```

`agent_review` means the rule needs the agent's judgement; the agent delivers the verdict through an ingest payload's `check_results`, and `run_checks.ts` preserves agent-judged results (`judged_by: "agent"`) on re-runs.

## Review Item

```json
{
  "review_id": "stable local id",
  "ref": 1,
  "plan_id": "plan id",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "compliance_summary": "one-line check summary",
  "suggestions": ["agent revision suggestion"],
  "feedback_draft": "editable feedback-to-teacher draft",
  "created_at": "ISO timestamp"
}
```

Decisions are stored separately in `app/.data/decisions.json` keyed by `review_id`:

```json
{
  "updated_at": "ISO timestamp",
  "decisions": {
    "rv-example": {
      "action": "approve|request_changes|block|revise",
      "comment": "review note",
      "draft": "edited feedback draft (optional)",
      "decided_at": "ISO timestamp"
    }
  }
}
```

`request_changes` also queues a `revise_plan` entry in `app/.data/agent_tasks.json`.

## Activity Log Entry

```json
{
  "id": "stable id",
  "at": "ISO timestamp",
  "actor": "agent|dean",
  "detail": "what happened",
  "plan_id": "optional plan id"
}
```

## Warning

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "plan_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```

## Ingest Payload

`scripts/ingest_plan.ts` accepts a single plan object or:

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
      "sections": { "…as in Plan above…" },
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

## Other Handoff Files

- `app/.data/decisions.json` — dean verdicts (shape above).
- `app/.data/agent_tasks.json` — `{ "updated_at": "…", "tasks": [{ "task_id", "type": "revise_plan", "review_id", "plan_id", "ref", "comment", "requested_at", "status" }] }`.
- `app/.data/execution_report.json` — written by `scripts/execute_decisions.ts --apply`; operations are `publish_plan`, `send_feedback`, `request_revision`.
- `app/.data/onboarding.json` — `{ "completed": true, "completed_at": "…", "config_version": "…" }`.
- `app/.data/agent.lock` — `{ "owner", "message", "started_at" }`; write endpoints return HTTP 423 while it exists.
