# Kelly Picks

Kelly Picks is a Busabase App-in-Skill product-research (选品) desk for a cross-border e-commerce seller. The agent sweeps trend sources — Amazon BSR movers, TikTok viral product videos, Temu/AliExpress rising items, Google Trends terms, competitor new launches — and files product candidates; Kelly verdicts them develop / watch / drop in a review queue. `scripts/ingest_trends.mjs` is the single write path for sweep payloads, `scripts/compute_margins.mjs` deterministically recomputes every margin card, and `scripts/execute_decisions.mjs` prints the plan for approved proposals — the AirApp itself never browses a trend source, scrapes a listing, or performs a handoff.

## What It Shows

- Overview: what needs Kelly's attention (proposals to review, develop-approved awaiting handoff, stale watches), KPI cards (candidates this week by source, in development, watching, avg margin of approved), top movers with momentum arrows, and per-source sweep freshness.
- Candidates: the research table — source badge, momentum, est. price, est. margin %, competition grade (A-D), stage. Detail shows a line-by-line margin card (price − COGS − freight − platform fee − est. ad cost → margin %, breakeven ACOS) with live-recomputing inputs, a competition read (top-10 review counts as SVG bars, head-seller dominance, new-entrant velocity), evidence links, and Develop / Watch / Drop verdict buttons.
- Trends: the raw signal feed, filterable by source badges, each item linked to its candidate or offering "Promote to candidate".
- Decisions: the review queue (`needs_review / changes_requested / approved / done / blocked`) — each item is an agent verdict proposal with an editable sourcing/listing brief, Approve / Request changes / Block buttons, and stable refs like `Pick #1`.
- Help & Settings: sanitized config — seller profile, platform fee tables, freight rules, sources with method, data provider, onboarding state.

## How It Flows

1. The agent sweeps sources (browser skills, exports, pasted research) and files everything through `node scripts/ingest_trends.mjs <payload.json>` — the single write path, which validates, dedupes (source + external id, content-hash fallback), and merges into the `candidates`/`trend_items`/`sources` Bases.
2. `node scripts/compute_margins.mjs` deterministically recomputes every margin card from the `settings` fee tables and flags candidates below the margin floor. It is idempotent.
3. Kelly verdicts candidates and reviews proposals in the app — writes go straight to the candidate/proposal record through `busabase-sdk`; a standalone local preview merges immediately, a deployed AirApp creates a pending ChangeRequest.
4. `node scripts/execute_decisions.mjs` (dry-run by default) prints the plan for approved proposals: `create_sourcing_brief` (export path), `handoff_listing_brief` (→ kelly-listing), `add_watch` (re-check criteria), `drop_candidate` (stage update). The agent performs the handoffs, then re-runs with `--apply` to mark them done.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Picks overview"></td>
    <td width="50%"><img src="assets/screenshots/candidates.webp" alt="Kelly Picks candidates"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Product-research desk with weekly candidates by source, top movers, and per-source sweep freshness.</td>
    <td><strong>Candidates</strong><br>Candidate table with momentum, estimated margin, competition grade, and develop/watch/drop stages.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/decisions.webp" alt="Kelly Picks decision queue"></td>
    <td width="50%"><img src="assets/screenshots/detail.webp" alt="Kelly Picks margin card"></td>
  </tr>
  <tr>
    <td><strong>Decision queue</strong><br>Agent-proposed develop/watch/drop verdicts with sourcing and listing briefs for approval.</td>
    <td><strong>Margin card</strong><br>Live-editable margin math — price, landed cost, freight, fees, ad cost → margin % and breakeven ACOS — plus a top-10 review-count competition read.</td>
  </tr>
</table>

## Demo Mode

Run the app locally and open a safe mock-data scene (a home/kitchen gadget seller, "Nimbus Home"):

```bash
pnpm --dir skills/kelly-picks/app dev
```

Use the printed URL, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=candidates&lang=en#/candidates
/?demo=detail&lang=en#/candidates/cand-lunchbox
/?demo=trends&lang=en#/trends
/?demo=decisions&lang=en#/decisions
```

Featured deep link (full margin card + competition bars, Chinese content for zh screenshots — the featured candidate id is stable: `cand-lunchbox`):

```text
/?demo=detail&lang=zh#/candidates/cand-lunchbox
```

With `lang=zh`, demo content (product names like 可折叠硅胶饭盒, reasons, briefs, summaries) is localized to Chinese; currency stays USD. Demo mode never reads or writes Busabase, and demo decisions are simulated in memory only.

## Sweep Payload Format

`node scripts/ingest_trends.mjs <payload.json>` accepts:

```json
{
  "trend_items": [
    {
      "source": "tiktok",
      "title": "Collapsible silicone lunch box — 2.1M views/week",
      "summary": "Three creators posted fold-flat demos this week.",
      "url": "https://…",
      "metric_label": "views/week",
      "metric_value": 2100000,
      "delta_pct": 96,
      "momentum": [12, 18, 26, 41],
      "external_id": "tt-7381",
      "candidate_id": "cand-lunchbox"
    }
  ],
  "candidates": [
    {
      "name": "Collapsible silicone lunch box",
      "category": "kitchen",
      "source": "tiktok",
      "platform_id": "amazon_us",
      "est_price": 21.99,
      "margin_card": { "price": 21.99, "cogs": 4.6, "freight": 2.1, "freight_quoted": true, "ad_cost": 3.6 },
      "competition": { "top_review_counts": [214, 187, 150], "head_share_pct": 11, "dominance_note": "…", "new_entrants_90d": 4, "velocity_note": "…" },
      "evidence": [{ "title": "Creator demo", "url": "https://…" }],
      "why_it_matters": "Demand, wedge, margin, window."
    }
  ],
  "source_sweeps": [{ "source_id": "tiktok-kitchen", "swept_at": "2026-07-02T08:20:00Z" }]
}
```

Source kinds: `amazon_bsr | tiktok | temu | aliexpress | trends | competitor`. Full schema: `references/picks-schema.md`.

## Fee-Table Config

The `settings` Base's single row holds `seller_profile` (categories, target platforms, `margin_floor_pct`, `max_cogs`), `platforms[]` (per-platform `referral_fee_pct` + `fulfillment_flat`), `freight` (`default_per_unit` + per-category `rules`), and `ad_cost_default_pct`. `scripts/compute_margins.mjs` reads these to recompute every margin card; the margin floor drives the `below_floor` flags in the UI.

## Trusted Scripts

All three scripts connect with their own Busabase credentials (`BUSABASE_BASE_URL` / `BUSABASE_API_KEY` / `BUSABASE_SPACE_ID`), never the AirApp's ambient browser session:

```bash
node skills/kelly-picks/scripts/ingest_trends.mjs payload.json
node skills/kelly-picks/scripts/compute_margins.mjs
node skills/kelly-picks/scripts/execute_decisions.mjs
node skills/kelly-picks/scripts/execute_decisions.mjs --apply
```

## Boundary

Collection is read-only over public data — respect each platform's terms of service and robots.txt, throttle politely, and never scrape private or personal data. The AirApp reads and writes Busabase records only; it never fetches a trend source, scrapes a listing, or performs a handoff itself. Handoffs (sourcing brief exports, listing briefs → kelly-listing) require Kelly's approval in the app first; `execute_decisions.mjs` is dry-run by default.
