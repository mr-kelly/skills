# Kelly CRM Schema

Use this schema when reading or writing Kelly CRM's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`content/kelly-crm-app/app/js/crm-model.js`, `content/kelly-crm-app/app/js/providers/busabase-provider.js`).
Keep the shapes stable so the app, scripts, and skill can evolve
independently. Validate a drafted snapshot with
`node scripts/validate_snapshot.mjs path/to/snapshot.json` before writing it.

## Companies (`kelly-crm-companies`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `company-id` | `company_id` | text | stable domain id, required |
| `name` | `name` | text | required |
| `domain` | `domain` | text | |
| `industry` | `industry` | text | |
| `size` | `size` | text | headcount text |
| `location` | `location` | text | |
| `notes` | `notes` | longtext | |

## Contacts (`kelly-crm-contacts`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `contact-id` | `contact_id` | text | stable domain id, required |
| `name` | `name` | text | required |
| `company-id` | `company_id` | text | optional |
| `role` | `role` | text | |
| `email` | `email` | text | |
| `relationship` | `relationship` | text | `strong\|warm\|cool\|new` |
| `tags` | `tags` | text | JSON array, e.g. `["pilot","champion"]` |
| `last-touch-at` | `last_touch_at` | text | ISO timestamp |
| `next-followup-at` | `next_followup_at` | text | `YYYY-MM-DD` |
| `agent-notes` | `agent_notes` | longtext | short agent-maintained context |
| `channels` | `channels` | text | JSON array, e.g. `["email"]` |

## Deals (`kelly-crm-deals`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `deal-id` | `deal_id` | text | stable domain id, required |
| `name` | `name` | text | required |
| `company-id` | `company_id` | text | |
| `primary-contact-id` | `primary_contact_id` | text | |
| `contact-ids` | `contact_ids` | text | JSON array incl. primary |
| `stage` | `stage` | text | one of the operator's pipeline stages |
| `amount` | `amount` | number | |
| `currency` | `currency` | text | |
| `probability` | `probability` | number | 0–1 |
| `next-step` | `next_step` | text | human-readable |
| `owner` | `owner` | text | operator name |
| `opened-at` | `opened_at` | text | `YYYY-MM-DD` |
| `expected-close` | `expected_close` | text | `YYYY-MM-DD` |
| `last-activity-at` | `last_activity_at` | text | ISO timestamp |
| `status` | `status` | text | `open\|won\|lost` |
| `agent-next-action` | `agent_next_action` | longtext | shown in deal detail |
| `notes` | `notes` | longtext | |

Won/lost deals keep their `stage` (`won`/`lost`) and set `status` accordingly.

## Interactions (`kelly-crm-interactions`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `interaction-id` | `interaction_id` | text | stable domain id, required |
| `contact-id` | `contact_id` | text | required |
| `company-id` | `company_id` | text | |
| `deal-id` | `deal_id` | text | |
| `type` | `type` | text | `email\|meeting\|call\|chat\|social\|note` |
| `occurred-at` | `occurred_at` | text | ISO timestamp |
| `direction` | `direction` | text | `inbound\|outbound\|internal` |
| `summary` | `summary` | longtext | one or two sentences; never raw email bodies |
| `source` | `source` | text | `email\|meeting notes\|call notes\|linkedin\|note` |

## Follow-ups (`kelly-crm-followups`)

The review-queue items. `status` uses the standard workflow states.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `followup-id` | `followup_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-batch row number; never renumber on regeneration |
| `contact-id` | `contact_id` | text | required |
| `deal-id` | `deal_id` | text | optional |
| `channel-id` | `channel_id` | text | configured channel id, e.g. `email-main` |
| `channel-type` | `channel_type` | text | `email\|linkedin\|chat` |
| `subject` | `subject` | text | |
| `reason` | `reason` | longtext | why the agent proposes this follow-up now |
| `risk` | `risk` | text | JSON array, e.g. `["money","legal"]` |
| `due-at` | `due_at` | text | `YYYY-MM-DD` |
| `status` | `status` | text | `needs_review\|changes_requested\|approved\|done\|blocked` |
| `suggested-reply` | `suggested_reply` | longtext | editable draft message |
| `decision-comment` | `decision_comment` | longtext | the reviewer's note, written with the verdict |
| `decided-at` | `decided_at` | text | ISO timestamp, written with the verdict |
| `decided-by` | `decided_by` | text | `operator` for a human verdict |
| `created-at` | `created_at` | text | ISO timestamp |

A human verdict (`approve` / `request_changes` / `block` / `revise`) writes
`status`, `decision-comment`, `decided-at`, `decided-by`, and — when the
reviewer edited the draft — `suggested-reply`, all in one record write. There
is no separate decisions file: the followup record is the single source of
truth for both the draft and its review state.

## Settings (`kelly-crm-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `kelly-crm-operator` | `operator` | `{name, role, company, timezone, pipeline_stages, base_currency, style_tone}` |
| `kelly-crm-channels` | `channels` | `{channels: [{channel_id, type, display_name, handoff_skill, vault_ref}]}` |
| `kelly-crm-lock` | `lock` | not JSON-wrapped: fields `locked` (bool), `owner`, `message` live directly on the row |

While the lock row has `locked: true` the app rejects decision writes and
renders the follow-up queue read-only.

## Warnings

Computed in `content/kelly-crm-app/app/js/crm-model.js`, not stored in Busabase:

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "deal_id": "optional",
  "contact_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```
