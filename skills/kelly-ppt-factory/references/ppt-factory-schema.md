# Kelly PPT Factory Schema

Use this schema when reading or writing Kelly PPT Factory's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`app/app/js/providers/busabase-provider.js`, `app/app/js/ppt-model.js`).
Metrics, the review queue, activity log, and warnings are computed
client-side from the rows below on every read — they are never stored.

Workflow statuses: `needs_review`, `changes_requested`, `approved`,
`generated`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `revise`.

## Projects (`kelly-ppt-factory-projects-v1`)

A client / use-case / theme batch, e.g. Demo Studio / Pitch Deck / Seed Round.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `project-id` | `project_id` | text | stable domain id, required |
| `ref` | `ref` | text | stable per-batch row number |
| `client-id` | `client_id` | text | |
| `title` | `title` | text | |
| `course` | `course` | text | use case, e.g. `Pitch deck` |
| `stage` | `stage` | text | e.g. `storyboard`, `deck-generation`, `qa` |
| `owner` | `owner` | text | |
| `status` | `status` | text | workflow status |
| `deck-count` | `deck_count` | number | |
| `slide-count` | `slide_count` | number | |
| `due-at` | `due_at` | text | ISO date |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Decks (`kelly-ppt-factory-decks-v1`)

One PPTX deliverable under a project. The review-queue decision lives on the
same row: a deck with a non-empty `review-summary` is in the review queue,
and `decision-action`/`decision-note`/`decided-at` are written by the
reviewer's verdict.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `deck-id` | `deck_id` | text | stable domain id, required |
| `ref` | `ref` | text | |
| `project-id` | `project_id` | text | |
| `title` | `title` | text | |
| `theme` | `theme` | text | |
| `level` | `level` | text | e.g. `strategic`, `operator`, `executive` |
| `audience` | `audience` | text | |
| `status` | `status` | text | workflow status |
| `target-slide-count` | `target_slide_count` | number | |
| `approved-slide-count` | `approved_slide_count` | number | |
| `generated-slide-count` | `generated_slide_count` | number | |
| `style-score` | `style_score` | number | 0-100 |
| `pptx-path` | `pptx_path` | text | set by `scripts/generate_pptx.mjs` |
| `render-path` | `render_path` | text | |
| `updated-at` | `updated_at` | text | ISO timestamp |
| `review-summary` | `review_summary` | longtext | non-empty means "in the review queue" |
| `review-suggestions` | `review_suggestions` | longtext | JSON array |
| `review-draft-note` | `review_draft_note` | longtext | agent's suggested note before a human writes one |
| `decision-action` | `decision_action` | text | written by the reviewer's verdict |
| `decision-note` | `decision_note` | longtext | written by the reviewer's verdict |
| `decided-at` | `decided_at` | text | written by the reviewer's verdict |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent`, written by `scripts/execute_decisions.mjs` |
| `execution-operation` | `execution_operation` | text | e.g. `approve_deck_for_pptx_generation` |
| `execution-target` | `execution_target` | text | |
| `execution-detail` | `execution_detail` | longtext | |
| `executed-at` | `executed_at` | text | |

## Slide Cards (`kelly-ppt-factory-slide-cards-v1`)

The storyboard unit for one PPTX page. `content-*` fields mirror the retired
`SlideContent` shape; the review-queue decision lives on the same row, same
as decks.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `slide-id` | `slide_id` | text | stable domain id, required |
| `ref` | `ref` | text | slide order within the deck |
| `deck-id` | `deck_id` | text | |
| `project-id` | `project_id` | text | denormalized from the deck |
| `status` | `status` | text | workflow status |
| `slide-type` | `slide_type` | text | `cover\|agenda\|section\|concept\|comparison\|process\|data_chart\|case_study\|quote\|image_story\|exercise\|summary\|appendix\|...` |
| `layout` | `layout` | text | free-text layout description |
| `title` | `title` | text | |
| `objective` | `objective` | longtext | why this page exists |
| `content-subtitle` | `content_subtitle` | text | |
| `content-chinese` | `content_chinese` | text | |
| `content-pinyin` | `content_pinyin` | text | |
| `content-english` | `content_english` | text | |
| `content-bullets` | `content_bullets` | longtext | JSON array |
| `content-teacher-notes` | `content_teacher_notes` | longtext | presenter notes |
| `content-interaction` | `content_interaction` | longtext | |
| `content-image-prompt` | `content_image_prompt` | longtext | |
| `asset-brief` | `asset_brief` | longtext | visual brief for the page |
| `style-checks` | `style_checks` | longtext | JSON array, e.g. `["palette","font hierarchy"]` |
| `qa-flags` | `qa_flags` | longtext | JSON array of open QA concerns |
| `updated-at` | `updated_at` | text | ISO timestamp |
| `review-summary` | `review_summary` | longtext | non-empty means "in the review queue" |
| `review-suggestions` | `review_suggestions` | longtext | JSON array |
| `review-draft-note` | `review_draft_note` | longtext | |
| `decision-action` | `decision_action` | text | written by the reviewer's verdict |
| `decision-note` | `decision_note` | longtext | written by the reviewer's verdict |
| `decided-at` | `decided_at` | text | written by the reviewer's verdict |
| `execution-status` | `execution_status` | text | written by `scripts/execute_decisions.mjs` |
| `execution-operation` | `execution_operation` | text | e.g. `approve_slide_card` |
| `execution-target` | `execution_target` | text | |
| `execution-detail` | `execution_detail` | longtext | |
| `executed-at` | `executed_at` | text | |

## Style Systems (`kelly-ppt-factory-style-systems-v1`)

Reusable presentation style kits.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `style-system-id` | `style_system_id` | text | stable domain id, required |
| `name` | `name` | text | |
| `palette` | `palette` | longtext | JSON array of hex colors |
| `font-heading` | `font_heading` | text | |
| `font-body` | `font_body` | text | |
| `font-chinese` | `font_chinese` | text | optional CJK font |
| `visual-rules` | `visual_rules` | longtext | JSON array |
| `layout-rules` | `layout_rules` | longtext | JSON array |
| `component-library` | `component_library` | longtext | JSON array, e.g. `["title rail","metric callout"]` |

If no style system rows exist, the app falls back to
`app/app/js/ppt-model.js`'s `defaultStyleSystem()`.

## QA Checks (`kelly-ppt-factory-qa-checks-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `check-id` | `check_id` | text | stable domain id, required |
| `target-id` | `target_id` | text | deck / slide / export id |
| `target-type` | `target_type` | text | `deck\|slide\|export` |
| `rule` | `rule` | text | e.g. `Headline specificity` |
| `result` | `result` | text | `pass\|warn\|fail\|manual` |
| `evidence` | `evidence` | longtext | |
| `checked-at` | `checked_at` | text | ISO timestamp |

## Exports (`kelly-ppt-factory-exports-v1`)

Generated PPTX output records — created/updated by
`scripts/generate_pptx.mjs`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `export-id` | `export_id` | text | stable domain id, required |
| `deck-id` | `deck_id` | text | |
| `status` | `status` | text | `pending\|generated\|qa_failed\|done\|blocked` |
| `format` | `format` | text | `pptx\|pdf\|png` |
| `path` | `path` | text | relative to the skill root |
| `generated-at` | `generated_at` | text | ISO timestamp |
| `qa-summary` | `qa_summary` | longtext | |

## Settings (`kelly-ppt-factory-settings-v1`)

One row, looked up by `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | `"config"`, required |
| `default-brand-id` | `default_brand_id` | text | |
| `brand-name` | `brand_name` | text | |
| `brand-audience` | `brand_audience` | text | |
| `brand-language-mode` | `brand_language_mode` | text | e.g. `presentation` |
| `brand-style-system-id` | `brand_style_system_id` | text | which `styleSystems` row is the default |
| `export-out-dir` | `export_out_dir` | text | default `exports` |
| `export-render-dir` | `export_render_dir` | text | default `exports/rendered` |
| `export-pptx-template` | `export_pptx_template` | text | optional template path |
| `export-require-render-qa` | `export_require_render_qa` | text | `"true"\|"false"` (Busabase has no boolean field type) |

If no settings row exists, the app falls back to
`app/app/js/ppt-model.js`'s `buildConfigSummary()` defaults.

## Review Queue (computed, never stored)

A deck or slide card is "in the review queue" when its own `review-summary`
is non-empty (`deriveReviewItems()` in `app/app/js/ppt-model.js`). The
reviewer's verdict writes `status`, `decision-action`, `decision-note`, and
`decided-at` directly onto that same row — there is no separate
`review_items`/`decisions.json` bucket, since Busabase reads are always
live.

## Metrics, Activity Log, and Warnings (computed, never stored)

- `metrics`: `project_count`, `deck_count`, `slide_count`,
  `slides_needs_review`, `slides_approved`, `decks_generated`,
  `qa_warnings`, `avg_style_score` — recomputed from the rows above on every
  read (`recomputeMetrics()`).
- `activity_log`: derived from each decided deck's/slide's own
  `decided-at`/`decision-action`/`decision-note`, newest first
  (`deriveActivityLog()`).
- `warnings`: derived from `qaChecks` rows with `result: "warn"` or
  `"fail"` (`deriveWarnings()`).

## Execution (`scripts/execute_decisions.mjs`)

The trusted hand-off step. Reads decks and slide cards with a recorded
`decision-action`, and with `--apply` writes an execution marker
(`execution-status: "ready_for_agent"`, `execution-operation`,
`execution-target`, `execution-detail`, `executed-at`) back onto each — it
never flips workflow `status` itself (the decision write already did that)
and never generates a PPTX file.

## Generation (`scripts/generate_pptx.mjs`)

The trusted PPTX generation engine (uses `pptxgenjs`, ported faithfully from
the retired `scripts/generate_pptx.ts`). Only generates a deck whose own
`decision-action` is a genuine `approve` — never bare `status`, which a
spoofed import could otherwise set directly. After writing the `.pptx` file
to `exports/` (gitignored), it updates the deck's `pptx-path`,
`render-path`, `generated-slide-count`, and `status: "generated"`, and
creates/updates the deck's `exports` row.
