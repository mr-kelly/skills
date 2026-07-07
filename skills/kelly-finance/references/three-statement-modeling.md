# Three-Statement Modeling Reference

## Fast Input Checklist

Ask for only the inputs needed for the decision at hand. Useful defaults can be assumed when the user wants a quick model.

- Time scale: monthly, quarterly, or annual.
- Forecast horizon and first forecast period.
- Currency and display unit: units, thousands, or millions.
- Historical revenue, gross margin, opex, EBITDA, net income, cash, debt, and working capital if available.
- Revenue drivers: customers, price, volume, usage, take rate, retention, growth rate, or sales capacity.
- Cost drivers: COGS, payroll, marketing, G&A, hosting, fulfillment, or other variable costs.
- Working capital: AR days, inventory days, AP days, deferred revenue, prepaid expenses, accrued expenses.
- Capex and depreciation policy.
- Debt, interest, repayments, new financing, dividends, and tax rate.

## Statement Linkage Rules

- Net income from the income statement starts the cash-flow statement.
- Depreciation/amortization is an expense on the income statement and an add-back in operating cash flow.
- Capex is a cash-flow outflow and increases gross/fixed assets before depreciation.
- Ending cash on the cash-flow statement equals cash on the balance sheet.
- Retained earnings/equity roll forward by net income minus dividends and owner distributions.
- Debt balances roll forward by new debt minus repayments; interest should reference average or beginning debt unless a circular model is intentionally enabled.
- Working-capital cash flow should equal the negative change in operating current assets plus the positive change in operating current liabilities.

## Required Checks

Every serious model should include these checks:

- Balance sheet: total assets minus total liabilities and equity equals zero.
- Cash roll-forward: beginning cash plus net change in cash equals ending cash.
- Net income tie: income statement net income equals cash-flow starting net income.
- PP&E tie: beginning PP&E plus capex minus depreciation equals ending PP&E.
- Debt tie: beginning debt plus issuance minus repayment equals ending debt.
- Retained earnings/equity tie: beginning equity plus net income minus dividends equals ending equity.
- Sign sanity: revenue positive, expenses negative or clearly labeled, capex negative in cash flow, debt repayment negative in cash flow.

## Output Quality Bar

- Put drivers in an assumptions/schedule area, not hidden inside statement formulas.
- Use consistent period labels across all statements.
- Keep formulas horizontally consistent across forecast years.
- Include units, currency, model date, and scenario name.
- Do not hide plug rows. If a temporary plug is unavoidable, label it `Temporary balancing item` and call it out in the summary.
- Prefer simple, inspectable formulas over clever compact formulas.

## Useful Scenarios

- Base case: management's most likely operating plan.
- Downside case: slower revenue, lower gross margin, longer receivable collection, tighter financing.
- Upside case: faster revenue, operating leverage, improved working capital.
- Cash conservation case: reduced hiring/marketing/capex and delayed discretionary spend.

## Chinese Finance Labels

Common bilingual labels:

- Income Statement: 利润表 / 损益表
- Balance Sheet: 资产负债表
- Cash Flow Statement: 现金流量表
- Revenue: 收入
- Cost of Goods Sold / COGS: 销售成本
- Gross Profit: 毛利
- Operating Expenses / Opex: 运营费用
- EBITDA: 息税折旧摊销前利润
- Depreciation and Amortization: 折旧与摊销
- EBIT: 息税前利润
- Net Income: 净利润
- Accounts Receivable: 应收账款
- Inventory: 存货
- Accounts Payable: 应付账款
- Capital Expenditure / Capex: 资本开支
- Working Capital: 营运资本
- Free Cash Flow: 自由现金流
