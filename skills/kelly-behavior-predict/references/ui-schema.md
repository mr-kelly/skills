# Kelly Behavior Predict Schema

Use this schema when reading or writing Kelly Behavior Predict's Busabase
Bases. Field slugs are kebab-case in Busabase and normalized to snake_case in
app code (`app/app/js/providers/busabase-provider.js`,
`app/app/js/behavior-model.js`). `predicted_action`, rule `triggers`, the
funnel, and the backtest are all computed client-side from the `sessions`
Base on every read — they are never stored.

Funnel stages: `browse | search | compare | booking_attempt | complete`
(fixed, ordered, generic consumer booking funnel).

Predicted/actual actions: `send_discount_offer | show_urgency_banner |
recommend_similar_items | send_reminder_email | no_action_needed`.

Decision statuses: `trusted | needs_recalibration`.

## Sessions (`kelly-behavior-predict-sessions-v1`)

One row per mock session — 100 rows total across 5 segments (scaled 0.4x
from the retired `lib/segments.ts`'s 60/55/45/50/40 so the total stays within
the Busabase `records.list` limit=100 cap; the per-segment seeded RNG stream
is unaffected — the first N sessions kept per segment are bit-identical to
the original uncapped run). `predicted-action` and the rule triggers are
**not** stored — they are recomputed on every read from
`evaluateRules()`/`predictNextAction()` in `app/app/js/behavior-model.js`,
so the board is always fresh regardless of when a browser session loads it.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `session-id` | `session_id` | text | e.g. `price_sensitive_browser-001`, required |
| `segment-id` | `segment_id` | text | one of the 5 segment ids below, required |
| `session-length` | `session_length` | number | minutes |
| `cart-abandon-count` | `cart_abandon_count` | number | |
| `price-check-count` | `price_check_count` | number | |
| `days-since-last-visit` | `days_since_last_visit` | number | |
| `coupon-clicks` | `coupon_clicks` | number | |
| `reached-stage` | `reached_stage` | text | funnel stage, see above |
| `actual-action` | `actual_action` | text | seeded mock "ground truth" (see Generation below) — NOT real outcome data, used only to make the backtest non-trivial |

## Segments (`kelly-behavior-predict-segments-v1`)

One row per segment archetype (5 rows: `price_sensitive_browser`,
`repeat_traveler`, `last_minute_booker`, `deal_hunter`,
`high_intent_planner` — full continuation-rate/range definitions live in the
`SEGMENTS` constant in `app/app/js/behavior-model.js`, not in Busabase). The
reviewer's verdict on a segment's prediction rule writes
`decision-status`/`decision-note`/`decided-at` directly onto the same row —
there is no separate decisions file.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `segment-id` | `segment_id` | text | stable domain id, required |
| `decision-status` | `decision_status` | text | `trusted\|needs_recalibration`, empty until decided |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | ISO timestamp, written with the verdict |

## Settings (`kelly-behavior-predict-settings-v1`)

One row, looked up by `record-id`/`kind = "config"`. A missing row means "not
set yet" — the app falls back to documented defaults (mirrors the retired
local-file provider's `summarizeConfig()` behavior).

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `config` | `config` | `{seed, product_name, vertical, target_precision}` |

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | `config`, required |
| `kind` | `kind` | text | same value as `record-id`, required |
| `payload` | `payload` | longtext | JSON, see table above |
| `updated-at` | `updated_at` | text | ISO timestamp |

## The Rule (not a model)

`evaluateRules(features)` in `app/app/js/behavior-model.js` evaluates a
short, ordered list of if/else triggers over `cart_abandon_count`,
`price_check_count`, `days_since_last_visit`, `session_length`, and
`reached_stage`. The first matching trigger (top to bottom) determines
`predicted_action`; every trigger is still evaluated so the segment detail
view can show the full list ("why this prediction"). This is a fixed,
hand-recomputable rule — NOT a real ML/LLM model.

## Backtest (computed, never stored)

`computeBacktest(sessions, segmentId)` compares each session's
`predicted_action` (recomputed) against its stored `actual_action` and
returns a standard multi-class confusion matrix: per-action
`true_positive`/`false_positive`/`false_negative`/`precision`/`recall`/`f1`/
`support`, plus `accuracy`, `macro_precision`, `macro_recall`, `macro_f1`.
Computed at both the overall level (all 100 sessions) and per segment.

## Generation (`scripts/generate_batch.mjs`)

The trusted seed step. Writes the fixed 100-session mock sample (ported
verbatim from the retired `lib/sessions.ts`'s `generateSessionsForSegment()`/
`generateAllSessions()`, now living in `app/app/js/behavior-model.js`) into
the `sessions` Base, ensures a `segments` row exists for every segment
**without touching any decision already recorded on it**, and refreshes the
`settings` `config` row. `--apply` gated (default dry run); `--seed`,
`--product-name`, `--vertical`, `--target-precision` override the `config`
row (unset flags keep the existing value, falling back to documented
defaults on first run).

The seeded PRNG (`mulberry32` + a string hash seed, in
`app/app/js/behavior-model.js`) is deterministic: no `fs`, no network, no
`Date.now()`, no `Math.random()`. The same seed always produces
byte-identical session features, funnel placement, and mock `actual_action`
— verified in `app/test/behavior-model.test.mjs` by calling
`generateAllSessions()` twice and asserting a deep-equal result, and by
pinning the first generated session's exact field values as a regression
check.
