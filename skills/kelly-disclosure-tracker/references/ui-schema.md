# Cross-Entity Disclosure Tracker — Busabase Schema

Use this schema when reading or writing Kelly Disclosure Tracker's Busabase
Bases. Field slugs are kebab-case in Busabase and normalized to snake_case in
app code (`app/app/js/providers/busabase-provider.js`,
`app/app/js/tracker-model.js`). Per-vehicle/per-portfolio metrics and every
item's `status` are computed client-side from the `vehicles`/`items` Bases'
raw fields on every read — they are never stored.

This is a **workspace/review-queue hybrid** App-in-Skill: the human reviews
and checks off a standardized disclosure package per financing vehicle
(fund/SPV), across three generic entity roles. There is no filing capability
— the tracker only assembles, reviews, and reconciles disclosure metadata.

## Roles

- `origination` — the onshore origination entity that originates/services the
  underlying assets.
- `fund_manager` — the offshore fund-manager entity that manages the vehicle.
- `listing_venue` — the exchange/listing venue where the vehicle's notes/units
  are listed.

## Decision verdicts and the derived `status`

Ported verbatim from `computeItemStatus()` in `app/app/js/tracker-model.js`
(originally `applyDecisions()` in the retired `app/server/store.ts`):

- no decision yet → `needs_review`
- `verified` → `done`
- `needs_source` → `changes_requested` (waiting on a document from the
  counterparty entity — a revision loop, not a rejection)
- `flagged` → `blocked` (a real cross-entity inconsistency that must be
  escalated before the package can be considered complete)

Guardrail: a `verified` decision cannot silently settle an item that still
has an unresolved cross-entity reconciliation mismatch
(`reconciliation.match === false`). It is held at `changes_requested` unless
the reviewer explicitly sets `override-reconciliation` to `"true"` on the
decision.

## Vehicle readiness

Ported verbatim from `computeReadiness()`:

- `ready` — every item for the vehicle is `done`.
- `blocked` — at least one item is `blocked` (flagged inconsistency).
- `in_progress` — otherwise.

## Vehicles (`kelly-disclosure-tracker-vehicles-v1`)

One row per financing vehicle (9 rows, seeded by
`scripts/generate_batch.mjs`). Metrics/readiness are never stored — they are
recomputed client-side from the `items` Base on every read.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `vehicle-id` | `vehicle_id` | text | stable domain id, e.g. `veh-01`, required |
| `name` | `name` | text | e.g. `SPV Alpha 12` |
| `vehicle-type` | `vehicle_type` | text | `fund\|spv` |
| `origination-entity` | `origination_entity` | text | e.g. `Onshore Originator A` |
| `fund-manager-entity` | `fund_manager_entity` | text | e.g. `Offshore Manager I` |
| `listing-venue` | `listing_venue` | text | e.g. `Exchange One` |
| `base-currency` | `base_currency` | text | e.g. `USD` |
| `target-close-date` | `target_close_date` | text | e.g. `2026-09-30` |

## Disclosure Items (`kelly-disclosure-tracker-items-v1`)

One row per standardized disclosure checklist item (54 rows: 9 vehicles x 6
item templates, seeded by `scripts/generate_batch.mjs`). The reviewer's
decision writes `decision-action`/`decision-comment`/`decided-at`/
`override-reconciliation` directly onto the same row — there is no separate
decisions file. `scripts/execute_decisions.mjs` writes the
`execution-*` fields; the AirApp never writes them.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable domain id, e.g. `veh-01-aum_statement`, required |
| `vehicle-id` | `vehicle_id` | text | foreign key into `vehicles`, required |
| `role` | `role` | text | `origination\|fund_manager\|listing_venue` |
| `item-key` | `item_key` | text | e.g. `aum_statement` |
| `title` | `title` | text | human-readable title |
| `summary` | `summary` | text | short summary |
| `body` | `body` | longtext | trimmed source content for review |
| `category` | `category` | text | `origination\|fund_manager\|listing_venue` |
| `proposed-action` | `proposed_action` | text | `collect_document\|reconcile_figures\|confirm_filing\|no_action` |
| `reason` | `reason` | text | why this item needs attention |
| `reconciliation` | `reconciliation` | longtext | JSON `{field, origination_value, listing_value, match, note?}`, empty string if not applicable |
| `decision-action` | `decision_action` | text | `verified\|needs_source\|flagged`, empty until decided |
| `decision-comment` | `decision_comment` | longtext | reviewer note, written with the verdict |
| `decided-at` | `decided_at` | text | ISO timestamp, written with the verdict |
| `override-reconciliation` | `override_reconciliation` | text | `"true"\|"false"`, only meaningful when `decision-action` is `verified` and the item has an unresolved mismatch |
| `execution-status` | `execution_status` | text | `written\|skipped`, written only by `scripts/execute_decisions.mjs` |
| `execution-detail` | `execution_detail` | text | human-readable detail, written only by `scripts/execute_decisions.mjs` |
| `executed-at` | `executed_at` | text | ISO timestamp, written only by `scripts/execute_decisions.mjs` |

## Settings (`kelly-disclosure-tracker-settings-v1`)

Up to two rows, looked up by `record-id`/`kind`. A missing row means "not set
yet" (mirrors the retired local-file provider's null-on-ENOENT behavior).

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `config` | `config` | `{reviewer_name}` — missing means "Unassigned reviewer" |
| `run` | `run` | `{batch_id, generated_at}` — absent means no batch has been seeded yet |

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | `config\|run`, required |
| `kind` | `kind` | text | same value as `record-id`, required |
| `payload` | `payload` | longtext | JSON, see table above |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Generation (`scripts/generate_batch.mjs`)

The trusted seed step. Writes the fixed 9-vehicle / 54-item mock portfolio
(ported verbatim from the retired `scripts/generate_batch.ts`/
`app/server/demo.ts`, now living in `app/app/js/tracker-model.js`'s
`buildSeedData()`) into the `vehicles` and `items` Bases, upserting by
`vehicle-id`/`item-id` so repeated runs stay idempotent, and refreshes the
`run` settings row. Seeds a default `config` row only if none exists yet.
`--apply` gated (default dry run).

## Execution (`scripts/execute_decisions.mjs`)

The trusted hand-off step. Re-reads every item from Busabase and reports
which are settled (`written`: `done`/verified or `blocked`/flagged) vs still
awaiting a human decision (`skipped`: `needs_review` or
`changes_requested`/awaiting a source document) — ported verbatim from the
retired `scripts/execute_decisions.ts`. It never changes an item's workflow
status itself; it only writes the `execution-status`/`execution-detail`/
`executed-at` marker fields. There is no external side effect — this tracker
never files, submits, or transmits anything. `--apply` gated (default dry run
prints the report only).
