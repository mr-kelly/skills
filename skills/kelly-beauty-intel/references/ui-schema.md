# Kelly Beauty Intel UI Schema

This skill uses a Busabase-backed review-first data contract. The AirApp
reads/writes Busabase records only; the skill performs external reads and
approved handoffs outside the AirApp. Field slugs are kebab-case in Busabase
and normalized to snake_case in app code
(`app/app/js/providers/busabase-provider.js`, `app/app/js/intel-model.js`).

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `revise`, `block`.

## Signals (`kelly-beauty-intel-signals-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `signal-id` | `id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-batch row number |
| `title` | `title` | text | |
| `summary` | `summary` | longtext | |
| `why-it-matters` | `why_it_matters` | longtext | |
| `buyer-intent` | `buyer_intent` | longtext | |
| `confidence` | `confidence` | number | 0–1 |
| `detected-at` | `detected_at` | text | ISO timestamp |
| `status` | `status` | text | workflow status |
| `risk` | `risk` | text | JSON array |
| `source-name` | `source.name` | text | |
| `source-url` | `source.url` | text | |
| `suggested-action-id` | `suggested_action_id` | text | optional linked action |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |

## Actions (`kelly-beauty-intel-actions-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `action-id` | `id` | text | stable domain id, required |
| `ref` | `ref` | number | |
| `title` | `title` | text | |
| `summary` | `summary` | longtext | |
| `status` | `status` | text | workflow status |
| `priority` | `priority` | text | |
| `owner` | `owner` | text | |
| `reason` | `reason` | longtext | |
| `linked-signal-ids` | `linked_signal_ids` | text | JSON array |
| `next-step` | `next_step` | longtext | concrete next step for the operator or agent |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |

## Drafts (`kelly-beauty-intel-drafts-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `draft-id` | `id` | text | stable domain id, required |
| `ref` | `ref` | number | |
| `channel` | `channel` | text | IG caption, Xiaohongshu note, consultation script |
| `title` | `title` | text | |
| `body` | `body` | longtext | editable in the UI; approving an edit writes it back here |
| `status` | `status` | text | workflow status |
| `risk` | `risk` | text | JSON array |
| `linked-action-id` | `linked_action_id` | text | |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |

## Sources (`kelly-beauty-intel-sources-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `source-id` | `id` | text | stable domain id, required |
| `label` | `label` | text | |
| `status` | `status` | text | `configured\|needs_config` |
| `freshness` | `freshness` | text | |
| `coverage` | `coverage` | longtext | |

## Settings (`kelly-beauty-intel-settings-v1`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `kelly-beauty-intel-brand` | `brand` | `{brand_name, geography, language, customer_segment, approved_offer, cta, forbidden_claims, channels}` |
| `kelly-beauty-intel-lock` | `lock` | not JSON-wrapped: fields `locked` (bool), `owner`, `message` live directly on the row |

## Decisions

A human verdict writes `status`, `decision-note`, and `decided-at` directly
onto the signal/action/draft record in one write — there is no separate
decisions file. Approving a draft with an edited body also writes the new
`body`.

No external side effects are performed by the AirApp: handoff to an actual
publishing or messaging channel remains a separate, explicitly authorized
step outside this app.
