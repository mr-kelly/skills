# Kelly Finance UI Schema

`app/.data/model_snapshot.json` is the canonical local handoff file. The app reads it and the scripts write it.

Required top-level fields:

- `snapshot_id`: stable id for this model run.
- `generated_at`: ISO timestamp.
- `source`: `demo` or `local`.
- `company`, `currency`, `display_unit`, `model_purpose`.
- `periods[]`: forecast rows with `label`, `revenue`, `gross_profit`, `ebitda`, `net_income`, `ending_cash`, `total_assets`, and `free_cash_flow`.
- `metrics`: counts and headline metrics: `needs_review`, `approved`, `done`, `blocked`, `revenue_cagr`, `ending_cash`, `free_cash_flow`, `balance_check`.
- `checks[]`: review queue items.
- `warnings[]`: model warnings that are not review items.
- `workbook.tabs[]`: generated workbook tab names.

Each check must include:

- `id`: stable local id.
- `title`, `summary`.
- `severity`: `info`, `warning`, or `critical`.
- `status`: `needs_review`, `changes_requested`, `approved`, `done`, or `blocked`.
- `check_type`: e.g. `statement_tie`, `formula_review`, `model_quality`.
- `evidence[]`: short evidence lines.
- `proposed_action`.
- `draft`: editable recommendation or delivery note.

Local handoff files:

- `model_snapshot.json`: model dashboard + check queue.
- `decisions.json`: human decisions keyed by check id.
- `agent_tasks.json`: checks returned to the agent via `request_changes`.
- `execution_report.json`: export/fix handoff results. It records concrete next steps only; the app itself does not mutate external systems.
- `onboarding.json`: setup completion marker.
- `agent.lock`: write lock while scripts generate or execute.
