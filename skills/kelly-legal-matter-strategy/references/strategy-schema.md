# Legal Matter Strategy Schema

This schema describes `app/.data/strategy_snapshot.json`, the local handoff file shared by the agent, scripts, and the App UI.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-legal-matter-strategy",
  "workspace": {
    "title": "Legal Matter Strategy",
    "subtitle": "Strategy, evidence, and drafting plans",
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
    "evidence_gaps": 0,
    "deadlines_soon": 0,
    "draft_ready": 0
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
| `ref` | yes | Human-friendly stable reference such as `Strategy #1`. |
| `title` | yes | Short title for the review row. |
| `status` | yes | `needs_review`, `changes_requested`, `approved`, `done`, or `blocked`. |
| `summary` | yes | One-paragraph review summary. |
| `body` | no | Longer source-derived detail. |
| `recommendation` | no | Agent recommendation for the reviewer. |
| `draft` | no | Editable output text or memo draft. |
| `proposed_action` | no | Domain operation, usually `approve_strategy_pack`. |
| `risk` | no | Array of risk badges such as `legal`, `privacy`, `management`. |
| `evidence` | no | Array of short evidence strings or approved source ids. |
| `fields` | no | Domain-specific structured fields. |

## Domain Fields

Use `fields` to carry strategy details that a responsible lawyer can approve or correct.

| Field | Notes |
| --- | --- |
| `matter_stage` | Procedural stage such as pre-suit, first instance, arbitration, enforcement, or appeal. |
| `evidence_gaps` | Count of unresolved evidence gaps. |
| `evidence_gap_count` | Numeric alias for evidence-gap count when imports use explicit naming. |
| `evidence_gaps_list` | Specific missing documents, witness points, preservation tasks, or proof problems. |
| `issue_tree` | Main claims, defenses, burden points, and sub-issues. |
| `negotiation_options` | Settlement, mediation, injunction, preservation, or litigation-path options. |
| `posture` | Risk posture such as assertive, balanced, defensive, or information-needed. |
| `pleading_outline` | Drafting sections or memo outline to hand off after approval. |
| `deadline` | Critical date, time window, or caveat; never infer without a source. |

## Entities

Use `entities` for matter families, issue clusters, or strategy lanes. Useful entity metrics include:

- `evidence_gaps`: unresolved proof gaps in the group.
- `issue_count`: issues or sub-issues in the strategy tree.
- `option_count`: live procedural or negotiation options.

## Business Gates

- Block export when client objective, posture, jurisdiction, deadline, facts, assumptions, or evidence inventory is missing.
- Request changes when strategy hides evidence gaps, relies on unapproved precedent, converts assumptions into facts, or lacks use limits.
- Mark approved/done packs as internal drafting inputs only. Filing, sending, settlement authority, and client advice stay outside this app.

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

`scripts/create_strategy_batch.ts` accepts a JSON payload with any of these keys:

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
