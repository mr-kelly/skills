---
name: kelly-ads
license: MIT
description: Personal App-in-Skill ad-campaign command desk (投放指挥台) for a cross-border e-commerce seller running Amazon Ads, Meta (FB/IG), TikTok Ads, and Google Ads. Use when the user invokes $kelly-ads or /kelly-ads, or asks about 投放, ad campaigns, ad spend, ACOS, ROAS, Amazon Ads, TikTok ads, Meta ads, Google Ads, search terms, negative keywords, bid adjustment, budget pacing, CPC spikes, rejected ads, ad anomaly detection, 广告优化, or reviewing agent-proposed adjustment cards (negative keyword, bid down/up, pause target, budget shift, creative refresh).
---

# Kelly Ads

## Overview

Use this skill as Kelly's ad-campaign command desk. It aggregates spend and performance from Amazon Ads, Meta (FB/IG), TikTok Ads, and Google Ads into one file-backed App-in-Skill board (spend, impressions, clicks, conversions, revenue, ROAS, ACOS per campaign), detects anomalies deterministically (ACOS above target for N days, budget exhausted before day end, high-spend zero-conversion search terms/creatives, sudden CPC spikes, paused/rejected campaigns), and turns them into agent-proposed adjustment cards with evidence and expected impact. The human approves; the agent executes approved adjustments outside the app via the platform APIs.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh the ads snapshot with the ingest/check scripts, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; then present numbered adjustment cards (`Adjustment #1`) and take verdicts in chat.

## Boundary

- Report ingestion is read-only: the agent pulls platform reports (API pulls, report exports, or pasted CSVs) outside the app and feeds them to `scripts/ingest_reports.mjs`. Nothing in this skill mutates a platform on its own.
- The app reads and writes local files only. It must not call platform APIs, change bids, budgets, keywords, or creatives, or touch any network beyond `127.0.0.1`.
- Every bid/budget/keyword/creative mutation is approval-required and executed by the agent outside the app, only after the matching adjustment card is `approved`. `scripts/execute_decisions.mjs` is a dry-run planner, never an executor.
- Ad account credentials live only in local env files referenced by name from private config (`*_env` keys). Never store tokens in the repo or paste them into chat.
- Do not commit `config.local.json`, env files, `app/.data/`, report exports, or raw platform responses.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before ingesting real data.

Private config priority:

1. `KELLY_ADS_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-ads/config.local.json`
3. `~/.config/kelly-ads/config.json`
4. `skills/kelly-ads/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_ADS_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-ads/.env.local`
5. `~/.config/kelly-ads/.env`

Onboarding asks, turn by turn: which platforms are live and their display-safe account ids (Amazon entity/profile, Meta `act_…`, TikTok advertiser id, Google customer id), which env var names hold the tokens, ACOS/ROAS targets (default plus per-platform or per-product overrides), anomaly thresholds (breach days, zero-conversion spend floor, CPC spike %, budget pace), and the base currency plus rates for any other report currencies. Ask for non-secret details only; secrets go into local env files, never chat.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the command desk with:

```bash
skills/kelly-ads/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or `KELLY_ADS_UI_PORT` when set. `/api/state` reports `app: "kelly-ads"`.

Required app views:

- `#/overview`: ads command desk. Human-attention panel (adjustments to approve, critical anomalies, budget at risk today), KPI cards (spend MTD vs last month, blended ROAS, blended ACOS vs target, conversions), per-platform mini-cards with badges, a 14-day spend-vs-revenue daily bar chart (inline SVG, no chart library), a worst-offenders list (highest-spend zero-conversion targets), data freshness per platform, and recent sync activity.
- `#/campaigns` and `#/campaigns/<id>`: campaign table with name, platform badge, product/SKU, status (active/paused/rejected), daily budget + % spent today, spend 7d, ROAS, ACOS vs target (color-coded), and trend arrow. Detail shows the daily spend/ROAS series (inline SVG), the search terms/audiences/creatives table with per-row metrics, linked anomalies, and adjustment history.
- `#/alerts`: anomaly feed with severity badge, type badge (acos_breach/budget_exhausted/zero_conversion_spend/cpc_spike/rejected), campaign + platform, one-line evidence, age, state (open/actioned/dismissed/resolved), and a link to the adjustment card when one exists.
- `#/adjustments` and `#/adjustments/<id>`: the review queue with workflow states `needs_review`, `changes_requested`, `approved`, `done`, `blocked`. Each card shows a stable ref (`Adjustment #1`), type badge (negative_keyword/bid_down/bid_up/pause_target/budget_shift/creative_refresh), target, current → proposed value, reason with evidence, expected impact, an editable `Review note`, and decision buttons (approve / request changes / block). `done` means executed, backed by an execution record. Decisions are rejected with HTTP 423 while `agent.lock` exists.
- `#/settings`: sanitized config summary. Platforms with display-safe account ids and token `*_env` readiness booleans, ACOS/ROAS targets, anomaly thresholds, currency, data provider name, and onboarding state. Never expose secret values.

Demo mode:

- `?demo=1` opens a deterministic mock command desk for documentation and screenshots.
- `?demo=overview`, `?demo=campaigns`, `?demo=alerts`, `?demo=adjustments`, and `?demo=detail` select named mock scenes (persona: "Nimbus Home", a home/kitchen gadget seller).
- `lang=en` or `lang=zh` forces UI chrome language; with `lang=zh` the demo reasons, evidence, impact estimates, and summaries are meaningfully localized for Chinese screenshots (campaign names may keep English product names).
- Demo API responses never read or write files under `app/.data/`, and demo decisions are never persisted.

UI language: support English and Chinese chrome with `Auto` default. Keep campaign names, search terms, SKUs, and platform data in their original language.

## File Contract

Read `references/ads-schema.md` before editing the app, scripts, or any generated ads JSON.

Primary local files:

- `app/.data/ads_snapshot.json`: canonical snapshot (platforms, campaigns with daily series and targets, anomalies, adjustments, metrics, sync_log).
- `app/.data/decisions.json`: user verdicts keyed by adjustment id.
- `app/.data/agent_tasks.json`: queued agent work from `request_changes` verdicts. Poll this to pick up revisions.
- `app/.data/execution_report.json`: planned operations from `execute_decisions.mjs` (dry-run, handoff to agent).
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill ingests/checks/rewrites files; the adjustments queue honors it (HTTP 423 on POST while locked).
- `config.local.json`: private platform configuration, ignored by git.

Use `scripts/validate_ui_schema.mjs app/.data/ads_snapshot.json` before relying on a snapshot in the UI. The app shows an empty setup state when no snapshot exists.

## Sync Workflow

Data collection is agent-driven on invocation — there is NO cron and the app never fetches anything itself.

1. Detect mode. Default to App UI.
2. Load private config through the store helpers. If only `config.example.json` exists, enter onboarding.
3. When the user asks for fresh numbers (or the snapshot is stale), gather report data per platform outside the app: pull via the platform reporting APIs with the configured credentials, download report exports, or accept a CSV the user pasted/dropped.
4. Feed everything through the single write path:
   - `node scripts/ingest_reports.mjs payload.json` — normalized JSON performance payload (shape documented in the script header).
   - `node scripts/ingest_reports.mjs --csv report.csv --platform amazon [--campaign <id>]` — raw platform CSV export, columns mapped via `config.csv_mappings.<platform>`; the built-in parser handles quoted fields with embedded commas.
   - The script validates, converts currencies via `config.currency_rates`, merges daily series by campaign+date (idempotent re-ingest), updates platform freshness, and appends the sync log.
5. Every script acquires `app/.data/agent.lock` before writing and releases it after; scripts refuse to run over a foreign lock.
6. Validate the snapshot, start/reuse the UI, and report the URL plus what needs a decision.

## Check Workflow

1. After ingest, run `node scripts/run_checks.mjs`. It reads thresholds from config and detects, deterministically:
   - `acos_breach`: campaign ACOS above target for N consecutive spend days (`thresholds.acos_breach_days`).
   - `budget_exhausted`: daily budget spent to `thresholds.budget_exhausted_pct` before day end.
   - `zero_conversion_spend`: an enabled target at or above `thresholds.zero_conversion_spend_floor` in 14-day spend with 0 conversions.
   - `cpc_spike`: latest-day CPC at least `thresholds.cpc_spike_pct` above the trailing mean.
   - `rejected`: campaign or creative rejected by the platform.
2. Anomalies are upserted with stable ids: re-detection refreshes evidence, cleared conditions auto-resolve, `dismissed` stays dismissed. Re-running without data changes is idempotent.
3. New critical anomalies without a linked card get a skeleton adjustment card (`needs_review`). Enrich each skeleton before asking for approval: re-ingest with better evidence, write the concrete `current_value` → `proposed_value`, and a numeric `expected_impact`.

## Adjustment Workflow

1. The user reviews adjustment cards in `#/adjustments` (or by `Adjustment #N` in chat) and gives verdicts: approve, request changes (with a note), or block. Notes save to `decisions.json` and the snapshot.
2. `request_changes` enqueues the card in `app/.data/agent_tasks.json`. Poll it, revise the card (new evidence, resized proposal), set it back to `needs_review`, and clear the task.
3. For approved cards, run `node scripts/execute_decisions.mjs` to write `execution_report.json` with concrete planned operations (`add_negative_keyword` with term + campaign id, `set_bid` current → new, `pause_target`, `shift_budget` from → to, `refresh_creative`) — all `dry_run: true` and `handoff_to_agent: true`, no external side effects.
4. Re-read decisions immediately before executing. Execute approved operations outside the app via the platform APIs with the user's credentials, then mark the card `done` in the snapshot with an `execution` record and append a sync-log entry.
5. If a target is missing (no account id, no term text, no destination campaign), block and ask for configuration instead of guessing.

## Safety Defaults

- Treat every bid change, budget change, keyword/negative change, pause/enable, and creative swap as approval-required; anything spending money is never automatic.
- Prefer read-only reporting scopes for tokens where the platform offers them.
- Redact tokens and token-like strings in logs, reports, and UI state; expose only env-var readiness booleans and display-safe account ids.
- Keep stable ids (`campaign_id`, `target_id`, `anomaly_id`, `adjustment_id`, `ref`) so repeated ingests, checks, and executions are idempotent.
- If report numbers look inconsistent (spend without impressions, revenue with zero conversions), surface a warning and ask; do not invent corrections.
