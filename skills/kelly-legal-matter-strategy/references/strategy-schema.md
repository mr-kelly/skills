# Legal Matter Strategy Schema

Use this schema when reading or writing Legal Matter Strategy's Busabase
Bases. Field slugs are kebab-case in Busabase and normalized to snake_case
in app code (`content/kelly-legal-matter-strategy-app/app/js/providers/busabase-provider.js`,
`content/kelly-legal-matter-strategy-app/app/js/matter-strategy-model.js`). Metrics and the recent-activity feed
are computed client-side from the `items`/`entities`/`checks` Bases on every
read (`buildSnapshot`/`assembleSnapshot` in `matter-strategy-model.js`) — the
only persisted state is what lives directly on those four Bases.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `revise`, `block`. Like
`kelly-legal-casebase-ingest` and `kelly-legal-firm-radar`, `revise` maps
status back to `needs_review` (saving an edited draft/note returns the
record to the queue), not "unchanged" — see `statusFromDecision()` in
`matter-strategy-model.js` (ported verbatim from the retired `lib/common.ts`
and confirmed against the retired `lib/data-provider/local-file-provider.ts`'s
`ALLOWED_ACTIONS`).

Check results: `pass`, `warn`, `fail`.

## Items (`kelly-legal-matter-strategy-items`)

An item record is both the matter-strategy workbench entry and its
review-queue item — there is no separate review-item or decisions Base.
`scripts/create_strategy_batch.mjs` writes the item/field columns; the
AirApp (or a human in a standalone local preview) writes the `decision-*`
fields; `scripts/execute_decisions.mjs` writes the `execution-*` fields.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable domain id, required |
| `ref` | `ref` | text | human-friendly stable reference, e.g. `Strategy #1` |
| `title` | `title` | text | short title for the review row |
| `category` | `category` | text | matter category, e.g. `合同纠纷` |
| `status` | `status` | text | workflow status |
| `owner` | `owner` | text | responsible lawyer |
| `risk` | `risk` | longtext | JSON array of risk badges, e.g. `["legal","deadline"]` |
| `summary` | `summary` | longtext | one-paragraph review summary |
| `body` | `body` | longtext | longer source-derived detail (issues, disputed facts) |
| `recommendation` | `recommendation` | longtext | agent recommendation for the reviewer |
| `proposed-action` | `proposed_action` | text | domain operation, usually `approve_strategy_pack` |
| `draft` | `draft` | longtext | editable strategy draft text |
| `evidence` | `evidence` | longtext | JSON array of short evidence strings or approved precedent-pack refs |
| `matter-stage` | `matter_stage` | text | procedural stage, e.g. pre-suit, first instance, arbitration, enforcement, appeal |
| `evidence-gap-count` | `evidence_gap_count` | number | count of unresolved evidence gaps |
| `evidence-gaps-list` | `evidence_gaps_list` | longtext | JSON array of specific missing documents, witness points, or proof problems |
| `issue-tree` | `issue_tree` | longtext | JSON array of `{label, children}` nodes: main claims, defenses, burden points |
| `negotiation-options` | `negotiation_options` | longtext | JSON array of settlement/mediation/litigation-path options |
| `posture` | `posture` | longtext | risk posture such as assertive, balanced, defensive, or information-needed |
| `pleading-outline` | `pleading_outline` | longtext | drafting sections or memo outline to hand off after approval |
| `deadline` | `deadline` | text | critical date, time window, or caveat; never infer without a source |
| `decision-action` | `decision_action` | text | `approve\|request_changes\|revise\|block` |
| `decision-note` | `decision_note` | longtext | reviewer's review note |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent`, written by `execute_decisions.mjs` |
| `execution-operation` | `execution_operation` | text | `export_strategy_pack\|request_revision` |
| `execution-target` | `execution_target` | text | export path (`export_strategy_pack`) or `item-id` (`request_revision`) |
| `execution-detail` | `execution_detail` | longtext | human-readable next step |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Entities (`kelly-legal-matter-strategy-entities`)

Matter families, issue clusters, or strategy lanes, not raw case documents.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `entity-id` | `entity_id` | text | stable domain id, required |
| `title` | `title` | text | display name |
| `meta` | `meta` | text | short meta line, e.g. stage · jurisdiction · cause |
| `status` | `status` | text | rollup status |
| `owner` | `owner` | text | responsible lawyer or team |
| `summary` | `summary` | longtext | one-paragraph summary |
| `tags` | `tags` | longtext | JSON array of tags |
| `metrics` | `metrics` | longtext | JSON object, e.g. `{"evidence_gaps":2,"issue_count":3,"option_count":3}` |

## Checks (`kelly-legal-matter-strategy-checks`)

Deterministic strategy QA checks for missing facts, evidence gaps, deadline
caveats, precedent grounding, and unsupported legal positions.
`scripts/create_strategy_batch.mjs` upserts these alongside items/entities as
part of the agent's payload.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `check-id` | `check_id` | text | stable domain id, required |
| `label` | `label` | text | short check name |
| `status` | `status` | text | `pass\|warn\|fail` |
| `detail` | `detail` | longtext | evidence / explanation |
| `item-id` | `item_id` | text | references `items.item-id` |
| `severity` | `severity` | text | optional severity label |

## Settings (`kelly-legal-matter-strategy-settings`)

A single row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `firm-name` | `firm_name` | text | firm display name |
| `branch` | `branch` | text | office / branch |
| `default-jurisdictions` | `default_jurisdictions` | longtext | JSON array of jurisdictions |
| `reviewer-role` | `reviewer_role` | text | e.g. "responsible partner" |
| `require-precedent-links` | `require_precedent_links` | text | `"true"\|"false"` |
| `require-evidence-map` | `require_evidence_map` | text | `"true"\|"false"` |
| `default-risk-scale` | `default_risk_scale` | longtext | JSON array, e.g. `["low","medium","high","critical"]` |
| `approval-required-for-client-facing` | `approval_required_for_client_facing` | text | `"true"\|"false"` |
| `templates-enabled` | `templates_enabled` | longtext | JSON array, e.g. `["litigation_claim","defense","arbitration","legal_opinion"]` |
| `export-format` | `export_format` | text | e.g. "markdown+json" |
| `export-out-dir` | `export_out_dir` | text | default `exports/strategy-packs` |

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

- `export_strategy_pack` (from `approve`) → the agent runs `scripts/export_strategy_pack.mjs` to write the Markdown/JSON/CSV export. Filing, sending, and client advice remain a separate explicit approval, never this script.
- `request_revision` (from `request_changes`) → the agent redrafts the strategy per `decision-note` and re-imports with `scripts/create_strategy_batch.mjs`.

## Export (`scripts/export_strategy_pack.mjs`)

Reads items with a genuine `decision-action: "approve"` from Busabase (not
merely `status: "approved"`, which an import payload could set directly
without a real human decision) and writes `approved-items.md`,
`approved-items.json`, and `approved-items.csv` to `--out` (default
`exports/` at the skill root, gitignored). Marks each exported item
`status: "done"` in Busabase; this is the only write export performs.

## Payload Import (`scripts/create_strategy_batch.mjs`)

Accepts a single item object or:

```json
{
  "entities": [{ "id": "...", "title": "required", "meta": "", "status": "", "owner": "", "summary": "", "tags": [], "metrics": {} }],
  "items": [
    {
      "id": "optional; auto-derived ref if id omitted from an existing record",
      "ref": "optional; auto-assigned Strategy #<n> when absent",
      "title": "required",
      "summary": "required",
      "category": "optional",
      "status": "optional; defaults to needs_review",
      "owner": "optional",
      "risk": ["optional risk badges"],
      "recommendation": "optional",
      "draft": "optional",
      "evidence": ["optional evidence strings or precedent-pack refs"],
      "fields": {
        "matter_stage": "optional", "evidence_gap_count": 2, "evidence_gaps_list": ["optional"],
        "issue_tree": [{ "label": "optional", "children": ["optional"] }],
        "negotiation_options": ["optional"], "posture": "optional",
        "pleading_outline": "optional", "deadline": "optional"
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

- Block or request changes when the client objective, procedural posture, deadline, jurisdiction, evidence inventory, or assumptions are missing.
- Do not approve strategy that hides evidence gaps, relies on unapproved precedent, treats assumptions as facts, or phrases draft text as client advice before lawyer review.
- Export only approved or done packs with issue tree, evidence map, risk posture, options, deadline caveats, and use limits for downstream drafting.
