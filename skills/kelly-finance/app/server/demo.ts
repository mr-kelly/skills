import type { FinanceSnapshot } from "../../lib/types.ts";

export function isDemoQuery(query: Record<string, string | string[]>): boolean {
  return Boolean(query.demo);
}

export function demoSnapshot(lang = "en"): FinanceSnapshot {
  const zh = lang.startsWith("zh");
  const periods = [
    ["2026", 1000000, 700000, 250000, 125350, 318250, 844000, 58250],
    ["2027", 1200000, 840000, 300000, 158100, 475900, 1053500, 85650],
    ["2028", 1440000, 1008000, 360000, 197420, 674480, 1311700, 112180],
    ["2029", 1728000, 1209600, 432000, 247720, 924180, 1629900, 146020],
    ["2030", 2073600, 1451520, 518400, 311980, 1238320, 2022400, 189724],
  ].map(([label, revenue, gross_profit, ebitda, net_income, ending_cash, total_assets, free_cash_flow]) => ({
    label: String(label),
    revenue: Number(revenue),
    gross_profit: Number(gross_profit),
    ebitda: Number(ebitda),
    net_income: Number(net_income),
    ending_cash: Number(ending_cash),
    total_assets: Number(total_assets),
    free_cash_flow: Number(free_cash_flow),
  }));
  return {
    snapshot_id: "finance-demo-20260706",
    generated_at: "2026-07-06T09:00:00.000Z",
    source: "demo",
    company: zh ? "示例科技" : "ExampleCo",
    currency: "USD",
    display_unit: "units",
    model_purpose: zh ? "融资用五年三表预测" : "Five-year fundraising forecast",
    periods,
    metrics: {
      needs_review: 2,
      approved: 1,
      done: 1,
      blocked: 0,
      revenue_cagr: 0.2,
      ending_cash: 1238320,
      free_cash_flow: 189724,
      balance_check: 0,
    },
    checks: [
      {
        id: "check-balance-sheet",
        title: zh ? "资产负债表平衡" : "Balance sheet balances",
        summary: zh ? "所有预测期 assets - liabilities & equity = 0。" : "All forecast periods tie to zero.",
        severity: "info",
        status: "done",
        check_type: "statement_tie",
        evidence: ["2026: $0", "2027: $0", "2028: $0", "2029: $0", "2030: $0"],
        proposed_action: "No action",
        draft: zh ? "保留当前公式，交付前再次刷新检查。" : "Keep current formulas and refresh checks before delivery.",
      },
      {
        id: "check-interest-base",
        title: zh ? "利息费用引用上一期债务" : "Interest expense references prior debt",
        summary: zh
          ? "利息应引用上一期债务余额，避免循环引用。"
          : "Interest should reference prior debt balance to avoid circularity.",
        severity: "warning",
        status: "needs_review",
        check_type: "formula_review",
        evidence: ["Income Statement row Interest expense", "Balance Sheet row Debt"],
        proposed_action: "Review formula",
        draft: zh
          ? "建议确认利息费用使用上一期期末债务作为基数；如需要平均债务法，请在 Assumptions 标注。"
          : "Confirm interest expense uses prior ending debt; if average debt is intended, label the assumption clearly.",
      },
      {
        id: "check-working-capital",
        title: zh ? "营运资本变动勾稽" : "Working capital movement ties",
        summary: zh
          ? "AR、Inventory、AP 的变化与现金流营运资本行一致。"
          : "AR, inventory, and AP changes tie to cash-flow working capital.",
        severity: "info",
        status: "approved",
        check_type: "cash_flow_tie",
        evidence: ["AR days: 45", "Inventory days: 30", "AP days: 35"],
        proposed_action: "Approve",
        draft: zh ? "营运资本公式可交付。" : "Working-capital formulas are ready for delivery.",
      },
      {
        id: "check-scenario-case",
        title: zh ? "缺少 downside 情景" : "Missing downside case",
        summary: zh
          ? "融资模型通常需要 Base / Downside / Upside。"
          : "Fundraising models usually need Base / Downside / Upside cases.",
        severity: "warning",
        status: "needs_review",
        check_type: "model_quality",
        evidence: ["Scenario: Base only"],
        proposed_action: "Request agent to add scenario controls",
        draft: zh
          ? "建议增加 downside 情景：收入增速下降、毛利率下降、回款天数拉长。"
          : "Add a downside case: lower revenue growth, lower gross margin, and slower collections.",
      },
    ],
    warnings: [],
    workbook: {
      last_generated_path: "/tmp/kelly-finance-demo.xlsx",
      tabs: ["Assumptions", "Income Statement", "Balance Sheet", "Cash Flow", "Checks"],
    },
  };
}

export function demoStatePayload(query: Record<string, string | string[]>): Record<string, unknown> {
  const lang = String(query.lang || "en");
  return {
    app: "kelly-finance",
    demo: true,
    data_provider: "demo",
    onboarding: { completed: true, completed_at: "2026-07-06T09:00:00.000Z", config_version: "demo" },
    lock: null,
    config_summary: {
      provider: "demo",
      config_source: "demo",
      company: { name: lang.startsWith("zh") ? "示例科技" : "ExampleCo", base_currency: "USD" },
      secrets_required: false,
    },
    snapshot: demoSnapshot(lang),
  };
}
