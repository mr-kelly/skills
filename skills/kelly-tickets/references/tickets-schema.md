# Kelly Tickets Schema

Use this schema when reading or writing Kelly Tickets' Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`app/app/js/providers/busabase-provider.js`, `app/app/js/tickets-model.js`).
SLA state and crew load are computed client-side from the stored rows on
every read (`buildSnapshot`) — they are never stored, so the desk is always
fresh regardless of when a browser session loads it relative to the last
ingest/triage run.

Channels: `wechat`, `phone`, `form`, `email`, `walk_in`.

Urgencies: `urgent`, `high`, `normal`, `low`.

Triage states (intake): `new`, `classified`, `ticketed`, `ignored`.

Ticket statuses: `open`, `assigned`, `in_progress`, `waiting`, `resolved`.

Dispatch proposal statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

SLA states (derived, never stored): `ok`, `at_risk`, `breached`, `met`.

Priorities: `P1`, `P2`, `P3`, `P4`.

Decision actions: intake `convert_to_ticket`/`ignore`; proposal `approve`/`request_changes`/`revise`/`block`.

## Crews (`kelly-tickets-crews-v1`)

Crews that tickets can be dispatched to.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `crew-id` | `crew_id` | text | stable id, required |
| `name` | `name` | text | |
| `skills` | `skills` | longtext | JSON array of category strings |
| `members` | `members` | text | optional lead/members display string |
| `contact-env` | `contact_env` | text | env var name holding the crew's contact — never the value |
| `active` | `active` | text | `"true"` \| `"false"` |

The browser cannot read the agent's environment, so the UI shows `contact_env` as a name only, never whether it is actually set — that check happens in `scripts/execute_decisions.mjs`, which runs with the trusted process's own env.

## Intake (`kelly-tickets-intake-v1`)

One raw complaint/request as it arrived on a channel, before or after triage. The human decision (convert to ticket / ignore) lives on the same row.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `intake-id` | `intake_id` | text | stable id `in-<10-char sha1>`, required |
| `channel` | `channel` | text | see channel list above |
| `external-id` | `external_id` | text | channel-native id when available |
| `content-hash` | `content_hash` | text | sha1 of channel+unit+text, dedupe fallback |
| `reporter` | `reporter` | text | display name |
| `contact-masked` | `contact_masked` | text | masked phone/handle, e.g. `138****14` |
| `unit` | `unit` | text | e.g. `12B` |
| `location` | `location` | text | free-text location when not a unit |
| `text` | `text` | longtext | one complaint, verbatim or lightly cleaned |
| `received-at` | `received_at` | text | ISO timestamp |
| `urgency-guess` | `urgency_guess` | text | see urgency list above |
| `category-guess` | `category_guess` | text | one of the property's configured categories |
| `triage-state` | `triage_state` | text | see triage-state list above |
| `ticket-id` | `ticket_id` | text | set once converted, e.g. `T-1001` |
| `attachments-note` | `attachments_note` | text | optional, e.g. "2 photos in WeChat group" |
| `decision-action` | `decision_action` | text | `convert_to_ticket` \| `ignore` |
| `decision-note` | `decision_note` | longtext | reviewer note |
| `decision-fields` | `decision_fields` | longtext | JSON `{category, urgency, unit}` edits from the classification editor |
| `decided-at` | `decided_at` | text | ISO timestamp |

Dedupe key: `channel + external_id` when `external_id` exists, otherwise `channel + content_hash`. PII rule: `contact_masked` must already be masked before it reaches Busabase; `scripts/ingest_intake.mjs` re-masks long digit runs defensively. Never store raw exports in Busabase.

An intake row with `decision_action: "convert_to_ticket"` and `triage_state` not yet `"ticketed"` is the Busabase-only equivalent of the retired local-file store's `agent_tasks.json` "convert_intake" queue entry — the agent polls for these and classifies via `scripts/apply_triage.mjs`.

## Tickets (`kelly-tickets-tickets-v1`)

Tickets tracked from classification through resolution, with an append-only history timeline.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `ticket-id` | `ticket_id` | text | `T-1001`-style id, required |
| `title` | `title` | text | |
| `category` | `category` | text | |
| `urgency` | `urgency` | text | see urgency list above |
| `unit` | `unit` | text | |
| `location` | `location` | text | |
| `reporter` | `reporter` | text | |
| `contact-masked` | `contact_masked` | text | |
| `status` | `status` | text | see ticket-status list above |
| `crew-id` | `crew_id` | text | empty until dispatched |
| `assignee` | `assignee` | text | optional person on the crew |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |
| `resolved-at` | `resolved_at` | text | ISO timestamp or empty |
| `sla-due-at` | `sla_due_at` | text | ISO timestamp |
| `intake-ids` | `intake_ids` | longtext | JSON array of intake ids |
| `resolution-note` | `resolution_note` | longtext | |
| `history` | `history` | longtext | JSON array of `{event, actor, at, note}`, append-only |

`history` events: `intake`, `classified`, `dispatch_proposed`, `dispatch_approved`, `crew_notified`, `crew_update`, `sla_breach`, `resolved`, `resolution_note`. Never rewrite past events — the timeline is the audit trail. `sla_state` (`ok|at_risk|breached|met`) is derived by `computeSlaState()` (at_risk when 25% or less of the SLA window remains) and never stored.

## Dispatch Proposals (`kelly-tickets-proposals-v1`)

The review queue. Stable refs render as `Dispatch #<ref>`. Decision and execution live on the same row — there is no separate decisions or execution-report bucket.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `proposal-id` | `proposal_id` | text | stable id `dp-<10-char sha1>`, required |
| `ref` | `ref` | number | stable display ref, e.g. `Dispatch #1` |
| `ticket-id` | `ticket_id` | text | |
| `title` | `title` | text | |
| `summary` | `summary` | text | one-line ticket summary |
| `proposed-crew-id` | `proposed_crew_id` | text | |
| `proposed-assignee` | `proposed_assignee` | text | optional person |
| `priority` | `priority` | text | `P1`\|`P2`\|`P3`\|`P4` |
| `sla-due-at` | `sla_due_at` | text | ISO timestamp |
| `sla-hours` | `sla_hours` | number | |
| `reason` | `reason` | longtext | why this crew/priority, incl. prior history |
| `note-to-crew` | `note_to_crew` | longtext | editable message draft for the crew |
| `status` | `status` | text | see proposal-status list above |
| `decision-action` | `decision_action` | text | `approve`\|`request_changes`\|`revise`\|`block` |
| `decision-note` | `decision_note` | longtext | reviewer note |
| `decision-draft` | `decision_draft` | longtext | edited `note_to_crew`, mirrored here for audit |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `planned`\|`ready_for_agent`\|`executed`\|`blocked` |
| `execution-operations` | `execution_operations` | longtext | JSON array of `{operation, target, detail}` (`notify_crew`\|`update_board`) |
| `execution-detail` | `execution_detail` | longtext | result detail |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp |

### Decision/status transitions

`approve` -> `status: "approved"`. `request_changes` -> `status: "changes_requested"`. `block` -> `status: "blocked"`. `revise` only edits `note_to_crew`/`decision_draft` — `status` is unchanged. `scripts/execute_decisions.mjs` promotes an already-`ready_for_agent` proposal to `status: "done"` only on a second `--apply` run that confirms the agent already acted on it — never on the first run.

## Sync Log (`kelly-tickets-sync-log-v1`)

Append-only history of ingest/triage/execute runs.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `log-id` | `log_id` | text | required |
| `at` | `at` | text | ISO timestamp |
| `source` | `source` | text | `wechat_export`\|`phone_log`\|`form`\|`email`\|`kelly-tickets` |
| `action` | `action` | text | `ingest`\|`triage`\|`execute` |
| `detail` | `detail` | longtext | human-readable summary |
| `count` | `count` | number | |

## Settings (`kelly-tickets-settings-v1`)

One row (`record-id: "config"`) with property profile, channels, categories, and SLA rules.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `property-name` | `property_name` | text | |
| `buildings` | `buildings` | number | |
| `timezone` | `timezone` | text | |
| `channels` | `channels` | longtext | JSON array of channel strings in use |
| `categories` | `categories` | longtext | JSON array of category strings |
| `sla-rules` | `sla_rules` | longtext | JSON array of `{category, urgency, hours}`; `category: "*"` is a wildcard |
| `sla-default-hours` | `sla_default_hours` | number | fallback when no rule matches, default 72 |

## Ingest Payload (`scripts/ingest_intake.mjs <payload.json>`)

The agent parses WeChat group exports, call logs, front-desk forms, and mailbox items into this shape; the script is the only write path into the Intake Base.

```json
{
  "source": "wechat_export",
  "items": [
    {
      "channel": "wechat",
      "external_id": "W-88121",
      "reporter": "Mrs. Tang",
      "contact": "13800002214",
      "unit": "12B",
      "location": "Building 2",
      "text": "Water dripping from the bathroom ceiling...",
      "received_at": "2026-07-03T07:36:00Z",
      "urgency_guess": "urgent",
      "category_guess": "plumbing",
      "attachments_note": "2 photos in WeChat group"
    }
  ]
}
```

## Triage Payload (`scripts/apply_triage.mjs <payload.json>`)

Classification and dispatch proposals are LLM work; this script is the deterministic merge and computes `sla_due_at` from the Settings row's `sla_rules`.

```json
{
  "classifications": [
    {
      "intake_id": "in-...",
      "action": "ticket",
      "category": "plumbing",
      "urgency": "urgent",
      "unit": "12B",
      "location": "Building 2",
      "title": "Water leak from bathroom ceiling in 12B",
      "note": "optional classification note"
    }
  ],
  "proposals": [
    {
      "ticket_id": "T-1001",
      "crew_id": "plumbing",
      "assignee": "",
      "priority": "P1",
      "reason": "water leak → plumbing crew; unit 12B has 2 prior leak reports",
      "note_to_crew": "Check the riser valve first."
    }
  ],
  "ticket_updates": [
    { "ticket_id": "T-1001", "status": "in_progress", "actor": "Sam Porter", "note": "Riser valve shut, drying." }
  ]
}
```
