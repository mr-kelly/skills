---
name: kelly-finance
description: Build, analyze, repair, and audit finance three-statement models and operating forecasts. Use when the user invokes $kelly-finance, asks for 财务三表, 三表模型, income statement, balance sheet, cash flow statement, forecast model, budget model, financial projections, FP&A model, SaaS/unit economics forecast, fundraising model, board finance pack, investor model, model checks, balance-sheet balancing, cash runway, working capital, capex/depreciation schedules, debt schedules, scenario/sensitivity cases, or Excel/Sheets-ready finance outputs.
---

# Kelly Finance

## Overview

Use this skill as a practical FP&A and corporate-finance modeling desk. It builds clean three-statement models, turns assumptions into forecast tables, audits model logic, and explains finance outputs in English or Chinese.

For spreadsheet file creation or editing, also use the local spreadsheet/xlsx tooling if available. This skill owns the finance logic, modeling structure, checks, and presentation standard.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, generate or load the local model snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

## Boundary

- The skill may build local workbooks, inspect local workbook/export files, normalize assumptions, write local model snapshots, and draft model-review recommendations.
- The app reads and writes local files only. It must not connect to banks/accounting systems, send files, mutate ERP records, move money, or change external systems.
- Treat financial models and assumptions as sensitive. Do not commit `config.local.json`, env files, `app/.data/`, private workbook exports, statements, customer/vendor data, or execution reports.
- Any external action, such as sending a model to investors or changing source-of-truth books, is approval-required and executed outside the app by the agent after human review.

## Local App

Start the model review desk with:

```bash
skills/kelly-finance/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring ports `3000` through `4000`, or `KELLY_FINANCE_UI_PORT` when set.

Views:

- `#/overview`: model KPI dashboard, forecast table, and top model checks.
- `#/checks` and `#/checks/<id>`: review queue for formula ties, model quality issues, and delivery notes. Users can approve, request changes, block, or dismiss each check.
- `#/workbook`: generated workbook path and tab contract.
- `#/settings`: sanitized config summary, onboarding marker, lock, and data provider.

Demo mode:

- `?demo=1` opens a deterministic offline model for screenshots and review.
- `lang=en` or `lang=zh` forces UI chrome language.
- Demo responses never read or write files under `app/.data/`; demo decisions stay in the browser.

## File Contract

Read `references/finance-ui-schema.md` before editing the app, scripts, or generated model snapshots.

Primary local files:

- `app/.data/model_snapshot.json`: canonical model dashboard and check queue.
- `app/.data/decisions.json`: user verdicts and notes keyed by check id.
- `app/.data/agent_tasks.json`: queued agent work for `changes_requested` checks.
- `app/.data/execution_report.json`: dry-run/apply handoff report for approved checks.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill generates or executes.
- `config.local.json`: private company/model defaults, ignored by git.

Use `node scripts/validate_ui_schema.ts app/.data/model_snapshot.json` before relying on a snapshot in the UI.

## Default Workflow

1. Clarify the model purpose only when needed: fundraising, board reporting, budget, acquisition, cash runway, lender package, or operating plan.
2. Identify the business model: SaaS, marketplace, ecommerce, services, consumer app, asset-heavy, or generic operating company.
3. Ask for missing high-impact inputs, but proceed with clearly labeled assumptions when the user wants speed.
4. Build or review the three statements in this order: assumptions, income statement, balance sheet, cash flow, checks.
5. Keep formulas auditable: drivers on assumptions tabs, calculations in schedules/statements, no hardcoded constants hidden inside formulas.
6. Add checks before presenting: balance sheet balances, cash roll-forward ties, net income flows to retained earnings, depreciation ties to PP&E, debt schedule ties to interest/debt balances, and working capital changes tie to balance-sheet movements.
7. Summarize key outputs: revenue, gross margin, EBITDA, net income, ending cash, cash runway, debt, free cash flow, and any broken checks.
8. Start/reuse the App UI and route the user to `#/checks` for human review unless the user asked for chat-only.

## Create A Three-Statement Template

Use `scripts/build_three_statement_model.py` for a dependency-free Excel starter model:

```bash
python3 skills/kelly-finance/scripts/build_three_statement_model.py \
  --output /tmp/three_statement_model.xlsx \
  --company "ExampleCo" \
  --start-year 2026 \
  --years 5 \
  --currency USD \
  --base-revenue 1000000
```

The script creates an `.xlsx` workbook with:

- `Assumptions`: operating, working-capital, capex, debt, tax, dividend, and opening balance assumptions.
- `Income Statement`: revenue through net income.
- `Balance Sheet`: cash, working capital, PP&E, debt, equity, and balance check.
- `Cash Flow`: CFO, capex, financing, dividends, and ending cash.
- `Checks`: high-level model-integrity checks.

After generating, open or inspect the workbook when possible. If the user needs a polished investor-facing model, add formatting, scenario cases, and relevant operating schedules after the starter model is created.

## Review Or Repair A Model

When reviewing an existing workbook:

- Preserve user formulas and formatting unless asked to rebuild.
- First map sheets, time axis, linked statements, hardcodes, and check rows.
- Find the actual source of a mismatch before changing formulas.
- Use a separate `Checks` or `Audit` tab if the workbook lacks one.
- Never force a balance-sheet plug without labeling it and explaining why it is temporary.

Use `references/three-statement-modeling.md` for the review checklist, forecast-driver conventions, and model quality bar.

## Modeling Standards

- Use positive revenue and expense rows with clear sign labels; cash-flow outflows should be negative.
- Separate historical actuals from forecast periods when actuals are supplied.
- Use named scenarios or assumption columns for base/downside/upside cases instead of duplicating whole models.
- State whether currency values are units, thousands, or millions.
- Mark estimates as assumptions, not facts.
- Treat user financial data as sensitive. Do not commit private models, exports, statements, or customer/vendor-level finance data.

## Common Outputs

- Three-statement forecast workbook.
- Lightweight cash runway model.
- Monthly budget or annual operating plan.
- SaaS metrics pack: ARR, MRR, churn, NRR, CAC, LTV, gross margin, burn, runway.
- Board/investor finance summary.
- Model audit report with broken checks and recommended fixes.
