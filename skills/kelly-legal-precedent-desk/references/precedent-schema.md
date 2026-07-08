# Legal Precedent Desk Schema

This schema describes `app/.data/precedent_snapshot.json`, the local handoff file shared by the agent, scripts, and the App UI.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-legal-precedent-desk",
  "workspace": {
    "title": "Legal Precedent Desk",
    "subtitle": "Internal precedents and local court patterns",
    "firm": "safe display name"
  },
  "metrics": {
    "items_total": 0,
    "needs_review": 0,
    "approved": 0,
    "done": 0,
    "blocked": 0,
    "changes_requested": 0,
    "checks_failed": 0,
    "query_count": 0,
    "high_matches": 0,
    "local_patterns": 0
  },
  "entities": [],
  "items": [],
  "checks": [],
  "activity_log": []
}
```

## Review Item

Each item is one agent-prepared change request awaiting human judgment.

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Stable id, unique within the snapshot. |
| `ref` | yes | Human-friendly stable reference such as `Pack #1`. |
| `title` | yes | Short title for the review row. |
| `status` | yes | `needs_review`, `changes_requested`, `approved`, `done`, or `blocked`. |
| `summary` | yes | One-paragraph review summary. |
| `body` | no | Longer source-derived detail. |
| `recommendation` | no | Agent recommendation for the reviewer. |
| `draft` | no | Editable output text or memo draft. |
| `proposed_action` | no | Domain operation, usually `approve_research_pack`. |
| `risk` | no | Array of risk badges such as `legal`, `privacy`, `management`. |
| `evidence` | no | Array of short evidence strings or approved source ids. |
| `fields` | no | Domain-specific structured fields. |

## Domain Fields

Use `fields` to carry precedent-research details that let a lawyer verify the pack.

| Field | Notes |
| --- | --- |
| `query` | Focused legal question or fact pattern being researched. |
| `jurisdiction` | Target jurisdiction, court level, and any excluded forum. |
| `match_count` | Total similar cases considered in the pack. |
| `high_match_count` | Cases above the configured similarity or reviewer threshold. |
| `top_similarity` | Highest similarity score or labeled match strength. |
| `avg_similarity` | Average similarity score for the included pack. |
| `court_pattern` | Local court tendency, dissenting pattern, or "insufficient data" note. |
| `citation_count` | Traceable internal citations or approved public citations included. |

## Entities

Use `entities` for issue clusters, court-pattern groups, or precedent collections. Useful entity metrics include:

- `case_count`: cases included in the cluster.
- `avg_similarity`: average similarity for the cluster.
- `citation_count`: verified citations attached to the cluster.

## Business Gates

- Block export when citation traceability is missing, the jurisdiction fit is wrong, confidential facts leak, or findings imply a guaranteed result.
- Request changes when the similarity rationale is conclusory, local court-pattern caveats are missing, or the pack has too few comparable cases.
- Mark approved/done packs as inputs for matter strategy only; external citation, client advice, and filing language require separate lawyer approval.

## Decisions

`decisions.json` stores reviewer verdicts keyed by item id:

```json
{
  "schema_version": "1",
  "updated_at": "ISO timestamp",
  "decisions": {
    "item-id": {
      "action": "approve | request_changes | revise | block",
      "comment": "review note",
      "draft": "optional edited draft",
      "fields": {},
      "decided_at": "ISO timestamp"
    }
  }
}
```

`request_changes` creates `agent_tasks.json` entries for revision. `approve` makes the item eligible for `scripts/execute_decisions.ts --apply`; `block` closes it.

## Payload Import

`scripts/create_research_batch.ts` accepts a JSON payload with any of these keys:

```json
{
  "generated_at": "ISO timestamp",
  "entities": [],
  "items": [],
  "checks": [],
  "activity_log": []
}
```

The script upserts by `id`, recomputes metrics, and writes the snapshot under `agent.lock`.
