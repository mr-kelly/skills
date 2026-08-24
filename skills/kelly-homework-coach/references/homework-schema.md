# Kelly Homework Coach Schema

Use this schema when reading or writing Kelly Homework Coach's Busabase
Bases. Field slugs are kebab-case in Busabase and normalized to snake_case
in app code (`content/kelly-homework-coach-app/app/js/providers/busabase-provider.js`,
`content/kelly-homework-coach-app/app/js/homework-model.js`). `active_questions`/`mistakes_total`/
`due_reviews`/`papers_generated` are computed client-side from the
`questions`/`mistakes`/`papers` Bases on every read — they are never
stored. `mastery_score`/`questions_analyzed` are an all-time aggregate
history that cannot be recomputed from the current record lists, so they
stay authored on the `settings` row.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `revise` (the
review UI only ever sends the first three; `revise` falls back to
`needs_review` like any unrecognized action, ported verbatim from the
retired `nextStatusForDecision()`).

## Questions (`kelly-homework-coach-questions`)

One row per homework question the agent has explained.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `question-id` | `question_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable display number, shown as `Question #<ref>` |
| `title` | `title` | text | |
| `subject` | `subject` | text | |
| `grade` | `grade` | text | |
| `topic` | `topic` | text | |
| `source` | `source` | text | `photo\|text\|paper` |
| `status` | `status` | text | workflow status, mirrored from the linked review's decision |
| `difficulty` | `difficulty` | text | `easy\|medium\|challenge` |
| `photo-label` | `photo_label` | text | short description only, e.g. "Homework photo, page 18 question 6" — never a raw photo or data URL |
| `prompt-text` | `prompt_text` | longtext | |
| `student-answer` | `student_answer` | text | |
| `correct-answer` | `correct_answer` | text | |
| `outcome` | `outcome` | text | `correct\|wrong\|uncertain\|in_progress` |
| `confidence` | `confidence` | number | 0-1 |
| `created-at` | `created_at` | text | ISO timestamp |
| `tags` | `tags` | longtext | JSON array |
| `explanation` | `explanation` | longtext | JSON object: `{kid_summary, steps[], key_concept, self_check, next_hint}` |
| `mistake-id` | `mistake_id` | text | optional link into `mistakes` |

## Mistakes (`kelly-homework-coach-mistakes`)

One row per mistake-book entry, keyed by a stable id so repeated review
updates the same card instead of duplicating it.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `mistake-id` | `mistake_id` | text | stable domain id, required |
| `question-id` | `question_id` | text | link into `questions` |
| `ref` | `ref` | number | stable display number, shown as `Mistake #<ref>` |
| `subject` | `subject` | text | |
| `topic` | `topic` | text | |
| `mistake-type` | `mistake_type` | text | use fixable language, avoid blame labels |
| `status` | `status` | text | workflow status |
| `last-seen` | `last_seen` | text | date string |
| `next-review-at` | `next_review_at` | text | date string |
| `attempts` | `attempts` | number | |
| `review-history` | `review_history` | longtext | JSON array of date strings |
| `analysis` | `analysis` | longtext | JSON object: `{root_cause, misconception, fix_strategy, similar_prompt, parent_note}` |

## Papers (`kelly-homework-coach-papers`)

One row per practice paper plan or completed-paper analysis.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `paper-id` | `paper_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable display number, shown as `Paper #<ref>` |
| `title` | `title` | text | |
| `subject` | `subject` | text | |
| `grade` | `grade` | text | |
| `status` | `status` | text | workflow status |
| `generated-at` | `generated_at` | text | ISO timestamp |
| `focus-topics` | `focus_topics` | longtext | JSON array |
| `linked-mistakes` | `linked_mistakes` | longtext | JSON array of `mistake-id` |
| `question-count` | `question_count` | number | |
| `estimated-minutes` | `estimated_minutes` | number | |
| `difficulty-mix` | `difficulty_mix` | longtext | JSON object, e.g. `{"easy":0.35,"medium":0.5,"challenge":0.15}` |
| `items` | `items` | longtext | JSON array of short human-readable item titles |
| `analysis` | `analysis` | longtext | JSON object: `{wrong_count, strengths[], review_plan[], deep_notes}` |

Approved paper exports happen locally, outside this app, after parent/teacher review.

## Reviews (`kelly-homework-coach-reviews`)

One row per parent/teacher review item, targeting a question, mistake, or
paper. The reviewer's decision and, once `scripts/execute_decisions.mjs`
runs, an execution marker are written directly onto the same row — there is
no separate decisions bucket.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `review-id` | `review_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable display number, shown as `Review #<ref>` |
| `target-type` | `target_type` | text | `question\|mistake\|paper` |
| `target-id` | `target_id` | text | id into the matching Base |
| `title` | `title` | text | |
| `status` | `status` | text | workflow status, set by the decision action |
| `summary` | `summary` | longtext | |
| `risk` | `risk` | longtext | JSON array |
| `proposed-action` | `proposed_action` | text | `add_to_mistake_book\|revise_explanation\|generate_practice\|export_paper_plan\|mark_understood\|no_action` |
| `reason` | `reason` | longtext | |
| `suggestions` | `suggestions` | longtext | JSON array |
| `suggested-note` | `suggested_note` | longtext | |
| `decision-action` | `decision_action` | text | written with the verdict |
| `decision-comment` | `decision_comment` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |
| `execution-status` | `execution_status` | text | written by `scripts/execute_decisions.mjs` |
| `execution-detail` | `execution_detail` | text | written by `scripts/execute_decisions.mjs` |
| `executed-at` | `executed_at` | text | written by `scripts/execute_decisions.mjs` |

A decision (`approve` → `approved`, `request_changes` → `changes_requested`,
`block` → `blocked`) also mirrors the resulting status onto the linked
question/mistake/paper's own `status` field
(`submitReview()` in `content/kelly-homework-coach-app/app/js/providers/busabase-provider.js`).

## Settings (`kelly-homework-coach-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `kelly-homework-coach-config` | `config` | `{student_profile: {display_name, grade, language, timezone}, subjects: [], learning_policy: {tone, answer_policy, max_steps_per_explanation, parent_review_required_for_exports, store_raw_photos}, practice_defaults: {question_count, estimated_minutes, difficulty_mix}, export: {format, out_dir}, metrics: {mastery_score, questions_analyzed}}` |

`learning_policy`/`practice_defaults`/`export` are sanitized before display
(`sanitizeObject()` masks any key containing `api_key`/`token`/`password`/
`secret`/`cookie` down to a boolean).

## Recording New Content (`scripts/record_homework.mjs`)

The trusted write path for how a new question/mistake/paper enters the
system (there is no upload API — see `SKILL.md`). Reads a JSON payload with
optional `questions`/`mistakes`/`papers`/`reviews` arrays (each item shaped
like the tables above, using the App key names) from `--file` or stdin, and
upserts each by its stable id. With `--apply`, dry run otherwise. Never
writes `decision-action`/`decision-comment`/`decided-at`/`execution-*` on a
review even if the payload includes them — a freshly recorded review always
starts `needs_review`, and re-syncing an existing review preserves whatever
decision a human already made.

## Execution (`scripts/execute_decisions.mjs`)

The trusted hand-off step. Reads every `reviews` row that has a
`decision-action`. For `approve`, reports the operation the agent should
perform next (from the review's own `proposed-action`, see the table above)
and, with `--apply`, writes an execution marker plus sets the review's own
`status` to `done`. For `block`, reports `block_item` and, with `--apply`,
writes an execution marker plus sets `status` to `blocked`. For
`request_changes`, only reports whether the review is still
`changes_requested` (the retired app's "queued agent task" equivalent) —
nothing is written, since the review's own status already reflects it. It
performs no export, filing, or external transmission itself.
