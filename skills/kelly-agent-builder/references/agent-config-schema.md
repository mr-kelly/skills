# Agent Builder & Governance Console — Config Schema

Use this schema for the Busabase `agents` Base. The app reads and writes this
Base only; it never provisions or calls a real agent. Field slugs are
kebab-case in Busabase and normalized to snake_case in app code
(`app/app/js/providers/busabase-provider.js`).

## Agent config (`kelly-agent-builder-agents-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `agent-id` | `id` | text | stable domain id, e.g. `agent-001`, required |
| `name` | `name` | text | |
| `trigger-description` | `trigger_description` | longtext | |
| `allowed-tools` | `allowed_tools` | text | JSON array, e.g. `["file_read","crm_lookup"]` |
| `approval-required` | `approval_required` | text | `"true"` / `"false"` |
| `monthly-quota` | `monthly_quota` | number | |
| `calls-this-month` | `calls_this_month` | number | |
| `owning-team` | `owning_team` | text | may be empty; the UI surfaces this as an attention item |
| `status` | `status` | text | `draft\|live\|paused\|archived` |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

`allowed_tools` must be a subset of the fixed tool catalog in
`app/app/js/tool-catalog.js`: `web_search`, `code_exec`, `file_read`,
`file_write`, `send_email`, `calendar`, `crm_lookup`, `db_query`,
`slack_post`, `http_request`.

## Derived fields (computed, never persisted)

`app/app/js/agent-model.js#deriveAgent` computes a read-only `derived` view
for every agent:

- `is_quota_reached`: `status === "live" && calls_this_month >= monthly_quota &&
  monthly_quota > 0`. Note the `>=`: it fires the moment usage reaches quota,
  not only once it's exceeded — hence "reached" rather than "over".
- `usage_pct`: `calls_this_month / monthly_quota * 100`, rounded to 1 decimal;
  `0` when `monthly_quota` is `0`.
- `missing_required_fields`: any of `name`, `trigger_description`,
  `allowed_tools` (non-empty), `owning_team` (non-empty), `monthly_quota` (> 0)
  that are missing or invalid.
- `needs_attention`: `true` when any of the following hold, and
  `attention_reasons` lists which:
  - `draft_incomplete` — status is `draft` and `missing_required_fields` is
    non-empty.
  - `missing_owner` — `owning_team` is empty, regardless of status.
  - `quota_reached` — `is_quota_reached` is `true`.
  - `approval_without_owner` — `approval_required` is `true` and `owning_team`
    is empty.

## Governance rules

### Draft → live

Only allowed when `missing_required_fields` is empty, i.e. all of:

1. `name` is a non-empty string.
2. `trigger_description` is a non-empty string.
3. `allowed_tools` has at least one entry.
4. `owning_team` is a non-empty string.
5. `monthly_quota` is a number greater than `0`.

Enforced in `app/app/js/providers/busabase-provider.js#activateAgent` — the
browser form also disables the button, but the provider is the source of
truth and rejects the write (`status: 422`, `missing_fields`) when the gate
fails.

### Archive

Moves any agent, from any status (including `draft`, `live`, `paused`), to
`archived`. Archived agents become read-only: an update on an archived agent
is rejected (`status: 409`).

### Pause

Only allowed from `live`.

## Settings Base (`kelly-agent-builder-settings-v1`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | Purpose |
| --- | --- | --- |
| `kelly-agent-builder-onboarding` | `onboarding` | presence marks setup complete — this skill has no external accounts or secrets to configure |
| `kelly-agent-builder-lock` | `lock` | fields `locked` (bool), `owner`, `message` live directly on the row |

There is no external network call anywhere in this skill's app.
