# Kelly PR Review Schema

Use this schema when reading or writing Kelly PR Review's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/kelly-pr-review-app/app/js/providers/busabase-provider.js`,
`content/kelly-pr-review-app/app/js/pr-review-model.js`). Workflow-status bucketing, decision-status
mapping, and the review-ref numbering are computed client-side from the
`reviews` Base on every read — they are never stored.

An **item is one GitHub pull request** under review. A PR moves through the
workflow via a human verdict written directly onto its record; after a
merged PR passes review, it can independently move through post-merge test
verification (`needs_test` → `tested`), also on the same record.

Workflow statuses: `needs_review`, `to_approve`, `approved`, `done`, `blocked`, `merged`.

Decision actions: `approve`, `comment`, `request_changes`, `no_action`, `needs_review`, `block`.

## Reviews (`kelly-pr-review-reviews`)

The review-queue rows — every pull request gathered by
`scripts/generate_review_batch.mjs`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable domain id, `owner/repo#123`, required |
| `repo` | `repo` | text | `owner/repo` |
| `number` | `number` | number | PR number |
| `title` | `title` | text | |
| `author` | `author` | text | GitHub login |
| `url` | `url` | text | `https://github.com/owner/repo/pull/123` |
| `summary` | `summary` | longtext | trimmed PR body/context |
| `body` | `body` | longtext | trimmed full PR body |
| `status` | `status` | text | workflow status |
| `proposed-action` | `proposed_action` | text | `approve\|comment\|request_changes\|no_action\|needs_review\|block` |
| `reason` | `reason` | longtext | why this action is proposed |
| `risk` | `risk` | longtext | JSON array, e.g. `["security","large_diff"]` |
| `labels` | `labels` | longtext | JSON array of GitHub label names |
| `changed-files` | `changed_files` | longtext | JSON array of file paths |
| `additions` | `additions` | number | |
| `deletions` | `deletions` | number | |
| `comments-count` | `comments_count` | number | |
| `checks` | `checks` | text | `passing\|failing\|""` |
| `state` | `state` | text | `open\|closed` |
| `merged` | `merged` | text | `"true"\|"false"` |
| `merged-at` | `merged_at` | text | ISO timestamp |
| `is-draft` | `is_draft` | text | `"true"\|"false"` |
| `created-at` | `created_at` | text | ISO timestamp; used to assign the stable `review_ref` ordering |
| `updated-at` | `updated_at` | text | ISO timestamp |
| `review-body` | `review_body` | longtext | editable review comment body, submitted as the `gh pr review` body |
| `patch-excerpt` | `patch_excerpt` | longtext | truncated diff, only populated when `review_policy.include_patch_excerpt` is set |
| `decision-action` | `decision_action` | text | the verdict that produced `status` |
| `decision-note` | `decision_note` | longtext | human review note |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `""\|dry_run\|executed\|skipped`, written by `scripts/execute_decisions.mjs` |
| `execution-detail` | `execution_detail` | longtext | JSON object `{command, reason, executed_at}` |
| `tested` | `tested` | text | `"true"\|"false"`, post-merge human test verification |
| `tested-at` | `tested_at` | text | ISO timestamp |
| `test-note` | `test_note` | longtext | what the human verified |
| `test-evidence` | `test_evidence` | longtext | JSON array of evidence link strings (a Busabase text field cannot hold an uploaded screenshot, so evidence is pasted links, not a file upload) |

- `verification_status` (`""\|needs_test\|tested`) is derived, never
  stored: `needs_test` when `merged` is true and `tested` is false, `tested`
  when both are true, `""` otherwise.
- Regenerating the batch (`scripts/generate_review_batch.mjs`) resets every
  live PR field plus `decision-*`/`execution-*` (a fresh `gh` read has no
  opinion on a prior human verdict), but never touches `tested`/`test-note`/
  `test-evidence` — those persist across regeneration exactly like the
  retired local-file provider's separate `tested.json` cache did.

## Settings (`kelly-pr-review-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | Shape |
| --- | --- | --- |
| `kelly-pr-review-profile` | `profile` | `payload` (JSON): `{reviewer: {handle, display_name}, repos: [{repo, label, include}], query: {state, review_requested, limit, merged_limit, merged_at, sort, order, include_drafts}, review_policy: {default_action, include_patch_excerpt, max_patch_chars, large_diff_changed_files, large_diff_additions, risk_keywords}, style: {tone}}` |
| `kelly-pr-review-lock` | `lock` | `payload` (JSON): `{locked, message, owner, started_at}` |

The profile row is written by `scripts/generate_review_batch.mjs --apply`
from the same local JSON/env-file config priority the retired
`lib/data-reader` used (`KELLY_PR_REVIEW_CONFIG` → `config.local.json` →
`~/.config/kelly-pr-review/config.json` → gh defaults). The AirApp only ever
reads this row for the Help & Settings summary — it never writes it.

## Decisions

A human verdict writes `status`, `decision-action`, `decision-note`, and
`decided-at` directly onto the review record — editing the review body
before deciding also writes `review-body`. There is no separate decisions
file: the review record is the single source of truth for both the draft and
its review state.

## Metrics (computed, never stored)

`needs_review`, `to_approve`, `approved` (excludes anything already
`execution-status: executed`), `done`, `blocked`, `needs_test`, `tested`. See
`countByWorkflow()` in `content/kelly-pr-review-app/app/js/pr-review-model.js`.

## Ingestion (`scripts/generate_review_batch.mjs`)

The trusted ingestion step. Calls `gh search prs` / `gh pr diff` for open
PRs requesting review and recently merged PRs, scores risk keywords and a
proposed action, and — with `--apply` — creates or updates each PR's row in
`reviews` (keyed by `item-id`) plus the `kelly-pr-review-profile` settings
row. Without `--apply` it is a dry run that only prints what would be
written. `--sample` uses built-in mock PRs instead of calling `gh`, for
previewing the UI without real GitHub access.

## Execution (`scripts/execute_decisions.mjs`)

The trusted execution step. Reads `reviews` rows with `status: "approved"`
and, with `--apply`, submits the **real** `gh pr review <number> --approve|
--comment|--request-changes --body-file <tmp>` call (or skips `no_action`
items with no GitHub call) and writes `execution-status: "executed"` +
`status: "done"` back onto the record. Without `--apply` it is a dry run
that only prints the command it would run. It re-reads each record
immediately before executing so a revoked approval or an already-executed
item is never submitted to GitHub twice. It never merges, closes, pushes,
edits branches, reruns workflows, or dismisses reviews.
