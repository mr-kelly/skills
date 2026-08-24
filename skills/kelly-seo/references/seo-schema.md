# Kelly SEO Schema

Use this schema when reading or writing Kelly SEO's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`content/kelly-seo-app/app/js/providers/busabase-provider.js`, `content/kelly-seo-app/app/js/seo-model.js`).
Nested/array shapes (totals, badges, top pages, trend points, grounding,
claims, mentions, warnings) are JSON-encoded into `longtext` fields; there is
no array/object field type in Busabase.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `revise`.

## Sites (`kelly-seo-sites`)

Configured Search Console properties, synced by `scripts/sync_gsc.mjs`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `site-id` | `site_id` | text | stable local id, required |
| `ref` | `ref` | number | stable row order |
| `property-url` | `property_url` | text | e.g. `https://example-product.com/` |
| `verification-type` | `verification_type` | text | `url_prefix\|domain` |
| `permission-level` | `permission_level` | text | `siteOwner\|siteFullUser\|siteRestrictedUser\|unknown` |
| `status` | `status` | text | `ok\|warning\|error\|not_configured` |
| `last-sync-at` | `last_sync_at` | text | ISO timestamp |
| `totals` | `totals` | longtext | JSON `{clicks, impressions, ctr, position}`, current 28d window |
| `previous` | `previous` | longtext | JSON, same shape, previous 28d window |
| `daily` | `daily` | longtext | JSON array of `{date, clicks, impressions, ctr, position}`, both windows |

## Queries (`kelly-seo-queries`)

Top Search Console queries (capped at 100 rows by clicks, since
`records.list` caps `limit` at 100 — see `MAX_WRITTEN_ROWS` in
`scripts/sync_gsc.mjs`).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `query-id` | `query_id` | text | `q-<site_id>-<slug-or-hash>`, required |
| `site-id` | `site_id` | text | |
| `query` | `query` | text | search query text |
| `clicks` | `clicks` | number | |
| `impressions` | `impressions` | number | |
| `ctr` | `ctr` | number | fraction, 0-1 |
| `position` | `position` | number | average position, lower is better |
| `previous` | `previous` | longtext | JSON `{clicks, impressions, ctr, position}` |
| `badges` | `badges` | longtext | JSON array, `striking_distance\|low_ctr` |
| `top-pages` | `top_pages` | longtext | JSON array of `{url, clicks, impressions, position}` |
| `trend` | `trend` | longtext | JSON array of `{date, clicks, impressions, position}` |
| `agent-notes` | `agent_notes` | longtext | optional agent analysis |

`badges` are computed by `badgesFor()` in `content/kelly-seo-app/app/js/seo-model.js`:
`striking_distance` for average position 8-15, `low_ctr` when CTR is well
below the expected curve for the position (`expectedCtr()`).

## Pages (`kelly-seo-pages`)

Top Search Console pages (same 100-row cap as Queries).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `page-id` | `page_id` | text | `p-<site_id>-<slug-or-hash>`, required |
| `site-id` | `site_id` | text | |
| `url` | `url` | text | |
| `clicks` | `clicks` | number | |
| `impressions` | `impressions` | number | |
| `ctr` | `ctr` | number | |
| `position` | `position` | number | |
| `previous` | `previous` | longtext | JSON, same shape as totals |
| `issues` | `issues` | longtext | JSON array, `canonical_mismatch\|not_indexed` |
| `top-queries` | `top_queries` | longtext | JSON array of `{query, clicks, impressions, position}` |
| `trend` | `trend` | longtext | JSON array of `{date, clicks, impressions, position}` |
| `agent-notes` | `agent_notes` | longtext | optional |

## Opportunities (`kelly-seo-opportunities`)

Agent-proposed SEO actions reviewed in `#/opportunities`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `opportunity-id` | `opportunity_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-batch number, e.g. "Opportunity #2" |
| `site-id` | `site_id` | text | |
| `type` | `type` | text | `title_meta_rewrite\|internal_links\|content_brief\|fix_page_issue` |
| `title` | `title` | text | short human-readable action title |
| `target-page` | `target_page` | text | URL or empty |
| `target-query` | `target_query` | text | query text or empty |
| `reason` | `reason` | longtext | why this action is proposed, with metric evidence |
| `expected-impact` | `expected_impact` | longtext | estimated effect |
| `draft` | `draft` | longtext | editable draft: new title/meta, link plan, or content brief |
| `status` | `status` | text | workflow status |
| `agent-notes` | `agent_notes` | longtext | optional supporting analysis |
| `created-at` | `created_at` | text | ISO timestamp |
| `decision-action` | `decision_action` | text | written with the verdict |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decision-draft` | `decision_draft` | longtext | user-edited draft override, empty if unedited |
| `decided-at` | `decided_at` | text | written with the verdict |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent\|executed\|blocked` |
| `execution-operation` | `execution_operation` | text | `rewrite_title\|add_internal_links\|create_content_brief\|fix_page_issue` |
| `execution-target` | `execution_target` | text | page URL or query |
| `execution-detail` | `execution_detail` | longtext | what was or will be done |
| `executed-at` | `executed_at` | text | ISO timestamp |

## GEO Opportunities (`kelly-seo-geo-opportunities`)

Agent-proposed GEO (Generative Engine Optimization) content optimizations
reviewed in `#/optimize`, gated by `geo-qa` (`evaluateGeoGate()` in
`content/kelly-seo-app/app/js/seo-model.js`) — recomputed live on every read from `draft` +
`claims` + `has-schema` + `has-qa-block`, never stored. The gate is a hard
gate: a `BLOCK` verdict forces the effective `status` to `blocked` regardless
of the stored `status` field, unless the change is already `executed`
(`geoEffectiveStatus()`).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `geo-opportunity-id` | `geo_opportunity_id` | text | stable domain id, required |
| `ref` | `ref` | number | |
| `type` | `type` | text | `citable_rewrite\|quotable_stats\|qa_block\|schema_markup` |
| `title` | `title` | text | |
| `target-page` | `target_page` | text | |
| `target-prompt` | `target_prompt` | text | the AI-engine question this change is meant to win |
| `reason` | `reason` | longtext | why this makes the page more citable |
| `expected-impact` | `expected_impact` | longtext | estimated effect on AI-engine citations |
| `draft` | `draft` | longtext | the proposed citable content / additions |
| `grounding` | `grounding` | longtext | JSON array of kb-style source lines |
| `claims` | `claims` | longtext | JSON array of `{text, source}` — every numeric claim must carry a source |
| `has-schema` | `has_schema` | text | `"true"\|"false"` |
| `has-qa-block` | `has_qa_block` | text | `"true"\|"false"` |
| `status` | `status` | text | workflow status (before the geo-qa override) |
| `agent-notes` | `agent_notes` | longtext | |
| `created-at` | `created_at` | text | |
| `decision-action` | `decision_action` | text | |
| `decision-note` | `decision_note` | longtext | |
| `decision-draft` | `decision_draft` | longtext | |
| `decided-at` | `decided_at` | text | |
| `execution-status` | `execution_status` | text | |
| `execution-operation` | `execution_operation` | text | `publish_geo_change` |
| `execution-target` | `execution_target` | text | |
| `execution-detail` | `execution_detail` | longtext | |
| `executed-at` | `executed_at` | text | |

Approving a GEO opportunity whose live-recomputed gate verdict is `BLOCK`
throws before any write (`busabase-provider.js`'s `decideGeoOpportunity`) —
resolve the failing checks (usually: ground the stat with a `source`, or
remove it) before it can ship.

## AI Visibility (`kelly-seo-ai-visibility`)

Tracked AI-answer-engine prompts, rendered as the `#/geo` engines × prompts
matrix. The overall score is computed live (`aiVisibilityScore()`): the
share of engine × prompt cells that mention the brand. `prev_score` (for the
delta) is not derivable from the current prompts, so it lives on the
`settings` row.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `prompt-id` | `prompt_id` | text | `geo-<slug>`, required |
| `ref` | `ref` | number | |
| `prompt` | `prompt` | text | a question a user might ask an AI engine |
| `intent` | `intent` | text | `comparison\|definition\|how-to\|alternative\|...` |
| `mentions` | `mentions` | longtext | JSON array, one entry per engine: `{engine, mentioned, position, sentiment, cited_url, note}` |
| `trend` | `trend` | longtext | JSON array of `{date, visibility}`, 0-1 share of engines mentioning the brand |

## Entity Signals (`kelly-seo-entity-signals`)

Brand-entity / knowledge-panel readiness checklist, rendered as `#/entity`.
The overall score is computed live (`entityReadinessScore()`): weights
`present`=1, `partial`=0.5, `missing`=0 across the signals.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `signal-id` | `signal_id` | text | `ent-<slug>`, required |
| `label` | `label` | text | e.g. "Wikidata entity" |
| `category` | `category` | text | `knowledge-graph\|schema\|consistency` |
| `status` | `status` | text | `present\|partial\|missing` |
| `detail` | `detail` | longtext | what was found |
| `fix` | `fix` | longtext | agent-proposed fix when partial/missing, else empty |

## Settings (`kelly-seo-settings`)

One row, looked up by `record-id: "config"`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | `"config"`, required |
| `brand` | `brand` | text | the invented/tracked brand name |
| `locale` | `locale` | text | `auto\|en\|zh` |
| `sync-window-days` | `sync_window_days` | number | GSC sync window, default 28 |
| `sync-row-limit` | `sync_row_limit` | number | GSC per-dimension row limit, default 250 |
| `sync-read-only` | `sync_read_only` | text | `"true"\|"false"`, always `"true"` — GSC access is read-only |
| `range-current-start` / `range-current-end` | `range.current.{start,end}` | text | last synced current window |
| `range-previous-start` / `range-previous-end` | `range.previous.{start,end}` | text | last synced previous window |
| `warnings` | `warnings` | longtext | JSON array of `{id, severity, message, detail}` from the last sync |
| `ai-visibility-prev-score` | `ai_visibility_prev_score` | number | AI-visibility score baseline for the delta arrow |
| `ai-visibility-engines` | `ai_visibility_engines` | longtext | JSON array, engines in display order (default `chatgpt,perplexity,gemini,claude,copilot`) |

`scripts/sync_gsc.mjs` only ever writes the sync-owned fields
(`sync-*`/`range-*`/`warnings`) onto this row, merged over the existing row —
it never touches `brand`/`locale`/`ai-visibility-*`, which are owned by the
agent's GEO workflow.

## Decisions

A human verdict writes `status`, `decision-action`, `decision-note`,
`decision-draft`, and `decided-at` directly onto the opportunity / GEO
opportunity record — there is no separate decisions file. An entity-signal
verdict writes `status` and `detail` directly onto the signal record.
`decision-draft` (when non-empty) overrides `draft` everywhere the app reads
the item.

## Sync (`scripts/sync_gsc.mjs`)

The trusted GSC-sync step. Reads site/auth config from
`config.local.json` / `KELLY_SEO_CONFIG` / `~/.config/kelly-seo/config.json`
(see `SKILL.md`), authenticates with a service-account JWT or a plain OAuth
access token (read-only `webmasters.readonly` scope), pulls Search Analytics
per site, and upserts `sites`/`queries`/`pages` plus the sync-owned
`settings` fields. It never touches `opportunities`, `geo-opportunities`,
`ai-visibility`, or `entity-signals` — those are agent-prepared, not GSC
data, and are preserved automatically since sync never writes those Bases.

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step for SEO opportunities only (GEO opportunities are
executed manually by the agent per `SKILL.md`'s GEO workflow). Reads
`opportunities` with `status: "approved"`, and with `--apply` writes
`execution-status: "ready_for_agent"` (plus `execution-operation`/
`execution-target`/`execution-detail`/`executed-at`) back onto each — never
`status: "done"` itself. It performs no external side effect: the agent
performs the approved edit in the site's repo/CMS outside this script, then
marks the opportunity `done` (writing `status` directly, same as any other
decision).

Execution semantics by `type` (`operationForOpportunity()` in
`content/kelly-seo-app/app/js/seo-model.js`):

- `title_meta_rewrite` → `rewrite_title`
- `internal_links` → `add_internal_links`
- `content_brief` → `create_content_brief`
- `fix_page_issue` → `fix_page_issue`
