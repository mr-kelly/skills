# Legal Firm Radar Schema

Use this schema when reading or writing Legal Firm Radar's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`app/app/js/providers/busabase-provider.js`,
`app/app/js/firm-radar-model.js`). Metrics and the recent-activity feed are
computed client-side from the `items`/`entities`/`checks` (and, for optional
outcome-trend display data, `settings`) Bases on every read
(`buildSnapshot`/`assembleSnapshot` in `firm-radar-model.js`) — the only
persisted state is what lives directly on those four Bases.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `revise`, `block`. Like
`kelly-legal-casebase-ingest`, `revise` maps status back to `needs_review`
(saving an edited draft/note returns the record to the queue), not
"unchanged" — see `statusFromDecision()` in `firm-radar-model.js` (ported
verbatim from the retired `lib/common.ts` and confirmed against the retired
`lib/data-provider/local-file-provider.ts`'s `ALLOWED_ACTIONS`).

Check results: `pass`, `warn`, `fail`.

## Items (`kelly-legal-firm-radar-items-v1`)

An item record is both the management-insight workbench entry and its
review-queue item — there is no separate review-item or decisions Base.
`scripts/import_metrics.mjs` writes the item/field columns; the AirApp (or a
human in a standalone local preview) writes the `decision-*` fields;
`scripts/execute_decisions.mjs` writes the `execution-*` fields.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable domain id, required |
| `ref` | `ref` | text | human-friendly stable reference, e.g. `Insight #1` |
| `title` | `title` | text | short title for the review row |
| `category` | `category` | text | insight category |
| `status` | `status` | text | workflow status |
| `owner` | `owner` | text | assigned reviewer |
| `risk` | `risk` | longtext | JSON array of risk badges, e.g. `["management","privacy"]` |
| `summary` | `summary` | longtext | one-paragraph review summary |
| `body` | `body` | longtext | longer source-derived detail |
| `recommendation` | `recommendation` | longtext | agent recommendation for the reviewer |
| `proposed-action` | `proposed_action` | text | domain operation, usually `approve_management_report` |
| `draft` | `draft` | longtext | editable output text / management report draft |
| `evidence` | `evidence` | longtext | JSON array of short evidence strings |
| `sample-size` | `sample_size` | number | number of cases, matters, or records behind the insight |
| `period` | `period` | text | reporting period and date basis |
| `visibility` | `visibility` | text | `internal_management`, `internal_then_external_review`, or a stricter local label |
| `lawyer-count` | `lawyer_count` | number | lawyers or teams represented in the sample |
| `public-citable` | `public_citable` | number | count of proof points cleared for possible external use |
| `quality-indicators` | `quality_indicators` | longtext | JSON array of timeliness/outcome-quality/reuse/documentation signals |
| `decision-action` | `decision_action` | text | `approve\|request_changes\|revise\|block` |
| `decision-note` | `decision_note` | longtext | reviewer's review note |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent`, written by `execute_decisions.mjs` |
| `execution-operation` | `execution_operation` | text | `export_management_report\|request_revision` |
| `execution-target` | `execution_target` | text | export path (`export_management_report`) or `item-id` (`request_revision`) |
| `execution-detail` | `execution_detail` | longtext | human-readable next step |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Entities (`kelly-legal-firm-radar-entities-v1`)

Practice-area groupings and lawyer capability profile cards, not raw case documents.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `entity-id` | `entity_id` | text | stable domain id, required |
| `title` | `title` | text | display name |
| `meta` | `meta` | text | short meta line, e.g. sample count · jurisdiction |
| `status` | `status` | text | rollup status |
| `owner` | `owner` | text | responsible lawyer or team |
| `summary` | `summary` | longtext | one-paragraph summary |
| `tags` | `tags` | longtext | JSON array of tags |
| `metrics` | `metrics` | longtext | JSON object, e.g. `{"case_count":42,"lawyer_count":5,"public_citable":2}` |

## Checks (`kelly-legal-firm-radar-checks-v1`)

Deterministic analytics QA checks for anonymization, sample size,
attribution, and unsupported claims. `scripts/import_metrics.mjs` upserts
these alongside items/entities as part of the agent's payload.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `check-id` | `check_id` | text | stable domain id, required |
| `label` | `label` | text | short check name |
| `status` | `status` | text | `pass\|warn\|fail` |
| `detail` | `detail` | longtext | evidence / explanation |
| `item-id` | `item_id` | text | references `items.item-id` |
| `severity` | `severity` | text | optional severity label |

## Settings (`kelly-legal-firm-radar-settings-v1`)

A single row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `firm-name` | `firm_name` | text | firm display name |
| `branch` | `branch` | text | office / branch |
| `default-jurisdictions` | `default_jurisdictions` | longtext | JSON array of jurisdictions |
| `reviewer-role` | `reviewer_role` | text | e.g. "management committee" |
| `require-anonymized-metadata` | `require_anonymized_metadata` | text | `"true"\|"false"` |
| `minimum-sample-size-for-claim` | `minimum_sample_size_for_claim` | number | minimum sample size before a claim is publishable |
| `external-brand-claims-require-approval` | `external_brand_claims_require_approval` | text | `"true"\|"false"` |
| `allowed-views` | `allowed_views` | longtext | JSON array, e.g. `["management","practice","lawyer_profile","brand_proof"]` |
| `practice-areas` | `practice_areas` | longtext | JSON array, e.g. `["民商事","公司争议","劳动","知识产权"]` |
| `outcome-trends` | `outcome_trends` | longtext | optional JSON array of `{period, win_rate}` points for the overview trend chart |
| `export-format` | `export_format` | text | e.g. "markdown+csv" |
| `export-out-dir` | `export_out_dir` | text | default `exports/management-reports` |

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
`status: "done"` directly on `--apply` for an "approve" decision). Operations:

- `export_management_report` (from `approve`) → the agent runs `scripts/export_management_report.mjs` to write the Markdown/JSON/CSV export. External brand use remains a separate explicit approval, never this script.
- `request_revision` (from `request_changes`) → the agent redrafts the insight per `decision-note` and re-imports with `scripts/import_metrics.mjs`.

## Export (`scripts/export_management_report.mjs`)

Reads items with a genuine `decision-action: "approve"` from Busabase (not
merely `status: "approved"`, which an import payload could set directly
without a real human decision) and writes `approved-items.md`,
`approved-items.json`, and `approved-items.csv` to `--out` (default
`exports/` at the skill root, gitignored). Marks each exported item
`status: "done"` in Busabase; this is the only write export performs.

## Import Payload (`scripts/import_metrics.mjs`)

Accepts a single item object or:

```json
{
  "entities": [{ "id": "...", "title": "required", "meta": "", "status": "", "owner": "", "summary": "", "tags": [], "metrics": {} }],
  "items": [
    {
      "id": "optional; auto-derived ref if id omitted from an existing record",
      "ref": "optional; auto-assigned Insight #<n> when absent",
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
        "sample_size": 18, "period": "optional", "visibility": "optional",
        "lawyer_count": 4, "public_citable": 1, "quality_indicators": ["optional"]
      }
    }
  ],
  "checks": [{ "id": "required", "label": "required", "status": "pass|warn|fail", "detail": "optional", "item_id": "optional" }]
}
```

The script validates required fields (`items[].id/title/summary`,
`entities[].id/title`, `checks[].id/label/status`) and upserts
entities/items/checks into Busabase by natural id, so re-imports are
idempotent — mirroring the retired local importer's `upsertById()` behavior,
just against Busabase instead of a local JSON snapshot file.
