# Kelly Legal Contracts Schema

Use this schema when reading or writing Kelly Legal Contracts's Busabase
Bases. Field slugs are kebab-case in Busabase and normalized to snake_case in
app code (`app/app/js/providers/busabase-provider.js`,
`app/app/js/contracts-model.js`). Risk checks, per-issue risk scores,
review-item content, the recent-activity feed, and metrics are all computed
client-side from the `contracts`/`issues`/`checks`/`claims`/`claim_rules`/
`settings` Bases on every read (`buildSnapshot`/`assembleSnapshot` in
`contracts-model.js`) — the only persisted state is what lives directly on
those six Bases.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `revise`.

Contract sources: `manual`, `agent_import`.

Workstreams (`platform`): `nda`, `msa`, `dpa`, `sow` — legacy aliases
`amazon`, `shopify`, `tiktok_shop`, `ebay` are also accepted by the risk
engine (ported verbatim from a shared marketplace-copy rule engine) and
display as NDA/MSA/DPA/SOW respectively.

Check results: `pass`, `warn`, `fail`.

## Contracts (`kelly-legal-contracts-contracts-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `contract-id` | `contract_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-Base row number so the reviewer can say "Contract #2" |
| `name` | `name` | text | contract display name |
| `sku` | `sku` | text | counterparty name |
| `category` | `category` | text | matter type |
| `source` | `source` | text | `manual\|agent_import` |
| `platforms` | `platforms` | longtext | JSON array of workstreams, e.g. `["nda"]` |
| `locales` | `locales` | longtext | JSON array of jurisdictions, e.g. `["US","UK"]` |
| `specs` | `specs` | longtext | JSON array of `{name, value}` contract facts (governing law, deal owner, target date, …) |
| `features` | `features` | longtext | JSON array of key obligations |
| `keywords` | `keywords` | longtext | JSON array of watch terms (used by the `keyword_stuffing` check) |
| `images` | `images` | longtext | JSON array of `{name, status}` required documents (`ready\|missing\|needs_edit`) |
| `notes` | `notes` | longtext | freeform legal intake note |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Issues (`kelly-legal-contracts-issues-v1`)

An issue record is both the clause issue and its review-queue item — there
is no separate review-item or decisions Base. `scripts/ingest_contracts.mjs`
writes the issue/field columns; `scripts/run_checks.mjs` writes
`compliance-score`; the AirApp (or a human in a standalone local preview)
writes the `decision-*` fields; `scripts/execute_decisions.mjs` writes the
`execution-*` fields. The workstream-specific field shape (see
`PLATFORM_FIELD_SHAPES` in `contracts-model.js`) determines which of
`title`/`subtitle`/`bullets`/`description`/`search-terms`/`seo-title`/
`seo-description`/`selling-points`/`aplus-outline`/`item-specifics` are
populated for a given issue:

- `nda`: `title`, `bullets` (risk notes), `description` (fallback language), `search-terms` (negotiation notes), `aplus-outline` (redline/memo outline).
- `msa`: `title`, `description` (fallback language), `seo-title`/`seo-description` (memo title/summary).
- `dpa`: `title`, `selling-points` (business ask).
- `sow`: `title`, `subtitle` (short issue), `description` (fallback language), `item-specifics` (structured facts).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `issue-id` | `issue_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-Base row number so the reviewer can say "Issue #2" |
| `contract-id` | `contract_id` | text | references `contracts.contract-id` |
| `platform` | `platform` | text | workstream, `nda\|msa\|dpa\|sow` |
| `locale` | `locale` | text | jurisdiction |
| `variant-group` | `variant_group` | text | groups jurisdiction variants of the same issue for the locale-tabs UI |
| `status` | `status` | text | workflow status |
| `compliance-score` | `compliance_score` | number | `round(points/total*100)`, POINTS = pass 1 / warn 0.5 / fail 0 |
| `keyword-strategy` | `keyword_strategy` | longtext | reviewer rationale drafted by the agent |
| `title` | `title` | text | issue title |
| `subtitle` | `subtitle` | text | short issue (sow) |
| `bullets` | `bullets` | longtext | JSON array of risk notes (nda) |
| `description` | `description` | longtext | recommended fallback language (nda/msa/sow) |
| `search-terms` | `search_terms` | longtext | negotiation notes (nda) |
| `seo-title` | `seo_title` | text | memo title (msa) |
| `seo-description` | `seo_description` | longtext | memo summary (msa) |
| `selling-points` | `selling_points` | longtext | JSON array, business ask (dpa) |
| `aplus-outline` | `aplus_outline` | longtext | JSON array, redline/memo outline (nda) |
| `item-specifics` | `item_specifics` | longtext | JSON array of `{name, value}` structured facts (sow) |
| `compliance-summary` | `compliance_summary` | longtext | one-line risk summary for the review queue |
| `suggestions` | `suggestions` | longtext | JSON array of agent suggestions |
| `decision-action` | `decision_action` | text | `approve\|request_changes\|block\|revise` |
| `decision-note` | `decision_note` | longtext | reviewer's review note / legal audit trail |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent`, written by `execute_decisions.mjs` |
| `execution-operation` | `execution_operation` | text | `export_issue_list\|request_revision` |
| `execution-target` | `execution_target` | text | export path (`export_issue_list`) or `issue-id` (`request_revision`) |
| `execution-detail` | `execution_detail` | longtext | human-readable next step |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Checks (`kelly-legal-contracts-checks-v1`)

One row per issue × risk rule, keyed by `check-id = chk-<issue without
"d-" prefix>-<rule-id>`. `scripts/run_checks.mjs` upserts every row.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `check-id` | `check_id` | text | `chk-<issue>-<rule>`, required |
| `issue-id` | `issue_id` | text | references `issues.issue-id` |
| `rule-id` | `rule_id` | text | see Risk Rules below |
| `severity` | `severity` | text | `error\|warning` |
| `result` | `result` | text | `pass\|warn\|fail` |
| `evidence` | `evidence` | longtext | short evidence snippet |
| `ref-rules` | `ref_rules` | longtext | JSON array of `claim_rules.rule-id` tripped by `claims_registry` |
| `ref-claims` | `ref_claims` | longtext | JSON array of `claims.claim-id` referenced by `claims_registry` |
| `checked-at` | `checked_at` | text | ISO timestamp |

## Claims (`kelly-legal-contracts-claims-v1`)

Approved fallback clauses or rejected positions, referenced by the
`claims_registry` check.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `claim-id` | `claim_id` | text | stable domain id, required |
| `text` | `text` | longtext | clause / position text, matched against the issue's field corpus |
| `status` | `status` | text | `approved\|pending\|rejected` |
| `category` | `category` | text | e.g. Confidentiality, Liability, Indemnity |
| `substantiation` | `substantiation` | longtext | when this fallback is approved for use |
| `evidence` | `evidence` | longtext | JSON array of source references |
| `approved-by` | `approved_by` | text | |
| `approved-at` | `approved_at` | text | ISO timestamp |
| `notes` | `notes` | longtext | e.g. why a claim was rejected |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Claim Rules (`kelly-legal-contracts-claim-rules-v1`)

Hard-stop / restricted-phrase rules, referenced by the `claims_registry`
check.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `rule-id` | `rule_id` | text | stable domain id, required |
| `phrase` | `phrase` | text | term matched against the issue's field corpus |
| `type` | `type` | text | `banned_word\|restricted_phrase` |
| `severity` | `severity` | text | `error\|warning` |
| `reason` | `reason` | longtext | why the term matters |
| `alternative` | `alternative` | longtext | suggested fallback language |
| `created-at` | `created_at` | text | ISO timestamp |

## Settings (`kelly-legal-contracts-settings-v1`)

A single row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `seller-brand` | `seller_brand` | text | company / legal ops brand |
| `seller-entity` | `seller_entity` | text | legal entity name |
| `seller-tone` | `seller_tone` | text | review style, e.g. "risk-ranked, business-friendly" |
| `locales` | `locales` | longtext | JSON array of jurisdictions in scope |
| `platforms` | `platforms` | longtext | JSON array of `{platform, enabled, locales, rules}` per-workstream rule sets |
| `banned-words` | `banned_words` | longtext | JSON array of hard-stop terms |
| `competitor-brands` | `competitor_brands` | longtext | JSON array of restricted positions / competitor standard-paper phrases |
| `keyword-stuffing-max-repeats` | `keyword_stuffing_max_repeats` | number | default 3 |
| `allowed-all-caps` | `allowed_all_caps` | longtext | JSON array of allowed all-caps terms (e.g. `NDA`, `GDPR`) |
| `export-format` | `export_format` | text | `markdown+csv` |
| `export-out-dir` | `export_out_dir` | text | default `exports` |
| `publish-handoff-to-agent` | `publish_handoff_to_agent` | text | `"true"\|"false"` |
| `publish-requires-approval` | `publish_requires_approval` | text | `"true"\|"false"` |

## Risk Rules

Evaluated by `evaluateIssue()` in `contracts-model.js` (same logic in the
AirApp's demo provider and `scripts/run_checks.mjs`), ported verbatim from
the retired `app/server/rules.ts`:

- `required_fields` — every field in the workstream's `default_required` list (or `platforms[].rules.required_fields` override) must be present.
- `title_length` — the issue title must not exceed the workstream's character cap (`platforms[].rules.title_max_chars`, default per workstream).
- `banned_words` — none of `banned-words` (plus `platforms[].rules.extra_banned_words`) may appear in the field corpus (word-boundary match for ASCII terms).
- `competitor_brands` — none of `competitor-brands` (restricted positions) may appear in the field corpus.
- `bullet_count` (nda only) — exactly `platforms[].rules.bullets_exact` (default 5) risk notes.
- `search_terms_bytes` (nda only) — negotiation notes must not exceed `platforms[].rules.search_terms_max_bytes` (default 249) UTF-8 bytes.
- `selling_points_count` (dpa only) — at least `platforms[].rules.min_selling_points` (default 3) business-ask items.
- `seo_meta_length` (msa only) — memo title/summary within `seo_title_max_chars`/`seo_description_max_chars` (defaults 60/160); a 5/10-char overage warns, further over fails.
- `all_caps_words` — flags ASCII all-caps words of 3+ letters not in `allowed-all-caps` (or the built-in default list).
- `keyword_stuffing` — flags a contract watch term (`contracts.keywords`) repeated beyond `keyword-stuffing-max-repeats` in the visible field corpus.
- `image_checklist` — every entry in the contract's `images` (required-document checklist) must be `ready`.
- `claims_registry` — flags a `claim_rules` hard-stop/restricted phrase, or a non-approved (`pending`/`rejected`) `claims` position, referenced in the field corpus; empty playbook passes trivially.

## Decisions

A human verdict writes `status` (via `statusForVerdict()`), `decision-action`,
`decision-note`, and `decided-at` directly onto the issue record —
`revise` additionally carries edited field values from the issue workbench
but never changes `status`. There is no separate decisions file: the issue
record is the single source of truth for both the draft and its review
state.

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step. Reads issues with `decision-action: "approve"` or
`"request_changes"`, and with `--apply` writes `execution-status`/
`execution-operation`/`execution-target`/`execution-detail`/`executed-at`
back onto each — it never changes `status` itself. Operations:

- `export_issue_list` (from `approve`) → the agent runs `scripts/export_issues.mjs` to write the Markdown issue memo, then hands off external redline delivery or counsel communication through the user or a separate approved connector per SKILL.md's Boundary.
- `request_revision` (from `request_changes`) → the agent redrafts the issue per `decision-note`, re-ingests with `scripts/ingest_contracts.mjs`, and re-runs `scripts/run_checks.mjs`.

## Export (`scripts/export_issues.mjs`)

Reads issues with a genuine `decision-action: "approve"` from Busabase (not
merely `status: "approved"`, which an ingest payload could set directly
without a real human decision) and writes one Markdown issue memo per issue
plus `issues.csv` to `--out` (default `exports/` at the skill root,
gitignored): a metadata table (company/contract/counterparty/workstream/
jurisdiction/risk score) followed by short issue, risk notes, business ask,
recommended fallback, negotiation notes, memo, structured facts, and
redline/memo outline — whichever sections are non-empty. Marks each exported
issue `status: "done"` in Busabase; this is the only write export performs.

## Ingest Payload (`scripts/ingest_contracts.mjs`)

Accepts a single issue object or:

```json
{
  "contracts": [
    {
      "contract_id": "optional; derived from name when absent",
      "name": "required",
      "sku": "required (counterparty)",
      "category": "optional matter type",
      "source": "manual|agent_import",
      "platforms": ["nda"],
      "locales": ["US"],
      "specs": [{ "name": "Governing law", "value": "California" }],
      "features": ["Mutual confidentiality"],
      "keywords": ["residuals", "purpose limitation"],
      "images": [{ "name": "Counterparty redline", "status": "ready|missing|needs_edit" }],
      "notes": "optional legal intake note"
    }
  ],
  "issues": [
    {
      "issue_id": "optional; derived from contract+platform+locale when absent",
      "contract": "contract name or counterparty (or contract_id)",
      "platform": "nda|msa|dpa|sow",
      "locale": "US|UK|EU",
      "status": "optional; defaults to needs_review",
      "keyword_strategy": "optional reviewer rationale",
      "fields": { "workstream-specific field shape — see the Issues section above" },
      "compliance_summary": "optional review-item summary",
      "suggestions": ["optional review-item suggestions"]
    }
  ]
}
```

A new contract (matched by `contract_id`, or by name/counterparty label)
is created on the fly in the `contracts` Base, mirroring the retired local
importer's on-the-fly contract creation.
