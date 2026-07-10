# Agent Builder & Governance Console — Config Schema

Use this schema for `app/.data/agents.json`. The app reads and writes this file
only; it never provisions or calls a real agent. Keep the shape stable so the
UI, scripts, and any future data source can evolve independently.

## File

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "agents": []
}
```

## Agent config

```json
{
  "id": "agent-001",
  "name": "Inbound Ticket Triage",
  "trigger_description": "Classifies inbound support tickets and routes them to the right queue.",
  "allowed_tools": ["file_read", "crm_lookup", "slack_post"],
  "approval_required": false,
  "monthly_quota": 5000,
  "calls_this_month": 3120,
  "owning_team": "Support Ops",
  "status": "live",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

- `allowed_tools` must be a subset of the fixed tool catalog in
  `lib/tool-catalog.ts`: `web_search`, `code_exec`, `file_read`, `file_write`,
  `send_email`, `calendar`, `crm_lookup`, `db_query`, `slack_post`,
  `http_request`.
- `status` is one of `draft`, `live`, `paused`, `archived`.
- `owning_team` may be an empty string to represent a config with no assigned
  owning team; the UI surfaces this as an attention item.

## Derived fields (computed, never persisted)

`app/server/store.ts` computes a read-only `derived` view for every agent:

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

This is enforced server-side in `POST /api/agents/:id/activate` (see
`app/server/store.ts#activateAgent` and `app/server/hono.ts`) — the client-side
form also disables the button, but the server is the source of truth and
returns `422` with `missing_fields` when the gate fails.

### Archive

`POST /api/agents/:id/archive` moves any agent, from any status (including
`draft`, `live`, `paused`), to `archived`. Archived agents become read-only:
`PUT /api/agents/:id` on an archived agent returns `409`.

### Pause

`POST /api/agents/:id/pause` is only allowed from `live`.

## API summary

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/state` | Full state payload (summary + agent views); supports `?demo=1`. |
| `GET` | `/api/agents` | List agent views + governance summary. |
| `GET` | `/api/agents/:id` | Single agent view. |
| `POST` | `/api/agents` | Create a new `draft` agent config. |
| `PUT` | `/api/agents/:id` | Edit a non-archived agent config. |
| `POST` | `/api/agents/:id/activate` | Draft → live, gated by required fields. |
| `POST` | `/api/agents/:id/pause` | Live → paused. |
| `POST` | `/api/agents/:id/archive` | Any status → archived. |

All writes persist to `app/.data/agents.json`. There is no external network
call anywhere in this skill's app.
