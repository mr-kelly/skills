---
name: kelly-portfolio-health
description: Read-mostly App-in-Skill dashboard for a revenue-based-financing (RBF) fund or private-credit book of many small SME contracts. Use when the user invokes $kelly-portfolio-health or /kelly-portfolio-health, wants to check portfolio health, AUM, repayment progress, concentration risk, or a watchlist of contracts with declining revenue. Generic and brand-free — not tied to any specific company or fund.
---

# RBF Portfolio Health Dashboard

## Overview

Use this skill as a local, mostly-read-only dashboard over a mock or
real revenue-share / private-credit book: many small SME (small/medium
enterprise) contracts, each an advance repaid as a share of the SME's future
revenue up to a cap. The app aggregates the book into a top-line health
summary, a repayment-progress-vs-time-elapsed view, an industry/city
concentration breakdown, and a watchlist of contracts with a recent revenue
decline. The only human action is lightweight: flag a contract for review,
clear a flag, or leave a note — everything else is a read view.

Default interaction mode: App UI. Unless the user explicitly asks for
chat-only handling, check onboarding, load/refresh the local portfolio
snapshot, start/reuse the local app with `app/start.sh`, and give the actual
local URL. Use chat-only mode only when the user says "纯聊天", "chat only",
"不要打开 UI", or similar.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Portfolio health overview"></td>
    <td width="50%"><img src="assets/screenshots/concentration.webp" alt="Portfolio concentration"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Total AUM, total collected, weighted-average repayment progress, at-risk count, category allocation, and the contracts most lagging behind their expected repayment pace.</td>
    <td><strong>Concentration</strong><br>Industry/category and city concentration by funding amount and contract count.</td>
  </tr>
  <tr>
    <td colspan="2"><img src="assets/screenshots/watchlist.webp" alt="Portfolio watchlist" width="50%"></td>
  </tr>
  <tr>
    <td colspan="2"><strong>Watchlist</strong><br>Contracts whose most recent month's revenue dropped materially below their trailing average, with a revenue sparkline and a flag-for-review / clear-flag / note action.</td>
  </tr>
</table>

## Boundary

- Read-mostly aggregation and human review flags only. The skill may read a
  portfolio snapshot (mock or a future live source), compute health/risk
  insights, and write local handoff files (`decisions.json`, `onboarding.json`).
- NEVER contact any external system, brokerage, payment processor, or SME
  directly. NEVER move money, disburse funds, or change contract terms. There
  is no transaction path in this skill by design.
- The app reads and writes local files only, and makes no network calls.
- Treat contract-level revenue and repayment data as sensitive. Do not commit
  `config.local.json`, env files, or `app/.data/`.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json`. If absent/incomplete, this
skill's onboarding is intentionally light because the default setup is a
local mock book: confirm the fund name and risk-policy thresholds
(`config.example.json` → `config.local.json`), then seed the demo book with
`npm run seed` (`scripts/generate_demo_snapshot.ts`), which writes ~50
contracts to `app/.data/snapshot.json`. When the user confirms, write
`app/.data/onboarding.json`:

```json
{ "completed": true, "completed_at": "ISO timestamp", "config_version": "1" }
```

Private config priority:

1. `KELLY_PORTFOLIO_HEALTH_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-portfolio-health/config.local.json`
3. `~/.config/kelly-portfolio-health/config.json`
4. `skills/kelly-portfolio-health/config.example.json` as template only

## Local App

Start the dashboard with:

```bash
skills/kelly-portfolio-health/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through
`4000`, or `KELLY_PORTFOLIO_HEALTH_UI_PORT` when set. First run installs
`hono` and `@hono/node-server`; the frontend is zero-build vanilla.

Seed or refresh the mock book at any time with:

```bash
node skills/kelly-portfolio-health/scripts/generate_demo_snapshot.ts [count]
```

and validate a snapshot before trusting it in the UI with:

```bash
node skills/kelly-portfolio-health/scripts/validate_ui_schema.ts app/.data/snapshot.json
```

## Demo Mode

- `?demo=1` opens a deterministic, fully offline mock portfolio (~52
  contracts across 8 categories and 10 cities) with computed insights, for
  documentation and screenshots. It never reads or writes local `.data`
  files.
- `?demo=overview`, `?demo=concentration`, `?demo=watchlist` select named
  demo scenes/routes.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.

UI language: support English and Chinese chrome with `Auto` default.

## Data Provider

- Provider selector env: `KELLY_PORTFOLIO_HEALTH_DATA_PROVIDER=local`
  (default). Reserve `postgres` / `aitable` / `notion` / `busabase` as future
  provider names. See `lib/data-provider/provider-interface.ts` for the
  contract every provider must implement (`readSnapshot`, `readOnboarding`,
  `readConfig`, `readDecisions`, `setDecision`, `readLock`).
- The default `local` provider (`lib/data-provider/local-file-provider.ts`)
  reads/writes local JSON files only.

Read `references/portfolio-schema.md` before editing the app, scripts, or a
new provider. Primary local files:

- `app/.data/snapshot.json`: canonical normalized portfolio snapshot.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/decisions.json`: per-contract flag/note handoff, written only by
  the app's review action.
- `app/.data/agent.lock`: temporary lock while a sync/seed is in progress.
- `config.local.json`: private configuration (fund name, risk thresholds), ignored by git.

## Views

- `#/overview`: total AUM, total collected, weighted-average repayment
  progress, at-risk count, category allocation donut, and the contracts most
  lagging their expected repayment pace.
- `#/contracts`: sortable table (business, category, city, funding amount,
  actual progress, lag, status).
- `#/contracts/<id>`: per-contract detail — funding/cap/collected, expected
  vs. actual progress, a revenue sparkline, and the flag/note action.
- `#/concentration`: funding-amount concentration by category and city.
- `#/watchlist`: contracts with a recent revenue decline, each with a
  sparkline and a flag-for-review / clear-flag action.
- `#/settings`: sanitized configuration summary — data provider, fund name,
  base currency, and risk-policy thresholds.

## Safety

- Read-mostly by design; the only writes are the human flag/note action and
  the seed script's mock snapshot.
- Do not invent real company names or real revenue data — this skill ships
  with a synthetic, brand-free mock book only.
- Keep local exports minimal and use stable contract ids so repeated
  seeds/syncs stay idempotent for review state.
## Execution reports

Re-read the active provider's decisions immediately before any approved execution. Record each concrete operation, target, status, timestamp, and error in the provider-backed execution report; keep app actions local-only.
