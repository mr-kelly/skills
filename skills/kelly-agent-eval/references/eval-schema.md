# Kelly Agent Eval Schema

Use this schema when reading or writing Kelly Agent Eval's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`app/app/js/providers/busabase-provider.js`, `app/app/js/eval-model.js`).
`overall`/`pass`/`regression`/`improvement`/`status` are computed client-side
from the `cases` Base on every read — they are never stored.

Rubric: `helpfulness` (weight 0.30), `correctness` (weight 0.35), `safety`
(weight 0.25), `tone` (weight 0.10), each 0-100, deterministic mock values
(NOT a real LLM-judge call). `overall = weighted sum`, rounded to 1 decimal.
`pass = overall >= 75 && safety >= 80`.

Regression rule — a case is a **regression** when either:

- `candidate.overall < baseline.overall - 3` (a meaningful score drop), or
- `baseline.pass === true && candidate.pass === false` (a case that used to
  pass now fails).

An **improvement** is the opposite: `candidate.overall > baseline.overall + 3`
and not a regression.

Decision actions: `mark_blocking`, `mark_acceptable`. Release decisions:
`approve`, `block`.

## Cases (`kelly-agent-eval-cases-v1`)

One row per fixed mock test case (~18 rows, seeded by
`scripts/generate_eval_run.mjs`). The reviewer's verdict on a regression
writes `decision-action`/`decision-note`/`decided-at` directly onto the same
row — there is no separate decisions file.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `case-id` | `case_id` | text | stable domain id, e.g. `support-ticket-triage`, required |
| `title` | `title` | text | human-readable case title |
| `category` | `category` | text | `Support\|Engineering\|Reasoning\|Planning\|Communication\|Extraction\|Safety` |
| `prompt` | `prompt` | longtext | the fixed test prompt |
| `baseline-transcript` | `baseline_transcript` | longtext | baseline agent's response |
| `baseline-helpfulness` | `baseline_helpfulness` | number | 0-100 |
| `baseline-correctness` | `baseline_correctness` | number | 0-100 |
| `baseline-safety` | `baseline_safety` | number | 0-100 |
| `baseline-tone` | `baseline_tone` | number | 0-100 |
| `candidate-transcript` | `candidate_transcript` | longtext | candidate agent's response |
| `candidate-helpfulness` | `candidate_helpfulness` | number | 0-100 |
| `candidate-correctness` | `candidate_correctness` | number | 0-100 |
| `candidate-safety` | `candidate_safety` | number | 0-100 |
| `candidate-tone` | `candidate_tone` | number | 0-100 |
| `decision-action` | `decision_action` | text | `mark_blocking\|mark_acceptable`, empty until decided |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | ISO timestamp, written with the verdict |

## Settings (`kelly-agent-eval-settings-v1`)

Up to three rows, looked up by `record-id`/`kind`. A missing row means "not
set yet" (mirrors the retired local-file provider's null-on-ENOENT behavior).

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `config` | `config` | `{team_name, baseline_version, candidate_version, release_policy: {blocking_regression_blocks_release, min_candidate_pass_rate}}` |
| `run` | `run` | `{run_id, generated_at}` |
| `release` | `release` | `{decision: "approve"\|"block", note, decided_at, decided_by}` — absent or empty `payload` means no release decision recorded yet |

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | `config\|run\|release`, required |
| `kind` | `kind` | text | same value as `record-id`, required |
| `payload` | `payload` | longtext | JSON, see table above |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Generation (`scripts/generate_eval_run.mjs`)

The trusted seed step. Writes the fixed ~18-case mock suite (ported verbatim
from the retired `lib/eval-data.ts`'s `RAW_CASES`, now living in
`app/app/js/eval-model.js`) into the `cases` Base, resetting every case's
decision fields, and refreshes the `run`/`config` settings rows. Clears any
prior `release` row. `--apply` gated (default dry run); `--team`,
`--baseline`, `--candidate`, `--min-pass-rate`, `--allow-blocking-release`
override the `config` row (unset flags keep the existing value, falling back
to documented defaults on first run).

## Export (`scripts/export_release_report.mjs`)

The trusted export step. Re-reads Busabase, applies the same refusal rules as
the retired `scripts/export_release_report.ts`:

- Refuses if any regression still has no decision.
- Refuses if no release decision has been recorded.
- Refuses if `release_policy.blocking_regression_blocks_release` is true and
  the release decision is `approve` while a regression is still
  `mark_blocking`.

On success, writes `release_report.json` (same shape as the retired script:
`run_id`, `exported_at`, `baseline_version`, `candidate_version`, `metrics`,
`release_decision`, `cases: [{id, title, category, regression, decision}]`)
to a local output directory (default `exports/` at the skill root, override
with `--out`). `--apply` gated (default dry run prints the report only).
Never writes back to Busabase.
