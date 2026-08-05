# Legal Casebase Ingest Schema

Use this schema when reading or writing Legal Casebase Ingest's Busabase
Bases. Field slugs are kebab-case in Busabase and normalized to snake_case in
app code (`app/app/js/providers/busabase-provider.js`,
`app/app/js/casebase-model.js`). Metrics and the recent-activity feed are
computed client-side from the `items`/`entities`/`checks` Bases on every read
(`buildSnapshot`/`assembleSnapshot` in `casebase-model.js`) — the only
persisted state is what lives directly on those four Bases.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `revise`, `block`. Unlike some
other Kelly review desks, `revise` maps status back to `needs_review` (saving
an edited draft/note returns the record to the queue), not "unchanged" — see
`statusFromDecision()` in `casebase-model.js`.

Check results: `pass`, `warn`, `fail`.

## Items (`kelly-legal-casebase-ingest-items-v1`)

An item record is both the case-record workbench entry and its review-queue
item — there is no separate review-item or decisions Base.
`scripts/ingest_documents.mjs` writes the item/field columns; the AirApp (or
a human in a standalone local preview) writes the `decision-*` fields;
`scripts/execute_decisions.mjs` writes the `execution-*` fields.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable domain id, required |
| `ref` | `ref` | text | human-friendly stable reference, e.g. `Intake #1` |
| `title` | `title` | text | short title for the review row |
| `category` | `category` | text | case category |
| `status` | `status` | text | workflow status |
| `owner` | `owner` | text | assigned reviewer |
| `risk` | `risk` | longtext | JSON array of risk badges, e.g. `["privacy","business_secret"]` |
| `summary` | `summary` | longtext | one-paragraph review summary |
| `body` | `body` | longtext | longer source-derived detail |
| `recommendation` | `recommendation` | longtext | agent recommendation for the reviewer |
| `proposed-action` | `proposed_action` | text | domain operation, usually `approve_case_ingest` |
| `draft` | `draft` | longtext | editable output text / rule summary draft |
| `evidence` | `evidence` | longtext | JSON array of short evidence strings |
| `cause` | `cause` | text | cause of action / dispute category |
| `court` | `court` | text | court, arbitral body, or issuing authority |
| `procedure` | `procedure` | text | procedural stage or document type |
| `outcome` | `outcome` | text | normalized result |
| `paragraphs` | `paragraphs` | longtext | JSON array of source paragraph anchors |
| `extraction-confidence` | `extraction_confidence` | number | extraction confidence, 0-1 |
| `duplicate-score` | `duplicate_score` | number | similarity score against existing records |
| `ingest-bucket` | `ingest_bucket` | text | intake lane / topic bucket |
| `pii-cleared` | `pii_cleared` | text | `"true"\|"false"` |
| `parties-redacted` | `parties_redacted` | text | `"true"\|"false"` |
| `contacts-redacted` | `contacts_redacted` | text | `"true"\|"false"` |
| `decision-action` | `decision_action` | text | `approve\|request_changes\|revise\|block` |
| `decision-note` | `decision_note` | longtext | reviewer's review note |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent`, written by `execute_decisions.mjs` |
| `execution-operation` | `execution_operation` | text | `export_case_record\|request_revision` |
| `execution-target` | `execution_target` | text | export path (`export_case_record`) or `item-id` (`request_revision`) |
| `execution-detail` | `execution_detail` | longtext | human-readable next step |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Entities (`kelly-legal-casebase-ingest-entities-v1`)

Canonical case-library groupings, not raw source documents.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `entity-id` | `entity_id` | text | stable domain id, required |
| `title` | `title` | text | display name |
| `meta` | `meta` | text | short meta line, e.g. cause · court · stage |
| `status` | `status` | text | rollup status |
| `owner` | `owner` | text | responsible lawyer |
| `summary` | `summary` | longtext | one-paragraph summary |
| `tags` | `tags` | longtext | JSON array of tags |
| `metrics` | `metrics` | longtext | JSON object, e.g. `{"case_count":18,"pii_flags":1,"source_refs":14}` |

## Checks (`kelly-legal-casebase-ingest-checks-v1`)

Deterministic QA checks for PII leakage, missing metadata, source coverage,
and tag confidence. `scripts/ingest_documents.mjs` upserts these alongside
items/entities as part of the agent's payload.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `check-id` | `check_id` | text | stable domain id, required |
| `label` | `label` | text | short check name |
| `status` | `status` | text | `pass\|warn\|fail` |
| `detail` | `detail` | longtext | evidence / explanation |
| `item-id` | `item_id` | text | references `items.item-id` |
| `severity` | `severity` | text | optional severity label |

## Settings (`kelly-legal-casebase-ingest-settings-v1`)

A single row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `firm-name` | `firm_name` | text | firm display name |
| `branch` | `branch` | text | office / branch |
| `default-jurisdictions` | `default_jurisdictions` | longtext | JSON array of jurisdictions |
| `reviewer-role` | `reviewer_role` | text | e.g. "casebase working group" |
| `allowed-document-types` | `allowed_document_types` | longtext | JSON array, e.g. `["judgment","arbitral_award"]` |
| `anonymization-standard` | `anonymization_standard` | text | e.g. "people-court-casebase-aligned" |
| `require-party-redaction` | `require_party_redaction` | text | `"true"\|"false"` |
| `require-business-secret-review` | `require_business_secret_review` | text | `"true"\|"false"` |
| `sample-rate` | `sample_rate` | number | reviewer sampling rate, 0-1 |
| `required-taxonomy-fields` | `required_taxonomy_fields` | longtext | JSON array, e.g. `["cause","court","procedure","lawyers","outcome"]` |
| `export-format` | `export_format` | text | e.g. "json+markdown+csv" |
| `export-out-dir` | `export_out_dir` | text | default `exports/case-records` |

## Decisions

A human verdict writes `status` (via `statusFromDecision()`), `decision-action`,
`decision-note`, and `decided-at` directly onto the item record; `revise`
additionally may carry an edited `draft`. There is no separate decisions
file: the item record is the single source of truth for both the draft and
its review state.

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step. Reads items with `decision-action: "approve"` or
`"request_changes"`, and with `--apply` writes `execution-status`/
`execution-operation`/`execution-target`/`execution-detail`/`executed-at`
back onto each — it never changes `status` itself (a deliberate departure
from the retired local-file `scripts/execute_decisions.ts`, which set
`status: "done"` directly). Operations:

- `export_case_record` (from `approve`) → the agent runs `scripts/export_case_records.mjs` to write the Markdown/JSON/CSV export, then hands off downstream consumption (precedent desk, firm radar) through a separate approved connector per SKILL.md's Boundary.
- `request_revision` (from `request_changes`) → the agent redrafts the record per `decision-note` and re-ingests with `scripts/ingest_documents.mjs`.

## Export (`scripts/export_case_records.mjs`)

Reads items with a genuine `decision-action: "approve"` from Busabase (not
merely `status: "approved"`, which an ingest payload could set directly
without a real human decision) and writes `approved-items.md`,
`approved-items.json`, and `approved-items.csv` to `--out` (default
`exports/` at the skill root, gitignored). Marks each exported item
`status: "done"` in Busabase; this is the only write export performs.

## Ingest Payload (`scripts/ingest_documents.mjs`)

Accepts a single item object or:

```json
{
  "entities": [{ "id": "...", "title": "required", "meta": "", "status": "", "owner": "", "summary": "", "tags": [], "metrics": {} }],
  "items": [
    {
      "id": "optional; auto-derived ref if id omitted from an existing record",
      "ref": "optional; auto-assigned Intake #<n> when absent",
      "title": "required",
      "summary": "required",
      "category": "optional",
      "status": "optional; defaults to needs_review",
      "owner": "optional",
      "risk": ["optional risk badges"],
      "recommendation": "optional",
      "draft": "optional",
      "evidence": ["optional evidence strings"],
      "fields": {
        "cause": "optional", "court": "optional", "procedure": "optional", "outcome": "optional",
        "paragraphs": ["optional"], "extraction_confidence": 0.9, "duplicate_score": 0.1,
        "ingest_bucket": "optional", "pii_cleared": true, "parties_redacted": true, "contacts_redacted": true
      }
    }
  ],
  "checks": [{ "id": "required", "label": "required", "status": "pass|warn|fail", "detail": "optional", "item_id": "optional" }]
}
```

The script validates required fields (`items[].id/title/summary`,
`entities[].id/title`, `checks[].id/label/status`) and upserts
entities/items/checks into Busabase by natural id, so re-ingests are
idempotent — mirroring the retired local importer's `upsertById()` behavior,
just against Busabase instead of a local JSON snapshot file.
