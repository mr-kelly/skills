# Kelly Radar Schema

Use this schema when reading or writing Kelly Radar's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`app/app/js/providers/busabase-provider.js`, `app/app/js/radar-model.js`).
`signals_7d` per watchlist target, the brief→question status join, and every
metric are computed client-side from the live rows on every read — they are
never stored twice.

Signal triage actions: `approve`, `watch`, `ignore`, `block` (maps to
`approved|needs_review|done|blocked`).

Brief decision actions: `approve`, `request_changes`, `block` (maps to
`approved|changes_requested|blocked`).

Opportunity decision actions: `approve`, `ignore` (maps to `approved|done`).

Report action: `approve` — a 0-5 confidence rating, no status change.

## Watchlist (`kelly-radar-watchlist-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `target-id` | `target_id` | text | stable domain id, required |
| `name` | `name` | text | |
| `type` | `type` | text | `competitor\|category\|keyword\|community` |
| `status` | `status` | text | `ok\|warning\|stale\|paused` |
| `notes` | `notes` | longtext | why this target is watched |
| `last-check-at` | `last_check_at` | text | ISO timestamp |
| `sources` | `sources` | longtext | JSON array: `[{source_id, kind, url, method, last_check_at, last_change_at}]` |

`signals_7d` is not stored — it is computed at read time by counting
`signals` rows for the target detected within the last 7 days. Use `stale`
when `last_check_at` is older than the configured cadence; `paused` targets
are kept but skipped by monitoring runs.

## Signals (`kelly-radar-signals-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `signal-id` | `signal_id` | text | stable domain id, required |
| `target-id` | `target_id` | text | watchlist target id |
| `source-id` | `source_id` | text | source id on that target |
| `source-kind` | `source_kind` | text | `pricing\|changelog\|landing\|launch\|reviews\|news\|hiring\|community` |
| `severity` | `severity` | text | `high\|medium\|low` |
| `detected-at` | `detected_at` | text | ISO timestamp |
| `status` | `status` | text | `needs_review\|changes_requested\|approved\|done\|blocked` |
| `headline` | `headline` | text | |
| `summary` | `summary` | longtext | what changed, in 1-3 sentences |
| `why-it-matters` | `why_it_matters` | longtext | agent's note on relevance and suggested angle |
| `content-hash` | `content_hash` | text | sha256 of target_id+source_id+headline+summary+diff text — the dedupe key |
| `evidence` | `evidence` | longtext | JSON array: `[{title, url}]` |
| `proposed-action` | `proposed_action` | text | `act\|watch\|ignore\|needs_info` |
| `handoff` | `handoff` | longtext | optional JSON: `{operation, target, summary}` |
| `diff` | `diff` | longtext | optional JSON: `{before_label, after_label, lines: [{type, text}]}` |
| `decision-verdict` | `decision_verdict` | text | written with the verdict |
| `decision-comment` | `decision_comment` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |

`handoff` and `diff` are optional. `scripts/ingest_signals.mjs` skips
payload signals whose `content_hash` already exists.

## Research Questions (`kelly-radar-questions-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `question-id` | `question_id` | text | stable domain id, required |
| `question` | `question` | text | |
| `status` | `status` | text | `brief_needs_review\|researching\|report_ready\|annotated\|closed` — derived client-side from the linked brief while still `brief_needs_review` |
| `asked-at` | `asked_at` | text | ISO timestamp |
| `depth` | `depth` | text | `quick\|standard\|deep` |
| `cost-note` | `cost_note` | longtext | rough effort estimate |
| `brief-id` | `brief_id` | text | linked brief id or empty |
| `report-id` | `report_id` | text | linked report id or empty |
| `confidence` | `confidence` | number | mirrors the linked report's confidence once rated |
| `followups` | `followups` | longtext | JSON array: `[{followup_id, question, status, asked_at}]` — appended by the app's follow-up box |

## Research Briefs (`kelly-radar-briefs-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `brief-id` | `brief_id` | text | stable domain id, required |
| `question-id` | `question_id` | text | |
| `status` | `status` | text | `needs_review\|approved\|changes_requested\|blocked` |
| `drafted-at` | `drafted_at` | text | ISO timestamp |
| `depth` | `depth` | text | `quick\|standard\|deep` |
| `scope` | `scope` | longtext | what is in and out of scope |
| `planned-sources` | `planned_sources` | longtext | JSON array of source descriptions |
| `expected-deliverable` | `expected_deliverable` | longtext | what the report will contain |
| `notes` | `notes` | longtext | optional |
| `decision-verdict` | `decision_verdict` | text | written with the verdict |
| `decision-comment` | `decision_comment` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |

The agent drafts the brief first; research starts only after Kelly approves
it. An approved brief moves its linked question to `researching`; a blocked
brief closes the question — both derived client-side, never written back
onto the question record.

## Research Reports (`kelly-radar-reports-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `report-id` | `report_id` | text | stable domain id, required |
| `question-id` | `question_id` | text | |
| `title` | `title` | text | |
| `filed-at` | `filed_at` | text | ISO timestamp |
| `summary` | `summary` | longtext | executive summary |
| `confidence` | `confidence` | number | Kelly's 0-5 rating, set through the app |
| `sections` | `sections` | longtext | JSON array: `[{section_id, heading, body, source_ids}]` |
| `sources` | `sources` | longtext | JSON array: `[{source_id, title, url, accessed_at}]` |
| `annotations` | `annotations` | longtext | JSON array: `[{annotation_id, author, at, section_id, text}]` |
| `decided-at` | `decided_at` | text | last confidence-rating timestamp |

Citation rule enforced by `scripts/file_report.mjs`: every `sections[].source_ids`
entry must resolve to a `sources[].source_id`, and every source needs a
non-empty `title` and `url`.

## Trend Movers (`kelly-radar-movers-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `mover-id` | `mover_id` | text | stable domain id, required |
| `keyword` | `keyword` | text | |
| `source` | `source` | text | `search\|community\|category` |
| `volume-proxy` | `volume_proxy` | number | relative measure (search volume estimate, upvotes, mentions), not absolute truth |
| `delta-pct` | `delta_pct` | number | |
| `momentum` | `momentum` | longtext | JSON array of numbers, oldest first, for the sparkline |
| `first-seen` | `first_seen` | text | `YYYY-MM-DD` |
| `last-updated` | `last_updated` | text | ISO timestamp |
| `opportunity-id` | `opportunity_id` | text | linked opportunity id or empty |

Dedupe key for `scripts/ingest_trends.mjs` is `keyword` + `source` (keyword
compared case-insensitively).

## Opportunities (`kelly-radar-opportunities-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `opportunity-id` | `opportunity_id` | text | stable domain id, required |
| `title` | `title` | text | |
| `mover-ids` | `mover_ids` | longtext | JSON array of linked mover ids |
| `status` | `status` | text | `needs_review\|approved\|done\|blocked` |
| `created-at` | `created_at` | text | ISO timestamp |
| `rationale` | `rationale` | longtext | why this is worth acting on now |
| `proposed-next-step` | `proposed_next_step` | longtext | JSON: `{operation, target, summary}` — `handoff_content_brief\|handoff_roadmap_candidate`, target `kelly-writer\|kelly-feedback` |
| `decision-verdict` | `decision_verdict` | text | written with the verdict |
| `decision-comment` | `decision_comment` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |

## Sync Log (`kelly-radar-sync-log-v1`)

Append-only; the app shows the most recent 50 entries sorted by `at` descending.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `log-id` | `log_id` | text | stable domain id, required |
| `at` | `at` | text | ISO timestamp |
| `actor` | `actor` | text | `kelly-radar-agent` |
| `action` | `action` | text | `ingest_signals\|ingest_trends\|file_report\|execute_decisions` |
| `detail` | `detail` | longtext | short human-readable result |

## Settings (`kelly-radar-settings-v1`)

One row, `record-id: "config"`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `products` | `products` | longtext | JSON array: `[{name, positioning}]` |
| `cadence-monitor` | `cadence_monitor` | text | default `daily` |
| `cadence-trends` | `cadence_trends` | text | default `weekly` |
| `research-default-depth` | `research_default_depth` | text | `quick\|standard\|deep`, default `standard` |
| `research-source-policy` | `research_source_policy` | text | default `public_pages_only` |
| `research-require-citations` | `research_require_citations` | text | `"true"`/`"false"` string, default true |
| `research-max-sources` | `research_max_sources` | number | default `8` |
| `trend-sources` | `trend_sources` | longtext | JSON array: `[{source_id, kind, name, method}]` |

## Decisions

A human verdict writes `status` (where applicable), `decision-verdict`,
`decision-comment`, and `decided-at` directly onto the item record. There is
no separate decisions Base: the item record is the single source of truth,
and `autoMerge` is gated by `isStandaloneLocalRuntime()` — a standalone
local preview merges immediately (trusted operator), a deployed AirApp
creates a pending ChangeRequest for the trusted process to merge.
