# Kelly Insurance Intel Schema

Use this schema when reading or writing Kelly Insurance Intel's
Busabase Bases. Field slugs are kebab-case in Busabase and normalized to
snake_case in app code (`app/app/js/providers/busabase-provider.js`,
`app/app/js/insurance-model.js`). The batch rollup metrics
(`needs_review`/`approved`/`blocked` and their per-kind counts) are computed
client-side from `signals`/`actions`/`drafts` on every read — they are never
stored.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `revise` (`revise` is draft-only).

## Signals (`kelly-insurance-intel-signals-v1`)

Source-backed regulator, insurer, product, premium, claims, benefit,
health, travel, and lifecycle signals — evidence, buyer-intent
interpretation, confidence, risk badges, and a suggested action.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `signal-id` | `signal_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-batch row number |
| `title` | `title` | text | |
| `summary` | `summary` | longtext | 1-3 sentence source-backed summary |
| `why-it-matters` | `why_it_matters` | longtext | why this matters to the buyer scene |
| `buyer-intent` | `buyer_intent` | longtext | interpreted buyer-intent note, e.g. "High: creates a concrete sales trigger." |
| `confidence` | `confidence` | number | 0-1 |
| `detected-at` | `detected_at` | text | ISO timestamp |
| `status` | `status` | text | workflow status |
| `risk` | `risk` | longtext | JSON array, e.g. `["claims-review"]` |
| `source-name` | `source_name` | text | e.g. "Official/news source" |
| `source-url` | `source_url` | text | evidence link |
| `suggested-action-id` | `suggested_action_id` | text | optional, links to `actions.action-id` |
| `decision-verdict` | `decision_verdict` | text | written with the decision |
| `decision-comment` | `decision_comment` | longtext | written with the decision |
| `decided-at` | `decided_at` | text | written with the decision |

## Actions (`kelly-insurance-intel-actions-v1`)

Approved/blocked/reviewable compliant meeting agendas, client education
notes, renewal scripts, or operating actions tied to today's signals.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `action-id` | `action_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-batch row number |
| `title` | `title` | text | |
| `summary` | `summary` | longtext | |
| `status` | `status` | text | workflow status |
| `priority` | `priority` | text | `high\|medium\|low` |
| `owner` | `owner` | text | e.g. "operator" |
| `reason` | `reason` | longtext | why this action, tied to which signal set |
| `linked-signal-ids` | `linked_signal_ids` | longtext | JSON array of `signals.signal-id` |
| `next-step` | `next_step` | longtext | concrete next step for the operator or agent |
| `decision-verdict` | `decision_verdict` | text | written with the decision |
| `decision-comment` | `decision_comment` | longtext | written with the decision |
| `decided-at` | `decided_at` | text | written with the decision |

## Drafts (`kelly-insurance-intel-drafts-v1`)

Editable channel drafts (client WhatsApp / advisor email / meeting
agenda), kept behind a review gate until approved.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `draft-id` | `draft_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-batch row number |
| `channel` | `channel` | text | `client WhatsApp\|advisor email\|meeting agenda` |
| `title` | `title` | text | |
| `body` | `body` | longtext | agent-drafted copy |
| `edited-body` | `edited_body` | longtext | human revision; the app always displays `edited-body \|\| body` |
| `status` | `status` | text | workflow status |
| `risk` | `risk` | longtext | JSON array, e.g. `["outbound"]` |
| `linked-action-id` | `linked_action_id` | text | links to `actions.action-id` |
| `decision-verdict` | `decision_verdict` | text | written with the decision |
| `decision-comment` | `decision_comment` | longtext | written with the decision |
| `decided-at` | `decided_at` | text | written with the decision |

A `revise` decision writes `edited-body` and leaves `status` at
`needs_review` — the review still needs an explicit approve/request_changes/
block after a revision.

## Sources (`kelly-insurance-intel-sources-v1`)

Configured news/insurer/regulator/competitor/trend source categories,
freshness, and coverage gaps.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `source-id` | `source_id` | text | stable domain id, required |
| `label` | `label` | text | |
| `status` | `status` | text | `configured\|needs_config` |
| `freshness` | `freshness` | text | e.g. "demo", "not connected" |
| `coverage` | `coverage` | longtext | what this category covers or is missing |

## Settings (`kelly-insurance-intel-settings-v1`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `batch` | `batch` | `{schema_version, batch_id, generated_at, source, vertical, buyer, offer}` |

## Decisions

A human verdict writes `status`, `decision-verdict`, `decision-comment`, and
`decided-at` directly onto the signal/action/draft record — approving an
edited draft also writes `edited-body`. There is no separate decisions
file: the item record is the single source of truth for both the content
and its review state.

## Execution (`scripts/execute_decisions.mjs`)

The trusted decision-execution step. Reads `signals`/`actions`/`drafts` with
a non-empty `decision-verdict`, prints the concrete operation
(`operationForDecision()` in `app/app/js/insurance-model.js`) for every
decided item, and with `--apply` writes `status: "done"` back onto every
`approve`-verdict item once the agent has performed the real handoff
outside this script. It performs no external side effect itself —
`request_changes`/`block` verdicts are left exactly as decided.
