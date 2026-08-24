# Kelly Launch Schema

Use this schema when reading or writing Kelly Launch's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`content/kelly-launch-app/app/js/providers/busabase-provider.js`, `content/kelly-launch-app/app/js/launch-model.js`).
The readiness gate (LQS + SHIP/FIX/BLOCK verdict), phase progress, and
metrics are computed client-side from the `items` Base on every read — they
are never stored.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `revise`.

## Items (`kelly-launch-items`)

Items are the review-queue rows — every launch task or asset. An item with a
non-empty `draft` is treated as an **asset** and appears in the Assets
approval queue.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-batch row number; never renumber on regeneration |
| `phase` | `phase` | text | `research\|assemble\|mobilize\|prove` |
| `title` | `title` | text | |
| `owner` | `owner` | text | |
| `channel-id` | `channel_id` | text | optional, e.g. `product_hunt`, `press`, `email` |
| `readiness` | `readiness` | text | `SHIP\|FIX\|BLOCK` |
| `proposed-action` | `proposed_action` | text | `publish_asset\|submit_channel\|send_pitch\|no_action` |
| `status` | `status` | text | workflow status |
| `draft` | `draft` | longtext | editable asset copy / submission text / pitch |
| `reason` | `reason` | longtext | why the agent proposes this now / why it is blocked |
| `format` | `format` | text | `markdown\|text`, for `publish_asset` items |
| `risk` | `risk` | text | JSON array, e.g. `["public","press"]` |
| `created-at` | `created_at` | text | ISO timestamp |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |

Public submissions (`product_hunt`, `hacker_news`) and press outreach are
always approval-required.

## Channels (`kelly-launch-channels`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `channel-id` | `channel_id` | text | e.g. `product_hunt`, required |
| `type` | `type` | text | `product_hunt\|hacker_news\|press\|email\|changelog` |
| `display-name` | `display_name` | text | |
| `submission-status` | `submission_status` | text | `queued\|drafting\|scheduled\|submitted\|live` |

## Runbook (`kelly-launch-runbook`)

The launch-day timeline, sorted by `step-id`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `step-id` | `step_id` | text | e.g. `run-01`, required — sort order |
| `offset` | `offset` | text | `T-60m\|T-0\|T+30m` |
| `at` | `at` | text | wall-clock time, e.g. `08:00` |
| `title` | `title` | text | ordered launch-day action |
| `owner` | `owner` | text | on-call owner |
| `note` | `note` | longtext | war-room note for this step |

## Settings (`kelly-launch-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `kelly-launch-profile` | `profile` | `{product: {name, tagline, homepage, category}, launch: {target_date, timezone}, style_tone, press_lists, readiness_policy: {block_on, min_ship_ratio}, channels: [{channel_id, type, display_name, handoff_skill, secret_envs, secrets_ready}]}` |
| `kelly-launch-lock` | `lock` | not JSON-wrapped: fields `locked` (bool), `owner`, `message` live directly on the row |

While the lock row has `locked: true` the app rejects decision writes and
renders the asset queue read-only.

## Decisions

A human verdict writes `status`, `decision-note`, and `decided-at` directly
onto the item record — approving an edited draft also writes the new
`draft`. There is no separate decisions file: the item record is the single
source of truth for both the draft and its review state.

## Readiness Gate (computed, never stored)

- `readiness.verdict`: `BLOCK` if any item is `BLOCK`, else `FIX` if any
  blockers remain (`BLOCK` or `FIX`-and-`blocked`), else `SHIP`.
- `readiness.lqs` (Launch Quality Score, 0-100): `round(((ship_count + fix_count * 0.5) / item_count) * 100)`.
- `phase_progress`: per RAMP phase, `{phase, total, done}` counted from `items`.

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step. Reads `items` with `status: "approved"`, and with
`--apply` writes `status: "done"` back onto each. It performs no public
submission or send itself — that happens through the corresponding skill
(for example `kelly-email`) as a separate, explicitly authorized step.
Execution semantics by `proposed_action`:

- `submit_channel` → hand off to the channel connector for `channel_id`.
- `send_pitch` → hand off to `kelly-email` (or the configured press skill).
- `publish_asset` → hand off the approved `draft` in the item's `format`.
