---
name: kelly-picks
license: MIT
description: Kelly's product-research (选品) desk for a cross-border e-commerce seller, as a local App-in-Skill. The agent sweeps trend sources — Amazon BSR movers, TikTok viral product videos, Temu/AliExpress rising items, Google Trends terms, competitor new launches — and files product candidates with margin cards (landed cost, fees, breakeven ACOS) and competition reads; Kelly verdicts them develop / watch / drop, and develop items become sourcing and listing briefs handed to kelly-listing. Use when the user invokes $kelly-picks or /kelly-picks, or asks for 选品, product research, a product sourcing radar, BSR movers, TikTok viral products, a margin calculator, breakeven ACOS, competition reads, or product candidate triage.
---

# Kelly Picks

## Overview

Use this skill as Kelly's product-research (选品) desk. The agent sweeps configured trend sources and files everything into one snapshot the local app renders:

1. **Trend feed**: raw source-tagged signals — a viral TikTok with view velocity, a BSR jump, a Temu/AliExpress riser, a rising search query, a competitor launch — each linkable to a candidate.
2. **Candidates**: products under research, each with a **margin card** (estimated price − landed cost − freight − platform fees − est. ad cost → gross margin %, breakeven ACOS) and a **competition read** (top-10 review-count distribution, head-seller dominance, new-entrant velocity).
3. **Decisions**: the review queue — the agent proposes a verdict per candidate (develop with sourcing + listing brief draft, drop with reason, keep watching with re-check criteria); Kelly approves, edits the brief, requests changes, or blocks. Approved develop items become concrete handoffs: a sourcing brief export and a listing brief for kelly-listing.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or load the local picks snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

Collection is agent-driven: browser automation skills in the agent session, exports, or pasted research fed through the ingest script. The app itself only renders local snapshot files and never touches any network beyond `127.0.0.1`.

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

## Boundary

- Collection is read-only over public data (rankings, public videos, public listings, public trends). Respect robots.txt and each platform's terms of service, throttle politely, and never scrape private, gated, or personal data.
- The skill may read public sources, normalize trend items and candidates, recompute margins, and write local handoff files.
- The app reads and writes local files only. It must not fetch remote pages, place orders, message suppliers, or mutate remote systems.
- Margin data, supplier quotes, and fee tables are Kelly's business data: they stay local. Do not commit `config.local.json`, env files, `app/.data/`, or `exports/`.
- Handoffs (listing brief → kelly-listing, sourcing brief exports) are approval-required: Kelly approves the proposal in the UI, then `scripts/execute_decisions.ts` records the concrete operation for the agent to carry out.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before any sweeping.

Private config priority:

1. `KELLY_PICKS_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-picks/config.local.json`
3. `~/.config/kelly-picks/config.json`
4. `skills/kelly-picks/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_PICKS_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-picks/.env.local`
5. `~/.config/kelly-picks/.env`

Onboarding asks, turn by turn:

- Seller profile: store name, product categories, and hard limits (margin floor %, max COGS).
- Target platforms with fee tables: per platform, the referral fee % and any flat fulfillment fee (`platforms[]`).
- Freight rules: default per-unit freight and per-category overrides (`freight`).
- Ad cost default: the % of price to assume for est. ad cost when the agent has no better number.
- Sources: which of `amazon_bsr|tiktok|temu|aliexpress|trends|competitor` to sweep, each with a method (`browser_agent` or `manual`), plus any optional API env var names (never secret values in chat).

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the desk with:

```bash
skills/kelly-picks/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or `KELLY_PICKS_UI_PORT` when set. The launcher reuses a running instance only if `/api/state` reports `app: "kelly-picks"`.

Required app views (hash routes):

- `#/overview`: product-research command desk — human-attention panel (candidates to review, develop-approved awaiting handoff, stale watches), KPI cards (candidates this week by source, in development, watching, average margin of approved), top movers this week with momentum arrows, and source freshness (last sweep per source).
- `#/candidates` and `#/candidates/<id>`: the candidate table — product name, category, source badge, momentum, est. price, est. margin %, competition grade (A-D), stage (`new|reviewing|develop|watch|dropped`). Detail shows the full margin card (line-by-line, editable inputs recomputing live in-memory), the competition read (top-10 review counts as inline SVG bars, dominance note, new-entrant velocity), evidence links, the agent's why-it-matters note, and Develop / Watch / Drop verdict buttons with a `Review note`.
- `#/trends`: the raw signal feed, filterable by source badges; items link to their candidate or offer "Promote to candidate" (queues an agent task in real mode).
- `#/decisions`: the review queue with workflow states (`needs_review|changes_requested|approved|done|blocked`) — each item is a candidate verdict proposal with editable brief text, Approve / Request changes / Save brief edit / Block buttons, a `Review note`, and stable refs like `Pick #1`.
- `#/settings`: sanitized config — seller profile, platform fee tables, freight rules, sources with per-source method, env readiness booleans, data provider, onboarding state. Never expose secret values.

Demo mode:

- `?demo=<scene>` opens deterministic mock data: `overview`, `candidates`, `trends`, `decisions`, `detail` (a featured candidate with full margin card and competition bars; featured id `cand-lunchbox`).
- `lang=en` or `lang=zh` forces UI chrome language for screenshots; with `lang=zh` the demo content itself (product names, reasons, briefs, summaries) is meaningfully localized while numbers stay USD.
- Deep links like `/?demo=detail&lang=zh#/candidates/cand-lunchbox` must work.
- Demo API responses never read or write files under `app/.data/`, and demo decisions are simulated only.

UI language: English and Chinese chrome with `Auto` default (`navigator.languages`), an explicit selector persisted locally, and imported domain content kept in its original language outside demo mode.

## File Contract

Read `references/picks-schema.md` before editing the app, scripts, or any generated JSON.

- `app/.data/picks_snapshot.json`: canonical snapshot — `sources[]`, `trend_items[]`, `candidates[]` (with `margin_card` + `competition`), `proposals[]`, `metrics`, `sync_log[]`.
- `app/.data/decisions.json`: Kelly's verdicts keyed by item id (candidate verdicts, proposal reviews, trend promotions).
- `app/.data/agent_tasks.json`: queued agent work — revise-proposal requests, draft-development-proposal requests, promote-to-candidate requests.
- `app/.data/execution_report.json`: latest `execute_decisions.ts` output.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill writes files. The decisions queue rejects `POST /api/decision` with HTTP 423 while it exists, and all scripts refuse to run.

Validate with `node scripts/validate_ui_schema.ts app/.data/picks_snapshot.json` before relying on a snapshot.

## Sweep Workflow

Sweeps run on demand — when Kelly asks for a sweep or invokes the skill for fresh research. There is no cron inside the skill; any recurring schedule lives outside it.

1. Iterate the configured sources with method `browser_agent` using browser skills or web search in the agent session; `manual` sources are supplied by Kelly as pasted research or export files.
2. For each finding, build a normalized trend item: source kind, one-line title, 1-3 sentence summary, evidence URL, a metric (`metric_label` + `metric_value`), `delta_pct`, and a short `momentum` series. Give it a stable `external_id` when the source has one.
3. When a signal is strong enough, file a candidate in the same payload: name, category, target platform, est. price, best-known margin inputs, a competition read (top-10 review counts, head share, entrant velocity), evidence links, and a `why_it_matters` note that states demand, wedge, margin, and window.
4. Write through the single write path: save the payload JSON, then run `node scripts/ingest_trends.ts <payload.json>`. The script validates, dedupes trend items by source + external id (content hash fallback) and candidates by id or name+source, merges, refreshes source freshness and metrics, appends `sync_log`, and honors the lock.
5. Dedupe rules: a re-observed trend with unchanged numbers is skipped; changed numbers update the existing row. One row per signal, not per crawl.

## Margin Workflow

1. After ingest (or when fee tables change), run `node scripts/compute_margins.ts`. It deterministically recomputes every candidate's margin card from the config fee tables: platform referral fee % + flat fulfillment fee, freight rules by category (agent-quoted freight with `freight_quoted: true` is preserved), and the ad-cost default % when no estimate exists.
2. The script flags candidates below `seller_profile.margin_floor_pct` (`below_floor: true`, surfaced in the UI) and is idempotent — re-running without input changes changes nothing.
3. The margin card in `#/candidates/<id>` is a what-if surface: edits recompute live in the browser only. The snapshot on disk is only changed by scripts, so the app and the agent never fight over numbers.
4. When Kelly gets a real freight quote or supplier price, ingest it as a candidate update (`margin_card.freight` + `freight_quoted: true`, or new `cogs`) and re-run `compute_margins.ts`.

## Decision Workflow

1. The agent proposes verdicts as `proposals[]` in the snapshot (via `ingest_trends.ts` payloads): `develop` with a drafted sourcing + listing brief, `drop` with the reason, `watch` with re-check criteria.
2. Kelly reviews in `#/decisions` (or `#/candidates/<id>` for direct verdicts). The app writes to `decisions.json` and queues work into `agent_tasks.json` (request changes → `revise_proposal`; candidate Develop verdict → `draft_development_proposal`; trend Promote → `promote_to_candidate`). Poll `agent_tasks.json` when the skill is invoked and work the queue.
3. Before executing anything, re-read decisions and run `node scripts/execute_decisions.ts` (dry-run). It converts approved proposals into concrete operations in `execution_report.json`: `create_sourcing_brief` → export path under `exports/`, `handoff_listing_brief` → kelly-listing, `add_watch` → candidate id with re-check criteria. No external side effects.
4. After Kelly confirms the dry-run, perform the handoffs (write the sourcing brief export, invoke kelly-listing with the listing brief), then run `node scripts/execute_decisions.ts --apply` to mark proposals done, update candidate stages, and log the run.
5. Acquire `app/.data/agent.lock` before the skill rewrites snapshot/decision files and remove it in a `finally` step. The scripts do this automatically.

## Safety Defaults

- Treat handoffs, exports, config changes, and anything that could become an order or supplier contact as approval-required.
- Keep sweeps polite: throttle, cache, and store only the minimal excerpt needed for the trend item and evidence links.
- Never present a margin card as a guarantee — it is an estimate from configured fee tables; flag missing inputs instead of guessing silently.
- Keep ingestion idempotent via stable ids and content hashes so repeated sweeps never duplicate rows.
- Redact tokens and personal data from snapshots, logs, and UI state; expose only boolean readiness for configured env vars.
- If a source cannot be read reliably (geo-variants, A/B pricing), note the uncertainty in the trend item summary rather than inventing numbers.
