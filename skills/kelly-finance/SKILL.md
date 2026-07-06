---
name: kelly-finance
description: Build, analyze, repair, and audit finance three-statement models and operating forecasts. Use when the user invokes $kelly-finance, asks for 财务三表, 三表模型, income statement, balance sheet, cash flow statement, forecast model, budget model, financial projections, FP&A model, SaaS/unit economics forecast, fundraising model, board finance pack, investor model, model checks, balance-sheet balancing, cash runway, working capital, capex/depreciation schedules, debt schedules, scenario/sensitivity cases, or Excel/Sheets-ready finance outputs.
---

# Kelly Finance

## Overview

Use this skill as a practical FP&A and corporate-finance modeling desk. It builds clean three-statement models, turns assumptions into forecast tables, audits model logic, and explains finance outputs in English or Chinese.

For spreadsheet file creation or editing, also use the local spreadsheet/xlsx tooling if available. This skill owns the finance logic, modeling structure, checks, and presentation standard.

## Default Workflow

1. Clarify the model purpose only when needed: fundraising, board reporting, budget, acquisition, cash runway, lender package, or operating plan.
2. Identify the business model: SaaS, marketplace, ecommerce, services, consumer app, asset-heavy, or generic operating company.
3. Ask for missing high-impact inputs, but proceed with clearly labeled assumptions when the user wants speed.
4. Build or review the three statements in this order: assumptions, income statement, balance sheet, cash flow, checks.
5. Keep formulas auditable: drivers on assumptions tabs, calculations in schedules/statements, no hardcoded constants hidden inside formulas.
6. Add checks before presenting: balance sheet balances, cash roll-forward ties, net income flows to retained earnings, depreciation ties to PP&E, debt schedule ties to interest/debt balances, and working capital changes tie to balance-sheet movements.
7. Summarize key outputs: revenue, gross margin, EBITDA, net income, ending cash, cash runway, debt, free cash flow, and any broken checks.

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
