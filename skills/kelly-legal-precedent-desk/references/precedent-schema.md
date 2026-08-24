# Legal Precedent Desk Schema

Use this schema when reading or writing Legal Precedent Desk's Busabase
Bases. Field slugs are kebab-case in Busabase and normalized to snake_case
in app code (`content/kelly-legal-precedent-desk-app/app/js/providers/busabase-provider.js`,
`content/kelly-legal-precedent-desk-app/app/js/precedent-model.js`). Metrics and the recent-activity feed are
computed client-side from the `items`/`entities`/`checks` Bases on every
read (`buildSnapshot`/`assembleSnapshot` in `precedent-model.js`) — the only
persisted state is what lives directly on those four Bases.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `revise`, `block`. Like
`kelly-legal-casebase-ingest`, `kelly-legal-firm-radar`, and
`kelly-legal-matter-strategy`, `revise` maps status back to `needs_review`
(saving an edited draft/note returns the record to the queue), not
"unchanged" — see `statusFromDecision()` in `precedent-model.js` (ported
verbatim from the retired `lib/common.ts` and confirmed against the retired
`lib/data-provider/local-file-provider.ts`'s `ALLOWED_ACTIONS`).

Check results: `pass`, `warn`, `fail`.

## Items (`kelly-legal-precedent-desk-items`)

An item record is both the precedent-research workbench entry and its
review-queue item — there is no separate review-item or decisions Base.
`scripts/create_research_batch.mjs` writes the item/field columns; the
AirApp (or a human in a standalone local preview) writes the `decision-*`
fields; `scripts/execute_decisions.mjs` writes the `execution-*` fields.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable domain id, required |
| `ref` | `ref` | text | human-friendly stable reference, e.g. `Pack #1` |
| `title` | `title` | text | short title for the review row |
| `category` | `category` | text | matter category, e.g. `租赁合同纠纷` |
| `status` | `status` | text | workflow status |
| `owner` | `owner` | text | responsible lawyer |
| `risk` | `risk` | longtext | JSON array of risk badges, e.g. `["legal","confidentiality"]` |
| `summary` | `summary` | longtext | one-paragraph review summary |
| `body` | `body` | longtext | longer source-derived detail (local court tendencies) |
| `recommendation` | `recommendation` | longtext | agent recommendation for the reviewer |
| `proposed-action` | `proposed_action` | text | domain operation, usually `approve_research_pack` |
| `draft` | `draft` | longtext | editable research memo draft text |
| `evidence` | `evidence` | longtext | JSON array of short evidence strings or approved case ids with similarity |
| `query` | `query` | longtext | focused legal question or fact pattern being researched |
| `jurisdiction` | `jurisdiction` | text | target jurisdiction, court level, and any excluded forum |
| `match-count` | `match_count` | number | total similar cases considered in the pack |
| `high-match-count` | `high_match_count` | number | cases above the configured similarity or reviewer threshold |
| `top-similarity` | `top_similarity` | number | highest similarity score (0-1) in the pack |
| `avg-similarity` | `avg_similarity` | number | average similarity score (0-1) for the included pack |
| `court-pattern` | `court_pattern` | longtext | local court tendency, dissenting pattern, or "insufficient data" note |
| `citation-count` | `citation_count` | number | traceable internal citations or approved public citations included |
| `decision-action` | `decision_action` | text | `approve\|request_changes\|revise\|block` |
| `decision-note` | `decision_note` | longtext | reviewer's review note |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent`, written by `execute_decisions.mjs` |
| `execution-operation` | `execution_operation` | text | `export_research_pack\|request_revision` |
| `execution-target` | `execution_target` | text | export path (`export_research_pack`) or `item-id` (`request_revision`) |
| `execution-detail` | `execution_detail` | longtext | human-readable next step |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Entities (`kelly-legal-precedent-desk-entities`)

Issue clusters, court-pattern groups, or precedent collections, not raw case documents.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `entity-id` | `entity_id` | text | stable domain id, required |
| `title` | `title` | text | display name |
| `meta` | `meta` | text | short meta line, e.g. case count · jurisdiction |
| `status` | `status` | text | rollup status |
| `owner` | `owner` | text | responsible practice group |
| `summary` | `summary` | longtext | one-paragraph summary |
| `tags` | `tags` | longtext | JSON array of tags |
| `metrics` | `metrics` | longtext | JSON object, e.g. `{"case_count":4,"avg_similarity":0.81,"citation_count":9}` |

## Checks (`kelly-legal-precedent-desk-checks`)

Deterministic precedent QA checks for citation traceability, similarity
rationale, jurisdiction fit, and confidentiality limits.
`scripts/create_research_batch.mjs` upserts these alongside items/entities
as part of the agent's payload.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `check-id` | `check_id` | text | stable domain id, required |
| `label` | `label` | text | short check name |
| `status` | `status` | text | `pass\|warn\|fail` |
| `detail` | `detail` | longtext | evidence / explanation |
| `item-id` | `item_id` | text | references `items.item-id` |
| `severity` | `severity` | text | optional severity label |

## Settings (`kelly-legal-precedent-desk-settings`)

A single row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `firm-name` | `firm_name` | text | firm display name |
| `branch` | `branch` | text | office / branch |
| `default-jurisdictions` | `default_jurisdictions` | longtext | JSON array of jurisdictions |
| `reviewer-role` | `reviewer_role` | text | e.g. "responsible lawyer" |
| `default-jurisdiction` | `default_jurisdiction` | text | default search jurisdiction |
| `minimum-similarity-score` | `minimum_similarity_score` | number | minimum similarity score (0-1) for a case to be considered a match |
| `require-source-case-ids` | `require_source_case_ids` | text | `"true"\|"false"` |
| `quote-limit-words` | `quote_limit_words` | number | maximum words per quoted case snippet |
| `export-format` | `export_format` | text | e.g. "markdown+json" |
| `export-out-dir` | `export_out_dir` | text | default `exports/research-packs` |

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
`item.status = nextStatus` directly on `--apply`, e.g. straight to
`"approved"` for an "approve" decision). Operations:

- `export_research_pack` (from `approve`) → the agent runs `scripts/export_research_pack.mjs` to write the Markdown/JSON/CSV export. Client advice, filings, and public citation remain a separate explicit approval, never this script.
- `request_revision` (from `request_changes`) → the agent strengthens the research pack per `decision-note` and re-imports with `scripts/create_research_batch.mjs`.

## Export (`scripts/export_research_pack.mjs`)

Reads items with a genuine `decision-action: "approve"` from Busabase (not
merely `status: "approved"`, which an import payload could set directly
without a real human decision) and writes `approved-items.md`,
`approved-items.json`, and `approved-items.csv` to `--out` (default
`exports/` at the skill root, gitignored). Marks each exported item
`status: "done"` in Busabase; this is the only write export performs.

## Payload Import (`scripts/create_research_batch.mjs`)

Accepts a single item object or:

```json
{
  "entities": [{ "id": "...", "title": "required", "meta": "", "status": "", "owner": "", "summary": "", "tags": [], "metrics": {} }],
  "items": [
    {
      "id": "optional; auto-derived ref if id omitted from an existing record",
      "ref": "optional; auto-assigned Pack #<n> when absent",
      "title": "required",
      "summary": "required",
      "category": "optional",
      "status": "optional; defaults to needs_review",
      "owner": "optional",
      "risk": ["optional risk badges"],
      "recommendation": "optional",
      "draft": "optional",
      "evidence": ["optional evidence strings or approved case ids with similarity"],
      "fields": {
        "query": "optional", "jurisdiction": "optional",
        "match_count": 4, "high_match_count": 3,
        "top_similarity": 0.86, "avg_similarity": 0.81,
        "court_pattern": "optional", "citation_count": 9
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

## Business Gates

- Block export when citation traceability is missing, the jurisdiction fit is wrong, confidential facts leak, or findings imply a guaranteed result.
- Request changes when the similarity rationale is conclusory, local court-pattern caveats are missing, or the pack has too few comparable cases.
- Mark approved/done packs as inputs for matter strategy only; external citation, client advice, and filing language require separate lawyer approval.
