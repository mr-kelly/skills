---
name: kelly-revshare-simulator
description: Revenue-Share Contract Simulator App-in-Skill — a control-panel/workspace for a deal analyst to model revenue-based-financing (RBF) deals for SME businesses (retail/F&B chain stores). Use when the user invokes $kelly-revshare-simulator or /kelly-revshare-simulator, wants to model a revenue-share or merchant-cash-advance deal, project cash flow and repayment, compute a Cash-Flow Payout Multiple, effective annualized merchant cost, or compare/underwrite multiple financing scenarios. Pure deterministic math, no external calls, no real trading/payment side effects.
---

# Revenue-Share Contract Simulator

## Overview

Use this skill as a local control-panel/workspace App-in-Skill for modeling
revenue-based-financing (RBF) deals: a funder advances a principal to an SME
business (e.g. a bubble tea, gym, or hotpot restaurant chain) in exchange for
a share of monthly revenue until a repayment cap multiple is reached or the
term ends. The app lets a deal analyst tune inputs, see the projected cash
flow and cumulative repayment, and record an underwriting decision per named
scenario — then save several scenarios for side-by-side comparison.

This is generic, brand-free tooling: business names in seed data are
placeholder archetypes (bubble tea chain, gym chain, hotpot restaurant), not
real companies.

Default interaction mode: App UI. Unless the user explicitly asks for
chat-only handling, start/reuse the local app with `app/start.sh` and give the
actual local URL. Use chat-only mode only when the user says "纯聊天", "chat
only", "不要打开 UI", or similar.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Revenue-Share Simulator overview"></td>
    <td width="50%"><img src="assets/screenshots/scenario-detail.webp" alt="Revenue-Share Simulator scenario detail"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Portfolio-level summary across saved scenarios: average effective cost, flagged deals, and deals still needing an underwriting decision.</td>
    <td><strong>Scenario detail</strong><br>Cash-flow/cumulative-repayment chart, Cash-Flow Payout Multiple, effective annualized merchant cost, risk flags, and the decision panel.</td>
  </tr>
  <tr>
    <td colspan="2" width="100%"><img src="assets/screenshots/comparison.webp" alt="Revenue-Share Simulator comparison"></td>
  </tr>
  <tr>
    <td colspan="2"><strong>Comparison</strong><br>Side-by-side table of selected scenarios' inputs, projected repayment, payout multiple, effective cost, and decisions.</td>
  </tr>
</table>

## Boundary

- Pure deterministic math over analyst-supplied inputs. The app never fetches
  live revenue, banking, or payment data, and never disburses, transfers, or
  moves money.
- The app reads and writes local files only (`app/.data/scenarios.json`).
- Risk flags are neutral, rule-based observations — never automated
  approve/reject decisions. A human always makes the underwriting call.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json`. If absent/incomplete, ask
the user to confirm the base currency and underwriting policy thresholds
(max effective annual cost, cap-multiple range, max term), then write
`app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

Private config priority:

1. `KELLY_REVSHARE_SIMULATOR_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-revshare-simulator/config.local.json`
3. `~/.config/kelly-revshare-simulator/config.json`
4. `skills/kelly-revshare-simulator/config.example.json` as template only

No secrets are required — this skill has no external accounts to connect.

## Local App

Start the app with:

```bash
skills/kelly-revshare-simulator/app/start.sh
```

Seed 3-4 example scenarios (bubble tea chain, gym chain, hotpot restaurant,
one deliberately risky example that trips the risk flags) with:

```bash
node skills/kelly-revshare-simulator/scripts/generate_batch.ts
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`,
or `KELLY_REVSHARE_SIMULATOR_UI_PORT` when set. First run installs `hono` and
`@hono/node-server`; the frontend is zero-build vanilla.

## Demo Mode

- `?demo=1` opens a deterministic, fully offline mock batch of four scenarios
  for documentation and screenshots.
- `?demo=scenarios` and `?demo=comparison` select named mock scenes;
  `?demo=detail` opens the first mock scenario's detail pane.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses never read or write local scenario files.

UI language: support English and Chinese chrome with `Auto` default.

## Domain Model

Inputs per scenario (`lib/simulate.ts` `ScenarioInput`):

- `business_type`, `avg_monthly_revenue`, `revenue_volatility_pct`
- `principal` (proposed advance)
- `initial_share_rate_pct` (revenue share until breakeven)
- `step_down_share_rate_pct` (reduced share rate after principal is recovered)
- `repayment_cap_multiple` (e.g. 1.5x principal — the total obligation cap)
- `term_months`

Computed (`ScenarioResult`):

- `monthly[]`: month-by-month revenue, share rate, payment, cumulative
  repayment, and breakeven/cap flags.
- `cash_flow_payout_multiple`: a P/E-like ratio — principal ("price") divided
  by the annualized repayment cash flow ("earnings"). Lower is faster payback
  for the funder.
- `effective_annual_cost_pct`: the annualized cost implied by paying back
  `total_repayment` over the months elapsed, expressed like an APR.
- `risk_flags[]`: `cap_not_reached`, `merchant_cost_too_high`,
  `high_revenue_volatility`, `thin_term_buffer` — deterministic, rule-based,
  never automated decisions.

Read `references/ui-schema.md` before editing the app, scripts, or
`lib/simulate.ts`.

## Data Provider

- Provider selector env: `KELLY_REVSHARE_SIMULATOR_DATA_PROVIDER=local`
  (default). Reserve `postgres`, `aitable`, `notion`, `busabase` for future
  shared/multi-analyst backends.
- Primary local files:
  - `app/.data/scenarios.json`: the scenario batch (canonical).
  - `app/.data/onboarding.json`: onboarding completion marker.
  - `app/.data/agent.lock`: temporary lock while the app writes.
  - `config.local.json`: private configuration, ignored by git.

Use `scripts/validate_ui_schema.ts app/.data/scenarios.json` before relying on
a batch in the UI.

## Views

- `#/overview`: portfolio-level metrics and the list of scenarios still
  needing a decision.
- `#/scenarios`: filterable scenario list (`All`, `Undecided`, `Approved`,
  `Needs Revision`, `Rejected`).
- `#/scenarios/new`: new scenario input form.
- `#/scenarios/<id>`: cash-flow chart, computed metrics, risk flags, editable
  inputs, and the underwriting decision panel.
- `#/comparison`: pick multiple saved scenarios for a side-by-side table.
- `#/settings`: sanitized config summary and underwriting policy thresholds.

## Safety

- Never invent live revenue/banking data; all inputs are analyst estimates
  entered in the UI.
- Keep `app/.data/` (real deal data) out of git; only `config.example.json`
  and seed-script output are meant to be shared/demo data.
- Risk flags and computed metrics are informational only — this skill never
  auto-approves or auto-rejects a deal.
## Execution reports

Re-read the active provider's decisions immediately before any approved execution. Record each concrete operation, target, status, timestamp, and error in the provider-backed execution report; keep app actions local-only.
