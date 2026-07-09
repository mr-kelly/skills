# Kelly AI Newsroom UI Schema

This skill uses a local review-first file contract. The app reads/writes JSON files under `app/.data/`; the skill performs external reads and approved handoffs.

## Batch

`current_batch.json`:

```json
{
  "schema_version": "1",
  "batch_id": "kelly-intel-YYYYMMDD-HHMMSS",
  "generated_at": "ISO timestamp",
  "source": "kelly-ai-newsroom",
  "vertical": "AI/news-source intelligence",
  "buyer": "founders, operators, and product sellers who need to convert news and trend signals into daily sales scenes",
  "offer": "daily news-source and buyer-intent intelligence that turns trend signals into approved sales actions",
  "metrics": {
    "signals_needs_review": 0,
    "actions_needs_review": 0,
    "drafts_needs_review": 0,
    "approved": 0,
    "blocked": 0
  },
  "signals": [],
  "actions": [],
  "drafts": [],
  "sources": []
}
```

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `revise`, `block`.

## Signal

Required fields:

- `id`, `ref`, `title`, `summary`, `why_it_matters`, `buyer_intent`, `status`, `confidence`, `detected_at`
- `source`: `{ "name": "...", "url": "..." }`
- `risk`: string array
- `suggested_action_id`: optional action id

## Action

Required fields:

- `id`, `ref`, `title`, `summary`, `status`, `priority`, `owner`, `reason`
- `linked_signal_ids`: string array
- `next_step`: concrete next step for the operator or agent

## Draft

Required fields:

- `id`, `ref`, `channel`, `title`, `body`, `status`, `risk`, `linked_action_id`

Drafts are editable in the UI. User edits are stored in `decisions.json`, not written back into the batch until the skill applies decisions.

## Decisions

`decisions.json`:

```json
{
  "schema_version": "1",
  "updated_at": "ISO timestamp",
  "decisions": {
    "item-id": {
      "action": "approve",
      "note": "",
      "edited_body": "",
      "decided_at": "ISO timestamp"
    }
  }
}
```

## Execution Report

`execute_decisions.ts` writes `execution_report.json` with concrete operations such as:

- `export_action_plan`
- `handoff_content_pack`
- `queue_agent_revision`
- `mark_blocked`

No external side effects are performed by the script.
