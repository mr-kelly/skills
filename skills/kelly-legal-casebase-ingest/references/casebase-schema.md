# Legal Casebase Ingest Schema

This schema describes `app/.data/casebase_snapshot.json`, the local handoff file shared by the agent, scripts, and the App UI.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-legal-casebase-ingest",
  "workspace": {
    "title": "Legal Casebase Ingest",
    "subtitle": "Case intake and anonymization QA",
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
    "source_docs": 0,
    "pii_warnings": 0,
    "duplicate_candidates": 0
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
| `ref` | yes | Human-friendly stable reference such as `Intake #1`. |
| `title` | yes | Short title for the review row. |
| `status` | yes | `needs_review`, `changes_requested`, `approved`, `done`, or `blocked`. |
| `summary` | yes | One-paragraph review summary. |
| `body` | no | Longer source-derived detail. |
| `recommendation` | no | Agent recommendation for the reviewer. |
| `draft` | no | Editable output text or memo draft. |
| `proposed_action` | no | Domain operation, usually `approve_case_ingest`. |
| `risk` | no | Array of risk badges such as `legal`, `privacy`, `management`. |
| `evidence` | no | Array of short evidence strings or approved source ids. |
| `fields` | no | Domain-specific structured fields. |

## Domain Fields

Use `fields` to carry case-ingest facts that reviewers need before a record becomes reusable knowledge.

| Field | Notes |
| --- | --- |
| `cause` | Cause of action or dispute category. |
| `court` | Court, arbitral body, or issuing authority. |
| `procedure` | Procedural stage or document type, such as first-instance judgment or award. |
| `outcome` | Normalized result, including partial win/loss, settlement, dismissal, or remand. |
| `paragraphs` | Count or list of source paragraph anchors covered by the extraction. |
| `extraction_confidence` | Numeric or labeled extraction confidence. Low confidence should route to review. |
| `duplicate_score` | Similarity score against existing case records. High score should route to duplicate review. |
| `ingest_bucket` | Intake lane such as anonymization QA, taxonomy review, or ready to ingest. |
| `pii_cleared` | Boolean or status label showing whether anonymization review is complete. |
| `parties_redacted` | Count/list/status for party names removed or generalized. |
| `contacts_redacted` | Count/list/status for phone, address, ID, email, and other contact data removed. |

## Entities

Use `entities` for canonical case-library groupings, not for raw source documents. Useful entity metrics include:

- `case_count`: approved or candidate records in the group.
- `pii_flags`: unresolved anonymization warnings.
- `source_refs`: source paragraphs, exhibit refs, or approved document anchors.

## Business Gates

- Block ingestion when PII checks fail, source text is not traceable, taxonomy fields are missing, or duplicate risk is unresolved.
- Request changes when facts, holding, legal basis, or reasoning snippets are too thin for downstream precedent use.
- Mark approved/done records as sanitized inputs for precedent desk and firm radar only; do not export raw privileged text as reusable knowledge.

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

`scripts/ingest_documents.ts` accepts a JSON payload with any of these keys:

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
