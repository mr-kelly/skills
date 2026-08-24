# Kelly Campaigns Schema

Use this schema when reading or writing Kelly Campaigns' Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/kelly-campaigns-app/app/js/providers/busabase-provider.js`,
`content/kelly-campaigns-app/app/js/campaigns-model.js`). Metrics, the pre-send deliverability-risk
derivation, and the consent/suppression pre-send check are computed
client-side from the `sends`/`suppression` Bases on every read — they are
never stored.

An **item is one email send** — a campaign, a newsletter issue, or a single
sequence step. Sends are grouped by the SEND **phase** (`setup | engage |
nurture | deliver`) and carry a pre-send **quality gate** (EQS score +
`ship | fix | block` verdict), authored by the `email-quality-auditor` gate
and stored on the record.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `revise`.

## Segments (`kelly-campaigns-segments`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `segment-id` | `segment_id` | text | stable domain id, required |
| `name` | `name` | text | |
| `description` | `description` | longtext | |
| `audience-size` | `audience_size` | number | |

## Sends (`kelly-campaigns-sends`)

The review-queue rows — every campaign / newsletter / sequence step / cold
outbound send.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `send-id` | `send_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-batch row number; never renumber on regeneration |
| `type` | `type` | text | `campaign\|newsletter\|sequence_step\|cold_outbound` |
| `phase` | `phase` | text | `setup\|engage\|nurture\|deliver` |
| `from-identity-id` | `from_identity_id` | text | configured identity id |
| `subject` | `subject` | text | subject line |
| `preview-text` | `preview_text` | text | inbox preview / preheader |
| `segment-id` | `segment_id` | text | target segment id |
| `audience-size` | `audience_size` | number | |
| `status` | `status` | text | workflow status |
| `proposed-action` | `proposed_action` | text | `schedule_send\|ab_test\|hold\|no_action` |
| `risk` | `risk` | text | JSON array, e.g. `["money","spam-word"]` |
| `send-at` | `send_at` | text | ISO timestamp |
| `deliverability` | `deliverability` | longtext | JSON object: `{spf_pass, dkim_pass, dmarc_pass, spam_score, inbox_readiness}` — `risk` is derived client-side, never stored (see below) |
| `subject-variants` | `subject_variants` | longtext | JSON array `[{id, subject}]`; empty unless the send is an A/B subject test |
| `chosen-variant` | `chosen_variant` | text | A/B variant id the reviewer picked |
| `reason` | `reason` | longtext | why the agent proposes this send now |
| `body` | `body` | longtext | editable email body draft |
| `target-addresses` | `target_addresses` | longtext | JSON array; explicit recipient addresses, used only by the suppression pre-send check |
| `performance` | `performance` | longtext | JSON object `{delivered, open_rate, click_rate, unsub_rate, bounce_rate}`, `null`/absent until `done` |
| `quality-gate` | `quality_gate` | longtext | JSON object `{eqs, verdict, summary, checks}`, `null`/absent until the SEND audit has run |
| `created-at` | `created_at` | text | ISO timestamp |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |

- `quality_gate.verdict` is `ship | fix | block`. A `block` verdict is a hard
  stop regardless of `status`.
- `deliverability.risk` is derived, never stored: `high` when auth fails,
  `spam_score >= 5`, or `inbox_readiness < 0.6`; `medium` when
  `spam_score >= 3` or `inbox_readiness < 0.8`; else `low`. See
  `deliverabilityInfo()` in `content/kelly-campaigns-app/app/js/campaigns-model.js`.

## Suppression (`kelly-campaigns-suppression`)

The consent/suppression list: recipients or whole segments removed by
unsubscribe, hard bounce, or complaint.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `entry-id` | `entry_id` | text | stable domain id, required |
| `address` | `address` | text | exactly one of `address` / `segment-id` identifies the scope |
| `segment-id` | `segment_id` | text | |
| `reason` | `reason` | text | `unsubscribe\|hard_bounce\|complaint` |
| `note` | `note` | longtext | |
| `suppressed-at` | `suppressed_at` | text | ISO timestamp |
| `source` | `source` | text | e.g. `esp-webhook`, `operator` |

An address-level entry is global — it excludes that address from every send
regardless of segment. A segment-level entry only excludes recipients of
that segment. An explicitly-targeted suppressed address (a send's
`target_addresses` includes a suppressed `address`) hard-blocks the send; see
`checkSuppression()` in `content/kelly-campaigns-app/app/js/campaigns-model.js`.

## Settings (`kelly-campaigns-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | Shape |
| --- | --- | --- |
| `kelly-campaigns-profile` | `profile` | `payload` (JSON): `{operator: {name, role, company, timezone}, brand: {name, homepage, unsubscribe_url}, esp: {provider, display_name, secrets_ready}, from_identities: [{identity_id, from_name, from_email, reply_to, use_when}], sending_policy: {approval_required, daily_send_cap, hourly_send_cap, min_inbox_readiness, max_spam_score}, style_tone, list_health: {subscriber_count, bounce_rate, complaint_rate, churn_rate, avg_open_rate, avg_click_rate}}` |
| `kelly-campaigns-lock` | `lock` | not JSON-wrapped: fields `locked` (bool), `owner`, `message` live directly on the row |

While the lock row has `locked: true` the app rejects decision writes and
renders the campaigns queue read-only.

## Decisions

A human verdict writes `status`, `decision-note`, and `decided-at` directly
onto the send record — approving an edited draft also writes the new `body`;
picking an A/B variant also writes `chosen-variant`. There is no separate
decisions file: the send record is the single source of truth for both the
draft and its review state.

## Metrics And Warnings (computed, never stored)

- `metrics`: `needs_review`, `approved`, `done`, `blocked`, `scheduled`
  (= `approved` count), `at_risk` (deliverability risk `high` OR quality
  gate `block`).
- `warnings`: one entry per send whose quality gate returns `block`.

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step. Reads `sends` with `status: "approved"`, re-checks
the SEND quality gate, deliverability risk, and the consent/suppression
list, and with `--apply` writes `status: "done"` back onto each send that
clears every gate. It performs no ESP call, no send, and no list mutation
itself — that happens through the configured ESP as a separate, explicitly
authorized step. Without `--apply` it is a dry run that only prints the
handoff operations (`schedule_send` or `ab_test`).
