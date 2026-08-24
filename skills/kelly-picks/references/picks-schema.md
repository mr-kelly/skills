# Kelly Picks Schema

Use this schema when reading or writing Kelly Picks's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`content/kelly-picks-app/app/js/providers/busabase-provider.js`, `content/kelly-picks-app/app/js/picks-model.js`).
Metrics (`avg_margin_approved_pct`, `below_margin_floor`, per-view counts,
...) are recomputed client-side from the stored rows on every read — they
are never stored, so the desk is always fresh regardless of when a browser
session loads it relative to the last sweep/compute/execute run.

Candidate stages: `new`, `reviewing`, `develop`, `watch`, `dropped`.

Proposal statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Candidate verdict actions: `develop`, `watch`, `drop`. Proposal review actions: `approve`, `request_changes`, `revise`, `block`. Trend promotion action: `promote`.

Source kinds: `amazon_bsr`, `tiktok`, `temu`, `aliexpress`, `trends`, `competitor`.

## Candidates (`kelly-picks-candidates`)

A product under research. The margin card and competition read are
JSON-encoded on the same row — they share the candidate's lifecycle, not a
separate one.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `candidate-id` | `candidate_id` | text | stable domain id, required |
| `name` | `name` | text | product name |
| `category` | `category` | text | matches a freight rule category when possible |
| `source` | `source` | text | one of the source kinds |
| `source-ref` | `source_ref` | text | optional `trend_id` that spawned this candidate |
| `stage` | `stage` | text | candidate lifecycle |
| `platform-id` | `platform_id` | text | target platform from `settings.platforms[]` |
| `competition-grade` | `competition_grade` | text | `A\|B\|C\|D`, the agent's read of the shelf |
| `momentum-pct` | `momentum_pct` | number | |
| `est-price` | `est_price` | number | |
| `currency` | `currency` | text | defaults to `settings.base_currency` |
| `margin-card` | `margin_card` | longtext | JSON, see Margin Math below |
| `competition` | `competition` | longtext | JSON `{top_review_counts[], head_share_pct, dominance_note, new_entrants_90d, velocity_note}` |
| `evidence` | `evidence` | longtext | JSON array of `{title, url}` |
| `why-it-matters` | `why_it_matters` | longtext | the agent's note: demand, wedge, margin, window |
| `first-seen` | `first_seen` | text | ISO timestamp |
| `last-updated` | `last_updated` | text | ISO timestamp |
| `verdict-action` | `verdict_action` | text | `develop\|watch\|drop`, unset until Kelly verdicts |
| `verdict-comment` | `verdict_comment` | longtext | written with the verdict |
| `verdict-decided-at` | `verdict_decided_at` | text | written with the verdict |

### Margin card JSON (`margin-card`)

```json
{
  "price": 0, "cogs": 0, "freight": 0, "freight_quoted": false,
  "platform_fee_pct": 0, "platform_fee": 0, "ad_cost": 0,
  "margin": 0, "margin_pct": 0, "breakeven_acos_pct": 0,
  "below_floor": false, "computed_at": "ISO timestamp"
}
```

Margin math (ported verbatim into `content/kelly-picks-app/app/js/picks-model.js`'s `computeMarginCard()`, used by both `scripts/compute_margins.mjs` and the browser's live what-if panel):

- `platform_fee = price * referral_fee_pct/100 + fulfillment_flat` (from `settings.platforms[]`; stored back as an effective `platform_fee_pct`)
- `margin = price − cogs − freight − platform_fee − ad_cost`
- `margin_pct = margin / price * 100`
- `breakeven_acos_pct = (price − cogs − freight − platform_fee) / price * 100` (margin before ad spend, as % of price)
- `below_floor = margin_pct < seller_profile.margin_floor_pct`

Freight resolution: keep an agent-quoted `freight` when `freight_quoted` is
true; otherwise use the `settings.freight.rules[]` entry for the candidate's
category; otherwise `settings.freight.default_per_unit`.

## Trend Items (`kelly-picks-trend-items`)

Raw signal from a sweep. Deduped by `source + external_id`, falling back to
`content_hash` (sha256 of `source::title::url`, first 16 hex chars). A
genuinely distinct entity from Candidates: it has its own promote-to-candidate
lifecycle and can exist without ever becoming one.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `trend-id` | `trend_id` | text | stable domain id, required |
| `source` | `source` | text | source kind |
| `title` | `title` | text | one-line headline |
| `summary` | `summary` | longtext | 1-3 sentence change summary |
| `url` | `url` | text | evidence URL |
| `metric-label` | `metric_label` | text | `views/week \| BSR rank \| orders/30d \| interest index \| ...` |
| `metric-value` | `metric_value` | number | |
| `delta-pct` | `delta_pct` | number | |
| `momentum` | `momentum` | longtext | JSON array of numbers, a short trend series |
| `observed-at` | `observed_at` | text | ISO timestamp |
| `candidate-id` | `candidate_id` | text | optional linked candidate |
| `external-id` | `external_id` | text | optional stable id from the source |
| `content-hash` | `content_hash` | text | dedupe hash |
| `promotion-action` | `promotion_action` | text | `promote`, unset until promoted |
| `promotion-comment` | `promotion_comment` | longtext | written with the promotion |
| `promotion-decided-at` | `promotion_decided_at` | text | written with the promotion |

## Proposals (`kelly-picks-proposals`)

A candidate verdict proposal from the agent, reviewed in `#/decisions`. Its
own five-state review workflow, independent of the candidate's `stage`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `proposal-id` | `proposal_id` | text | stable domain id, required |
| `candidate-id` | `candidate_id` | text | |
| `title` | `title` | text | `Develop: ... \| Watch: ... \| Drop: ...` |
| `verdict` | `verdict` | text | `develop\|watch\|drop` |
| `status` | `status` | text | workflow status |
| `reason` | `reason` | longtext | why the agent proposes this |
| `brief` | `brief` | longtext | editable: sourcing + listing brief draft (develop), re-check criteria (watch), or drop rationale |
| `proposed-at` | `proposed_at` | text | ISO timestamp |
| `review-comment` | `review_comment` | longtext | written with the review verdict; a `revise` action leaves this and `status` unchanged (it only rewrites `brief`) |
| `review-decided-at` | `review_decided_at` | text | written with the review verdict |

`done` is terminal: `scripts/execute_decisions.mjs --apply` is the only
process that sets it, only for a proposal already `approved`, only after the
agent reports the real external handoff succeeded. Approved proposals map to
concrete operations (see `scripts/execute_decisions.mjs`):

- `develop` → `create_sourcing_brief` (export path under `exports/`) + `handoff_listing_brief` (target `kelly-listing`)
- `watch` → `add_watch` (target candidate id, summary carries the re-check criteria)
- `drop` → `drop_candidate` (candidate stage update only)

## Sources (`kelly-picks-sources`)

One entry per configured trend source; sweep freshness feeds the overview.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `source-id` | `source_id` | text | stable domain id, required |
| `kind` | `kind` | text | source kind |
| `name` | `name` | text | human-readable name |
| `method` | `method` | text | `browser_agent\|manual` |
| `last-sweep-at` | `last_sweep_at` | text | ISO timestamp |
| `items-7d` | `items_7d` | number | |
| `status` | `status` | text | `ok\|stale` |

## Sync Log (`kelly-picks-sync-log`)

Append-only feed, newest-first, capped at 50 entries in the UI.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `log-id` | `log_id` | text | stable domain id, required |
| `at` | `at` | text | ISO timestamp |
| `actor` | `actor` | text | `kelly-picks-agent` |
| `action` | `action` | text | `ingest_trends\|compute_margins\|execute_decisions` |
| `detail` | `detail` | longtext | short human-readable summary |

## Settings (`kelly-picks-settings`)

One row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `base-currency` | `base_currency` | text | default `USD` |
| `seller-profile` | `seller_profile` | longtext | JSON `{store_name, categories[], target_platforms[], margin_floor_pct, max_cogs}` |
| `platforms` | `platforms` | longtext | JSON array of `{platform_id, name, currency, referral_fee_pct, fulfillment_flat}` |
| `freight` | `freight` | longtext | JSON `{default_per_unit, rules: [{category, per_unit}]}` |
| `ad-cost-default-pct` | `ad_cost_default_pct` | number | assumed est. ad cost % of price when no better estimate exists |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Sweep Payload File (trusted-script input, never committed)

`scripts/ingest_trends.mjs` takes a local JSON file (never committed, never
read by the AirApp):

```json
{
  "trend-items": [
    {
      "trend_id": "tr-example",
      "source": "tiktok",
      "title": "one-line headline",
      "summary": "1-3 sentence summary",
      "url": "https://...",
      "metric_label": "views/week",
      "metric_value": 500000,
      "delta_pct": 40,
      "momentum": [10, 20, 30],
      "observed_at": "ISO timestamp",
      "candidate_id": "cand-example",
      "external_id": "optional stable source id"
    }
  ],
  "candidates": [
    {
      "candidate_id": "cand-example",
      "name": "product name",
      "category": "kitchen",
      "source": "tiktok",
      "source_ref": "tr-example",
      "stage": "new",
      "platform_id": "amazon_us",
      "competition_grade": "B",
      "momentum_pct": 40,
      "est_price": 19.99,
      "margin_card": { "cogs": 4.6, "freight": 2.1, "freight_quoted": true },
      "competition": { "top_review_counts": [200, 150], "head_share_pct": 20, "dominance_note": "...", "new_entrants_90d": 3, "velocity_note": "..." },
      "evidence": [{ "title": "...", "url": "https://..." }],
      "why_it_matters": "demand, wedge, margin, window"
    }
  ],
  "source_sweeps": [{ "source_id": "tiktok-kitchen", "swept_at": "ISO timestamp" }]
}
```
