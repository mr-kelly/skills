# Kelly Picks Snapshot Schema

Use this schema for `app/.data/picks_snapshot.json`. Keep the shape stable so the local app, scripts, and future providers can evolve independently. Validate with `node scripts/validate_ui_schema.ts [path]` before relying on a snapshot.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-picks",
  "base_currency": "USD",
  "range": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "metrics": {
    "source_count": 0,
    "trend_item_count": 0,
    "candidate_count": 0,
    "candidates_new_7d": 0,
    "candidates_to_review": 0,
    "in_development": 0,
    "watching": 0,
    "dropped": 0,
    "proposals_needs_review": 0,
    "avg_margin_approved_pct": 0,
    "below_margin_floor": 0
  },
  "sources": [],
  "trend_items": [],
  "candidates": [],
  "proposals": [],
  "sync_log": []
}
```

## Source

One entry per configured trend source; sweep freshness feeds the overview.

```json
{
  "source_id": "stable local id",
  "kind": "amazon_bsr|tiktok|temu|aliexpress|trends|competitor",
  "name": "human-readable name",
  "method": "browser_agent|manual",
  "last_sweep_at": "ISO timestamp",
  "items_7d": 0,
  "status": "ok|stale"
}
```

## Trend Item

Raw signal from a sweep. Deduped by `source + external_id`, falling back to `content_hash` (sha256 of source + title + url, first 16 hex chars).

```json
{
  "trend_id": "stable local id",
  "source": "amazon_bsr|tiktok|temu|aliexpress|trends|competitor",
  "title": "one-line headline",
  "summary": "1-3 sentence change summary",
  "url": "evidence URL",
  "metric_label": "views/week | BSR rank | orders/30d | interest index | ...",
  "metric_value": 0,
  "delta_pct": 0,
  "momentum": [0, 0, 0],
  "observed_at": "ISO timestamp",
  "candidate_id": "optional linked candidate",
  "external_id": "optional stable id from the source",
  "content_hash": "dedupe hash"
}
```

## Candidate

A product under research. `stage` is the candidate lifecycle; workflow states live on proposals.

```json
{
  "candidate_id": "stable local id",
  "name": "product name",
  "category": "matches a freight rule category when possible",
  "source": "amazon_bsr|tiktok|temu|aliexpress|trends|competitor",
  "source_ref": "optional trend_id that spawned it",
  "stage": "new|reviewing|develop|watch|dropped",
  "platform_id": "target platform from config platforms[]",
  "competition_grade": "A|B|C|D",
  "momentum_pct": 0,
  "est_price": 0,
  "currency": "USD",
  "margin_card": {
    "price": 0,
    "cogs": 0,
    "freight": 0,
    "freight_quoted": false,
    "platform_fee_pct": 0,
    "platform_fee": 0,
    "ad_cost": 0,
    "margin": 0,
    "margin_pct": 0,
    "breakeven_acos_pct": 0,
    "below_floor": false,
    "computed_at": "ISO timestamp"
  },
  "competition": {
    "top_review_counts": [0],
    "head_share_pct": 0,
    "dominance_note": "who owns the shelf and how deep the moat is",
    "new_entrants_90d": 0,
    "velocity_note": "how fast new sellers are arriving"
  },
  "evidence": [{ "title": "link title", "url": "https://..." }],
  "why_it_matters": "the agent's note: demand, wedge, margin, window",
  "first_seen": "ISO timestamp",
  "last_updated": "ISO timestamp"
}
```

Margin math (see `scripts/compute_margins.ts`, all amounts in the candidate currency):

- `platform_fee = price * referral_fee_pct/100 + fulfillment_flat` (from the config platform row; stored back as an effective `platform_fee_pct`)
- `margin = price − cogs − freight − platform_fee − ad_cost`
- `margin_pct = margin / price * 100`
- `breakeven_acos_pct = (price − cogs − freight − platform_fee) / price * 100` (margin before ad spend, as % of price)
- `below_floor = margin_pct < seller_profile.margin_floor_pct`

Freight resolution: keep an agent-quoted `freight` when `freight_quoted` is true; otherwise use the config freight rule for the candidate's category; otherwise `freight.default_per_unit`. `competition_grade` is the agent's read of the shelf: A = open, B = winnable, C = contested, D = saturated.

## Proposal

A candidate verdict proposal from the agent, reviewed in `#/decisions`. Standard workflow states apply.

```json
{
  "proposal_id": "stable local id",
  "candidate_id": "candidate id",
  "title": "Develop: ... | Watch: ... | Drop: ...",
  "verdict": "develop|watch|drop",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "reason": "why the agent proposes this verdict",
  "brief": "editable text: sourcing + listing brief draft (develop), re-check criteria (watch), or drop rationale",
  "proposed_at": "ISO timestamp",
  "verdictNote": "optional short human note shown on closed items"
}
```

Approved proposals become concrete operations in `execution_report.json` via `scripts/execute_decisions.ts`:

- `develop` → `create_sourcing_brief` (export path under `exports/`) + `handoff_listing_brief` (target `kelly-listing`)
- `watch` → `add_watch` (target candidate id, summary carries the re-check criteria)
- `drop` → `drop_candidate` (local stage update only)

## Decisions, Tasks, Lock

- `app/.data/decisions.json`: `{ "updated_at": "...", "decisions": { "<id>": { "kind": "candidate|proposal|trend", "action": "...", "comment": "...", "brief": "optional edited brief", "stage|status": "...", "decided_at": "..." } } }`. Candidate actions: `develop|watch|drop`. Proposal actions: `approve|request_changes|revise|block`. Trend action: `promote`.
- `app/.data/agent_tasks.json`: `{ "updated_at": "...", "tasks": [ { "task_id", "kind": "revise_proposal|unblock_proposal|draft_development_proposal|promote_to_candidate", "ref_id", "note", "status", "created_at" } ] }`.
- `app/.data/execution_report.json`: output of `execute_decisions.ts` (`generated_at`, `dry_run`, `operations[]`).
- `app/.data/onboarding.json`: `{ "completed": true, "completed_at": "...", "config_version": "..." }`.
- `app/.data/agent.lock`: `{ "owner", "message", "started_at" }`. While it exists, `POST /api/decision` returns HTTP 423 and all scripts refuse to run.

## Sync Log

```json
{ "at": "ISO timestamp", "actor": "kelly-picks-agent", "action": "ingest_trends|compute_margins|execute_decisions", "detail": "short human-readable summary" }
```

Keep the newest entries first; cap at 50.
