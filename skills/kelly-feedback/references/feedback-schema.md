# Kelly Feedback Schema

Use this schema when reading or writing Kelly Feedback's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/kelly-feedback-app/app/js/providers/busabase-provider.js`, `content/kelly-feedback-app/app/js/feedback-model.js`).
Request `frequency`/`weighted_score` and every snapshot metric are computed
client-side from `feedback`/`requests`/`proposals` on every read via
`recomputeDerived()` — they are never stored.

Channels: `email`, `discord`, `slack`, `x`, `appstore`, `survey`, `interview`.

Sentiments: `positive`, `neutral`, `negative`.

Triage states: `new` (untriaged), `clustered` (linked to a request),
`ignored` (spam/no signal), `insight` (useful signal that is not a feature
request — bug reports, power-user patterns, docs ideas).

Request statuses: `candidate`, `roadmap`, `declined`, `needs_info`.

Proposal statuses: `needs_review`, `changes_requested`, `approved`, `done`,
`blocked`. Proposal types: `promote_request`, `decline_request`,
`merge_requests`, `publish_changelog`.

## Products (`kelly-feedback-products`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `product-id` | `product_id` | text | stable domain id, required |
| `display-name` | `display_name` | text | |
| `tagline` | `tagline` | text | optional one-liner |

## Sources (`kelly-feedback-sources`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `source-id` | `source_id` | text | stable domain id, required |
| `channel` | `channel` | text | see Channels above |
| `name` | `name` | text | |
| `collection` | `collection` | text | e.g. `kelly-email handoff`, `manual export` |
| `secret-envs` | `secret_envs` | longtext | JSON array of env var *names* (never values) |
| `last-ingest-at` | `last_ingest_at` | text | ISO timestamp |
| `item-count` | `item_count` | number | |
| `status` | `status` | text | `ok\|warning\|error` |

## Feedback (`kelly-feedback-feedback`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `feedback-id` | `feedback_id` | text | `fb-<source_id>-<external_id>`, required |
| `source-id` | `source_id` | text | |
| `channel` | `channel` | text | |
| `product` | `product` | text | product id or empty |
| `user-handle` | `user_handle` | text | email, @handle, reviewer name, or respondent label |
| `user-plan` | `user_plan` | text | free-form, mapped by `settings.plan-weights` |
| `user-tenure-months` | `user_tenure_months` | number | |
| `user-weight` | `user_weight` | number | revenue weight; default 1 |
| `text` | `text` | longtext | full raw feedback text, original language |
| `sentiment` | `sentiment` | text | see Sentiments above |
| `received-at` | `received_at` | text | ISO timestamp |
| `permalink` | `permalink` | text | optional source URL |
| `request-id` | `request_id` | text | linked request id or empty |
| `triage` | `triage` | text | see Triage states above |
| `agent-note` | `agent_note` | longtext | optional short agent annotation |

`weighted_score` on the linked request is the sum of linked feedback
weights, so weighted score = frequency × average user weight.

## Requests (`kelly-feedback-requests`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `request-id` | `request_id` | text | stable domain id, required |
| `title` | `title` | text | human-readable feature request title |
| `product` | `product` | text | product id or empty |
| `status` | `status` | text | see Request statuses above |
| `trend` | `trend` | text | `up\|flat\|down` |
| `effort-estimate` | `effort_estimate` | text | free-form, e.g. `M (1-2 weeks)` |
| `problem-statement` | `problem_statement` | longtext | agent-drafted problem statement |
| `spec-summary` | `spec_summary` | longtext | agent-drafted proposed spec summary |
| `representative-feedback-ids` | `representative_feedback_ids` | longtext | JSON array of `feedback-id`s |
| `decision-history` | `decision_history` | longtext | JSON array of `{at, actor, action, note}` |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

`frequency` and `weighted-score` are **not fields on this Base** — both are
derived client-side from `feedback` by `recomputeDerived()` every time the
snapshot is built, so the numbers always agree after any merge.

## Roadmap (`kelly-feedback-roadmap`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable domain id, required |
| `lane` | `lane` | text | `now\|next\|later` |
| `title` | `title` | text | roadmap item title |
| `request-id` | `request_id` | text | optional linked request id |
| `note` | `note` | longtext | optional short note |

Read-only in the app; lanes change only through an approved proposal
executed by `scripts/execute_decisions.mjs --apply`.

## Proposals (`kelly-feedback-proposals`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `proposal-id` | `proposal_id` | text | stable domain id, required |
| `type` | `type` | text | see Proposal types above |
| `title` | `title` | text | agent-proposed roadmap change |
| `status` | `status` | text | see Proposal statuses above |
| `request-id` | `request_id` | text | primary linked request id or empty |
| `request-ids` | `request_ids` | longtext | JSON array — for `merge_requests`, all involved request ids |
| `target-lane` | `target_lane` | text | `now\|next\|later` or empty (`promote_request` only) |
| `reason` | `reason` | longtext | why the agent proposes this |
| `evidence` | `evidence` | longtext | feedback counts, weights, accounts, trend |
| `draft-kind` | `draft_kind` | text | `changelog_note\|decline_reply\|merge_note` or empty |
| `draft` | `draft` | longtext | editable public text (changelog note, decline reply, ...) |
| `review-note` | `review_note` | longtext | Kelly's note from the review UI |
| `created-at` | `created_at` | text | ISO timestamp |
| `decided-at` | `decided_at` | text | ISO timestamp or empty |

`ref` (rendered as `Proposal #1`) is **not a field** — it is assigned
client-side by `feedback-model.js`'s `withProposalRefs()`, a stable
`created-at`-ascending sort, so refs stay put across reloads regardless of
`records.list` page order.

## Sync Log (`kelly-feedback-sync-log`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `sync-id` | `sync_id` | text | stable domain id, required |
| `at` | `at` | text | ISO timestamp |
| `actor` | `actor` | text | `kelly-feedback\|agent\|kelly` |
| `action` | `action` | text | `ingest\|cluster\|execute\|init` |
| `detail` | `detail` | longtext | short human-readable description |
| `count` | `count` | number | |

## Settings (`kelly-feedback-settings`)

One row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"` |
| `plan-weights` | `plan_weights` | longtext | JSON object, e.g. `{"free":1,"pro":3,"team":5}` |
| `default-weight` | `default_weight` | number | default 1 |
| `recency-half-life-days` | `recency_half_life_days` | number | default 30 |
| `roadmap-lanes` | `roadmap_lanes` | longtext | JSON array, default `["now","next","later"]` |

## Decisions

A human verdict writes directly onto the record it decides — there is no
separate decisions file:

- **Proposal** (`#/roadmap`): `status`, `review-note`, optionally an edited
  `draft`, and `decided-at` (unless the action is `revise`, a draft edit
  with no verdict). Actions: `approve`, `request_changes`, `block`, `revise`.
- **Feedback** (`#/inbox/<id>`): `triage` and, for `assign`, `request-id`.
  Actions: `assign`, `ignore`, `insight`.
- **Request** (`#/requests/<id>`): `effort-estimate`, `updated-at`.

## Ingest Payload (input to `scripts/ingest_feedback.mjs`)

```json
{
  "source": {
    "source_id": "support-email",
    "channel": "email",
    "name": "Support inbox",
    "collection": "kelly-email handoff"
  },
  "products": [
    { "product_id": "pulseboard", "display_name": "PulseBoard", "tagline": "..." }
  ],
  "items": [
    {
      "external_id": "stable id in the source system (dedupe key)",
      "product": "optional product id",
      "user": { "handle": "...", "plan": "pro", "tenure_months": 3, "weight": 3 },
      "text": "raw feedback text",
      "sentiment": "positive|neutral|negative (optional, defaults neutral)",
      "received_at": "ISO timestamp",
      "permalink": "optional URL",
      "agent_note": "optional"
    }
  ]
}
```

`products[]` is optional — include it to register or update product catalog
entries (mirrors kelly-messenger's `ingest_messages.mjs` optional `account`
onboarding field). Feedback ids are derived as `fb-<source_id>-<external_id>`;
re-ingesting the same payload is idempotent.

## Cluster Assignment Payload (input to `scripts/apply_clusters.mjs`)

```json
{
  "requests": [
    {
      "request_id": "req-csv-export",
      "title": "CSV export for dashboard data",
      "product": "product id",
      "status": "candidate",
      "trend": "up",
      "problem_statement": "...",
      "spec_summary": "...",
      "effort_estimate": "M (1-2 weeks)",
      "representative_feedback_ids": ["fb-..."],
      "note": "optional history note"
    }
  ],
  "assignments": [
    { "feedback_id": "fb-...", "request_id": "req-csv-export" },
    { "feedback_id": "fb-...", "request_id": "", "triage": "insight", "agent_note": "bug report, not a request" }
  ]
}
```

An empty `request_id` unassigns; combine with `triage` to mark `ignored` or
`insight`.

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step. Reads `proposals` with `status: "approved"`.
Without `--apply` it only prints the plan; with `--apply`:

- `update_roadmap` and `merge_requests` are **LOCAL** — applied directly to
  the `roadmap`/`requests` Bases.
- `publish_changelog_note` and `send_decline_reply` are **always**
  `handoff_ready` — this script never publishes a changelog, edits a roadmap
  doc, or sends a reply itself. Real delivery happens through the
  corresponding skill (`kelly-messenger`/`kelly-email`/docs edits) as a
  separate, explicitly authorized step.

Every processed proposal (local or handoff-only) is marked `status: "done"`
directly on the proposal record, making re-runs idempotent — Busabase reads
are always live, so there is no separate execution-report file.
