# Kelly Brand Schema

Use this schema when reading or writing Kelly Brand's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`content/kelly-brand-app/app/js/providers/busabase-provider.js`, `content/kelly-brand-app/app/js/brand-model.js`).
Every metric on the overview — the aggregate NQS, canonical/needs-review
counts, and the open drift-alert count — is computed client-side from the
`items`/`drift-alerts` Bases on every read; they are never stored.

Everything is organized around the **TALE** framework — every narrative
asset carries a `phase` (`trace` / `architect` / `land` / `evaluate`) and a
`sub_skill` naming which of the 16 TALE sub-skills produced it.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions (narrative items): `approve`, `request_changes`, `block`, `revise`.
Decision actions (drift alerts): `resolve_drift`, `dismiss_drift`.

## Items (`kelly-brand-items`)

Items are the review-queue rows — every narrative asset across all six
`type`s. `status` uses the standard workflow states; `approved` means
**adopted into the canonical narrative** ("Canonical" in the UI).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-batch row number; never renumber on regeneration |
| `type` | `type` | text | `positioning\|message_pillar\|story\|proof_point\|vocabulary\|guardrail` |
| `phase` | `phase` | text | `trace\|architect\|land\|evaluate` |
| `sub-skill` | `sub_skill` | text | one of the 16 TALE sub-skills, e.g. `message-system-architect` |
| `title` | `title` | text | human-readable title |
| `draft` | `draft` | longtext | editable body — the pillar statement, the customer story, the vocab list, etc. |
| `reason` | `reason` | longtext | why the agent drafted this / what to check |
| `nqs-score` | `nqs_score` | number | 0–100, set by the narrative-quality-auditor; absent until scored |
| `nqs-gate` | `nqs_gate` | text | `SHIP\|FIX\|BLOCK`, the auditor's own judgment — stored as-is, not recomputed |
| `evidence-source` | `evidence_source` | text | named source; proof points only |
| `evidence-stat` | `evidence_stat` | text | the supporting statistic |
| `evidence-url` | `evidence_url` | text | optional source link |
| `risk` | `risk` | text | JSON array, e.g. `["claim"]` |
| `status` | `status` | text | workflow status |
| `created-at` | `created_at` | text | ISO timestamp |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |

A proof point with no `evidence-source` is `blocked` by the NQS gate; do not
adopt or publish it. `ref` lets chat comments like "adopt #2" resolve
unambiguously — never renumber refs when regenerating, retire ids instead.

## Drift Alerts (`kelly-brand-drift-alerts`)

Cross-channel off-brand usage flagged by the narrative-drift-monitor.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `alert-id` | `alert_id` | text | stable domain id, required |
| `channel-id` | `channel_id` | text | configured channel id, e.g. `website` |
| `title` | `title` | text | short human-readable summary |
| `offending-usage` | `offending_usage` | longtext | the off-brand copy as it appears on the channel |
| `guardrail-item-id` | `guardrail_item_id` | text | the canonical guardrail/vocab item it violates (an `items` row) |
| `canonical-guidance` | `canonical_guidance` | longtext | what the canonical narrative says to do instead |
| `status` | `status` | text | `open\|resolved\|dismissed` |
| `severity` | `severity` | text | `high\|medium\|low` |
| `detected-at` | `detected_at` | text | ISO timestamp |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |

## Settings (`kelly-brand-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `kelly-brand-profile` | `profile` | `{brand: {name, category, audience, mission, framework}, style: {tone, reading_level, language}, official_urls: {homepage, about, ...}, risk_policy: {banned_phrases, regulated_claims}, channels: [{channel_id, type, display_name, monitored, secrets_ready}]}` |
| `kelly-brand-lock` | `lock` | not JSON-wrapped: fields `locked` (bool), `owner`, `message` live directly on the row |

While the lock row has `locked: true` the app rejects decision writes and
renders the workbench read-only.

## Decisions

A human verdict writes `status`, `decision-note`, and `decided-at` directly
onto the record — approving an edited narrative draft also writes the new
`draft`. There is no separate decisions file: the record is the single
source of truth for both the draft/copy and its review state.

- Narrative item verdicts (`approve`/`request_changes`/`block`/`revise`) write onto the matching `items` row (looked up by `item-id`).
- Drift verdicts (`resolve_drift`/`dismiss_drift`) write onto the matching `drift-alerts` row (looked up by `alert-id`).

## Metrics (computed, never stored)

- `metrics.overall_nqs`: `Math.round(mean(nqs-score))` across every item that has been scored.
- Overall gate (overview only): `>=80` SHIP, `>=55` FIX, else BLOCK — a pure numeric threshold. A per-item `nqs-gate` is the auditor's own judgment and is never recomputed from its score.
- `metrics.canonical_count` / `needs_review_count`: items with `status === "approved"` / `"needs_review"`.
- `metrics.pillar_count` / `story_count` / `proof_point_count`: items by `type`.
- `metrics.drift_open_count`: drift alerts with `status === "open"`.

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step. Reads `items` with `status: "approved"`, and with
`--apply` writes `status: "done"` back onto each. It performs no publishing
or channel export itself — per SKILL.md, folding a promoted asset into the
canonical narrative (and any `export_narrative` to markdown) is the skill's
job, done only after this script confirms the promotion.
