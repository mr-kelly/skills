# Homework Coach Schema

Use this reference before editing `app/`, `scripts/`, or any JSON handoff file.

## Handoff Files

- `app/.data/homework_snapshot.json`: canonical local UI snapshot.
- `app/.data/decisions.json`: reviewer decisions keyed by `review_id`.
- `app/.data/agent_tasks.json`: queued work for the agent after `request_changes`.
- `app/.data/execution_report.json`: dry-run/apply report from `scripts/execute_decisions.ts`.
- `app/.data/provider_choice.json`: non-secret provider bootstrap choice.
- `app/.data/onboarding.json`: setup completion marker.
- `app/.data/agent.lock`: temporary writer/executor lock.

The app may display and edit only this provider state. The skill performs OCR, AI explanation, paper generation, and exports.

## Snapshot Shape

`homework_snapshot.json`:

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-homework-coach",
  "profile": {
    "display_name": "Student display name",
    "grade": "Grade 4",
    "language": "zh-HK"
  },
  "metrics": {
    "active_questions": 0,
    "mistakes_total": 0,
    "due_reviews": 0,
    "papers_generated": 0,
    "mastery_score": 0,
    "questions_analyzed": 0
  },
  "questions": [],
  "mistakes": [],
  "papers": [],
  "review_items": [],
  "activity_log": [],
  "warnings": []
}
```

## Question

Each `questions[]` item must include:

- `question_id`: stable id.
- `ref`: stable display number, shown as `Question #<ref>`.
- `title`, `subject`, `grade`, `topic`.
- `source`: `photo`, `text`, or `paper`.
- `status`: `needs_review`, `changes_requested`, `approved`, `done`, or `blocked`.
- `difficulty`: `easy`, `medium`, or `challenge`.
- `prompt_text`, `student_answer`, `correct_answer`.
- `outcome`: `correct`, `wrong`, `uncertain`, or `in_progress`.
- `confidence`: number between 0 and 1.
- `explanation`: object with `kid_summary`, `steps[]`, `key_concept`, `self_check`, and `next_hint`.

Store only minimal photo metadata such as `photo_label` unless the user explicitly asked to retain local images.

## Mistake

Each `mistakes[]` item must include:

- `mistake_id`, `question_id`, `ref`, `subject`, `topic`, `mistake_type`.
- `status`, `last_seen`, `next_review_at`, `attempts`, `review_history[]`.
- `analysis.root_cause`, `analysis.misconception`, `analysis.fix_strategy`, `analysis.similar_prompt`, `analysis.parent_note`.

Use fixable language. Avoid blame labels.

## Paper

Each `papers[]` item must include:

- `paper_id`, `ref`, `title`, `subject`, `grade`, `status`, `generated_at`.
- `focus_topics[]`, `linked_mistakes[]`, `question_count`, `estimated_minutes`, `difficulty_mix`.
- `items[]`: short human-readable question prompts or item titles.
- `analysis.wrong_count`, `analysis.strengths[]`, `analysis.review_plan[]`, `analysis.deep_notes`.

Approved paper exports are local-only. Parent/teacher review is required when the config says `parent_review_required_for_exports`.

## Review Item

Each `review_items[]` item must include:

- `review_id`, `ref`, `target_type`, `target_id`, `title`, `status`.
- `summary`, `risk[]`, `proposed_action`, `reason`, `suggestions[]`, `suggested_note`.

Allowed `target_type`: `question`, `mistake`, `paper`.

Typical `proposed_action` values:

- `add_to_mistake_book`
- `revise_explanation`
- `generate_practice`
- `export_paper_plan`
- `mark_understood`
- `no_action`

## Decisions

`decisions.json`:

```json
{
  "updated_at": "ISO timestamp",
  "decisions": {
    "rv-example": {
      "action": "approve",
      "comment": "Looks good.",
      "edited_note": "Optional edited parent/teacher note",
      "decided_at": "ISO timestamp"
    }
  }
}
```

Allowed decision actions:

- `approve`
- `request_changes`
- `block`
- `revise`

`request_changes` must enqueue an agent task. `approve` marks the item `approved`; execution is a later skill-side step.

## Agent Tasks

`agent_tasks.json`:

```json
{
  "updated_at": "ISO timestamp",
  "tasks": [
    {
      "task_id": "task-rv-example-...",
      "type": "explain_again",
      "review_id": "rv-example",
      "target_id": "q-example",
      "ref": 1,
      "comment": "Make the hint easier.",
      "requested_at": "ISO timestamp",
      "status": "queued"
    }
  ]
}
```

Allowed task types:

- `explain_again`
- `generate_practice`
- `revise_paper`
- `review_mistake`

## Execution Report

`execution_report.json` records local-only operations:

- `add_to_mistake_book`
- `mark_understood`
- `queue_practice_paper`
- `export_paper_plan`
- `request_revision`
- `block_item`

Each result must include `review_id`, `target_id`, `operation`, `status`, `dry_run`, and an actionable `target` or `reason`.
