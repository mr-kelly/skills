# Deal Scoring Desk — Busabase Schema & Rubric

Use this schema when reading or writing Kelly Deal Scorer's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`app/app/js/providers/busabase-provider.js`, `app/app/js/scorer-model.js`).
The composite score breakdown (`composite_score`/`factors`/
`suggested_share_rate`) is computed client-side from the `candidates` Base's
raw fields on every read — it is never stored.

## Rubric (`app/app/js/scorer-model.js`'s `DEFAULT_RUBRIC`, overridable via the `settings` Base's `config` row)

Five sub-factors, each 0-100 before weighting, weights sum to 1.0:

| Factor | Weight | What it measures | Formula |
| --- | --- | --- | --- |
| `stability` | 0.25 | Revenue volatility | `100 - (stdDev / mean * 100)`, clamped 0-100 |
| `growth` | 0.20 | Trend across the series | `50 + pctChange(last 3mo avg vs first 3mo avg) * 2`, clamped |
| `category_risk` | 0.15 | Vertical risk tier | Fixed lookup table per category (default: Education 90, Fitness 70, Retail 65, F&B 50; unknown categories fall back to 60) |
| `principal_ratio` | 0.25 | Requested principal vs. avg monthly revenue | Piecewise linear: 100 at 0x, 70 at 2x, 40 at 4x, 0 at 8x+ |
| `track_record` | 0.15 | History length + scale | `historyScore*0.6 + scaleScore*0.4`, history capped at 12mo, scale benchmarked at $50k/mo |

`composite_score = round(sum(raw_score * weight))`. Every intermediate number
above is echoed in the candidate's `factors[].detail` string, so a reviewer
can recompute the score by hand — this rubric is deliberately NOT an LLM or
API call.

Suggested revenue-share rate range (`suggestedShareRate()`) is a linear
function of `composite_score` against `rubric.revenue_share_rate.base_min_pct`
/ `base_max_pct` (default 6%/14%): stronger candidates get a lower, tighter
band.

## Decision verdicts

- `approve_term_sheet` → candidate `status` becomes `approved` (ready for
  `scripts/execute_decisions.mjs` to mark `done`).
- `send_back_for_data` → candidate `status` becomes `changes_requested` (the
  revision loop; re-review once more data arrives).
- `reject` → candidate `status` becomes `blocked`.

## Candidates (`kelly-deal-scorer-candidates-v1`)

One row per candidate business (8 rows, seeded by
`scripts/generate_batch.mjs`). The reviewer's decision writes
`decision-action`/`decision-comment`/`decided-at` and the workflow `status`
directly onto the same row — there is no separate decisions file.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `candidate-id` | `candidate_id` | text | stable domain id, e.g. `cand-001`, required |
| `business-name` | `business_name` | text | candidate business name |
| `category` | `category` | text | `F&B\|Retail\|Fitness\|Education` |
| `city` | `city` | text | e.g. `Austin, TX` |
| `requested-principal` | `requested_principal` | number | requested principal amount |
| `monthly-revenue` | `monthly_revenue` | longtext | JSON array of numbers, oldest → newest, 6-12 entries |
| `red-flags` | `red_flags` | longtext | JSON array of strings, e.g. `["recent_revenue_decline"]` |
| `status` | `status` | text | `needs_review\|changes_requested\|approved\|done\|blocked` |
| `decision-action` | `decision_action` | text | `approve_term_sheet\|send_back_for_data\|reject`, empty until decided |
| `decision-comment` | `decision_comment` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | ISO timestamp, written with the verdict |

## Settings (`kelly-deal-scorer-settings-v1`)

Up to two rows, looked up by `record-id`/`kind`. A missing row means "not set
yet" (mirrors the retired local-file provider's null-on-ENOENT behavior).

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `config` | `config` | `{base_currency, rubric: {weights, category_risk_tier, decision_thresholds, revenue_share_rate}}` — `rubric` is optional; a missing key merges `DEFAULT_RUBRIC` |
| `run` | `run` | `{batch_id, generated_at}` — absent means no batch has been seeded yet |

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | `config\|run`, required |
| `kind` | `kind` | text | same value as `record-id`, required |
| `payload` | `payload` | longtext | JSON, see table above |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Generation (`scripts/generate_batch.mjs`)

The trusted seed step. Writes the fixed 8-candidate mock queue (ported
verbatim from the retired `lib/demo-candidates.ts`'s `CANDIDATE_SEEDS`, now
living in `app/app/js/scorer-model.js`) into the `candidates` Base, resetting
every candidate's decision fields to `needs_review`, and refreshes the `run`
settings row. Seeds a default `config` row only if none exists yet (never
overwrites a fund's tuned rubric). `--apply` gated (default dry run).

## Execution (`scripts/execute_decisions.mjs`)

The trusted hand-off step. Re-reads Busabase, and for every candidate with
`status = "approved"`, marks it `done` — this is the only state transition it
performs. It never signs, wires funds, or contacts the business; "execution"
here means marking a term-sheet draft as prepared locally at the candidate's
suggested revenue-share rate, which is itself the reviewable artifact the
human just approved. Candidates with `status = "blocked"` or anything else
are reported but never modified. `--apply` gated (default dry run prints the
execution report only).
