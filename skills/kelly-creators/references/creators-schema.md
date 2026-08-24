# Kelly Creators Schema

Use this schema when reading or writing Kelly Creators' Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/kelly-creators-app/app/js/providers/busabase-provider.js`,
`content/kelly-creators-app/app/js/creators-model.js`). `phase`, `cpm`, and every rollup metric are
computed client-side from the `creators` Base on every read — they are never
stored.

An **item is a creator engagement** (or a **quality gate** on a live post).
The review-queue lifecycle uses the standard workflow states.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `revise`.

## Creators (`kelly-creators-creators`)

Rows are the review-queue items — every creator engagement plus every
content-reviewer quality gate. `item-type: "quality_gate"` rows are excluded
from `creator_count`/`total_reach`/`budget_allocated`/`est_value` but are
counted in the `needs_review`/`approved`/`done`/`blocked` totals like any
other row.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `creator-id` | `creator_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-batch row number; never renumber on regeneration |
| `item-type` | `item_type` | text | `engagement\|quality_gate` |
| `handle` | `handle` | text | invented handle, e.g. `@lena.glowlab` |
| `name` | `name` | text | display name |
| `platform` | `platform` | text | `instagram\|tiktok\|youtube\|xiaohongshu\|twitter\|twitch` |
| `niche` | `niche` | text | `beauty\|fitness\|tech\|lifestyle\|food\|wellness\|parenting` |
| `followers` | `followers` | number | |
| `engagement-rate` | `engagement_rate` | number | fraction, e.g. `0.062` |
| `fit-score` | `fit_score` | number | C³ ACE match score, 0-100 |
| `fit-breakdown` | `fit_breakdown` | longtext | JSON object: `{content, community, credibility, audience, cost, engagement}` |
| `stage` | `stage` | text | `discovery\|outreach\|negotiating\|live\|measured` |
| `status` | `status` | text | workflow status |
| `proposed-action` | `proposed_action` | text | `send_outreach\|send_brief\|draft_contract\|no_action` |
| `est-rate` | `est_rate` | number | estimated/quoted rate |
| `risk` | `risk` | text | JSON array, e.g. `["money","contract"]` |
| `channel` | `channel` | text | `instagram_dm\|tiktok_dm\|email` |
| `reason` | `reason` | longtext | why this action is proposed now |
| `audience-note` | `audience_note` | longtext | short audience-fit note |
| `suggested-reply` | `suggested_reply` | longtext | editable outreach DM / email / brief draft |
| `est-value` | `est_value` | number | estimated media value |
| `spend` | `spend` | number | actual spend once live |
| `gate-verdict` | `gate_verdict` | text | `ship\|fix\|block`, quality-gate items only |
| `gate-checks` | `gate_checks` | longtext | JSON array of `{check, result, note}`, quality-gate items only |
| `created-at` | `created_at` | text | ISO timestamp |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |

`fit_score` is the objective **C³ ACE** matching score (0-100): **C**ontent
/ **C**ommunity / **C**redibility × **A**udience / **C**ost / **E**ngagement,
expanded in `fit_breakdown`. `phase` tags the engagement with the
Discover/Plan/Activate/Measure discipline phase; it is derived from `stage`.
`cpm` (`(est_rate / followers) * 1000`, rounded to 2dp) is derived from
`est_rate`/`followers`. `est_rate` and `risk: ["money"|"contract"]` drive the
money/contract risk badges — any engagement carrying money or contract risk
is **approval-required** before a contract is drafted.

### Quality-gate rows (content-reviewer)

A pre-publication decision gate on a live creator's draft post, same row
shape plus `gate-verdict`/`gate-checks`. The gate outputs **SHIP / FIX /
BLOCK** by checking FTC disclosure placement and claim authenticity before
the post publishes. `est-rate`, `est-value`, and `followers` on a gate row
are informational only and excluded from metric rollups.

## Settings (`kelly-creators-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `kelly-creators-profile` | `profile` | `{operator: {name, role, company, timezone}, program: {base_currency, budget_total, target_niches}, brands: [{brand_id, display_name, positioning}], style: {tone}, platforms: [{platform_id, type, display_name, handoff_skill, secret_envs, secrets_ready}]}` |
| `kelly-creators-lock` | `lock` | not JSON-wrapped: fields `locked` (bool), `owner`, `message` live directly on the row |

While the lock row has `locked: true` the app rejects decision writes and
renders the outreach queue read-only.

## Decisions

A human verdict (`approve` / `request_changes` / `block` / `revise`) writes
`status`, `decision-note`, and `decided-at` directly onto the creator
record — approving an edited draft also writes the new `suggested-reply`.
There is no separate decisions file: the creator record is the single source
of truth for both the draft and its review state.

## Metrics (computed, never stored)

- `creator_count`: engagements (excludes quality-gate rows).
- `needs_review` / `approved` / `done` / `blocked`: counted over every row
  (engagements AND quality-gate rows both carry a workflow `status`).
- `total_reach`: sum of `followers` over non-`blocked` engagements.
- `budget_allocated`: sum of `est_rate` over `approved`/`done`/`live`-status
  engagements.
- `est_value`: sum of `est_value` over engagements.
- `budget_total`: read from the operator profile's `program.budget_total`,
  not derived from rows.

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step. Reads `creators` rows with `status: "approved"`
and `item-type: "engagement"` (quality-gate rows are skipped — they have no
outbound handoff), and with `--apply` writes `status: "done"` back onto
each. It performs no sending, publishing, or contract execution itself —
that happens through the corresponding skill (for example
`instagram-outreach`, `tiktok-outreach`, `kelly-email`) as a separate,
explicitly authorized step. Execution semantics by `proposed-action`:

- `send_outreach` → hand off `suggested-reply` to the platform DM/email skill for `channel`.
- `send_brief` → hand off the approved brief (`suggested-reply`, format `pdf`).
- `draft_contract` → hand off contract terms for drafting (format `pdf`).
- rows with `proposed-action: "no_action"` or missing are skipped.
