// Domain model for Kelly Finance's three-statement model review desk, ported
// verbatim (same variable names, same order of operations, only TS types
// stripped) from the retired lib/types.ts and
// lib/data-provider/local-file-provider.ts. A "check" is one model-audit
// review item (a formula tie, a model-quality issue, a delivery note); the
// review queue metrics (needs_review/approved/done/blocked counts) are
// recomputed client-side from the checks on every read, exactly like the
// retired recalc() did — unlike the check queue, a check's own `status` is
// still stored directly (set by the reviewer's decision), never derived.
//
// Architectural change from the retired local-file shape: a reviewer's
// decision now lives directly on the check's own Busabase record (decision
// fields alongside the raw check fields) instead of a separate
// decisions.json bucket keyed by check id — same pattern used across this
// batch of Busabase-only conversions (see kelly-disclosure-tracker,
// kelly-deal-scorer). Kelly Finance never had a busabase-provider.ts to
// carry forward, so this Base design (model / checks / settings) is new.

export const VALID_ACTIONS = new Set(["approve", "request_changes", "block", "dismiss"]);

// Ported verbatim from the status ternary chain inside applyDecision() in
// the retired lib/data-provider/local-file-provider.ts. Returns null for an
// action outside VALID_ACTIONS, meaning "keep the check's current status" —
// callers should validate the action against VALID_ACTIONS first.
export function statusForAction(action = "") {
  return action === "approve"
    ? "approved"
    : action === "request_changes"
      ? "changes_requested"
      : action === "block"
        ? "blocked"
        : action === "dismiss"
          ? "done"
          : null;
}

// Ported verbatim from recalc() in the retired local-file-provider.ts: the
// needs_review count also includes changes_requested checks (a check
// returned to the agent for revision still needs a human to eventually
// re-decide it), while approved/done/blocked are exact status counts.
export function computeMetricsFromChecks(checks = []) {
  return {
    needs_review: checks.filter((item) => item.status === "needs_review" || item.status === "changes_requested").length,
    approved: checks.filter((item) => item.status === "approved").length,
    done: checks.filter((item) => item.status === "done").length,
    blocked: checks.filter((item) => item.status === "blocked").length,
  };
}

// Simple, universally-defined arithmetic over an already-computed periods
// array (CAGR across the first/last period, ending cash/free cash flow are
// just the last period's own values) — NOT a reimplementation of the actual
// three-statement modeling math (balance-sheet balancing, schedule
// amortization) that scripts/build_three_statement_model.py owns. Used only
// to keep the dashboard's headline metrics in sync when an agent supplies a
// freshly computed `periods` array without also supplying metrics.
export function deriveModelMetrics(periods = []) {
  if (!periods.length) return { revenue_cagr: 0, ending_cash: 0, free_cash_flow: 0 };
  const first = periods[0];
  const last = periods[periods.length - 1];
  const years = periods.length - 1;
  const revenue_cagr =
    years > 0 && Number(first.revenue) > 0 ? (Number(last.revenue) / Number(first.revenue)) ** (1 / years) - 1 : 0;
  return {
    revenue_cagr,
    ending_cash: Number(last.ending_cash) || 0,
    free_cash_flow: Number(last.free_cash_flow) || 0,
  };
}

function parseJsonArray(value = "") {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value = "") {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Normalizes a Busabase `checks` row (already snake_cased by the provider)
// into the structured check shape (evidence parsed from JSON, decision
// assembled from decision_action/decision_comment/decided_at). Mirrors
// computeItemFromRow() in kelly-disclosure-tracker's tracker-model.js.
export function computeCheckFromRow({
  check_id = "",
  title = "",
  summary = "",
  severity = "info",
  status = "needs_review",
  check_type = "",
  evidence = "",
  proposed_action = "",
  draft = "",
  decision_action = "",
  decision_comment = "",
  decided_at = "",
} = {}) {
  const decision = decision_action
    ? { action: decision_action, comment: decision_comment || "", decided_at: decided_at || "" }
    : undefined;
  return {
    id: check_id,
    title,
    summary,
    severity,
    status,
    check_type,
    evidence: parseJsonArray(evidence),
    proposed_action,
    draft,
    decision,
  };
}

// Normalizes a Busabase `model` row into the structured model shape the app
// renders (periods/warnings/workbook.tabs parsed from JSON, metrics grouped).
export function computeModelFromRow({
  snapshot_id = "",
  generated_at = "",
  source = "local",
  company = "",
  currency = "USD",
  display_unit = "units",
  model_purpose = "",
  periods = "",
  revenue_cagr = 0,
  ending_cash = 0,
  free_cash_flow = 0,
  balance_check = 0,
  warnings = "",
  workbook_path = "",
  workbook_tabs = "",
} = {}) {
  return {
    snapshot_id,
    generated_at,
    source,
    company,
    currency,
    display_unit,
    model_purpose,
    periods: parseJsonArray(periods),
    metrics: {
      revenue_cagr: Number(revenue_cagr) || 0,
      ending_cash: Number(ending_cash) || 0,
      free_cash_flow: Number(free_cash_flow) || 0,
      balance_check: Number(balance_check) || 0,
    },
    warnings: parseJsonArray(warnings),
    workbook: { last_generated_path: workbook_path, tabs: parseJsonArray(workbook_tabs) },
  };
}

// Assembles the full FinanceSnapshot shape the UI renders, mirroring the
// retired FinanceSnapshot interface exactly (lib/types.ts) so app.js needs
// no view-layer changes beyond the data source. `model` must already be
// normalized (computeModelFromRow); `checks` must already be normalized
// (computeCheckFromRow). The needs_review/approved/done/blocked counts are
// always recomputed from `checks` (recalc()'s job); the other metrics
// (revenue_cagr/ending_cash/free_cash_flow/balance_check) are carried
// through from the model row as written by the trusted build script or an
// agent review, never recomputed here.
export function assembleSnapshot({ model = null, checks = [] } = {}) {
  const base = model || {
    snapshot_id: "empty",
    generated_at: "",
    source: "local",
    company: "Unconfigured model",
    currency: "USD",
    display_unit: "units",
    model_purpose: "Setup required",
    periods: [],
    metrics: { revenue_cagr: 0, ending_cash: 0, free_cash_flow: 0, balance_check: 0 },
    warnings: ["No model has been generated yet. Run scripts/build_three_statement_model.mjs or build one in chat."],
    workbook: { tabs: [] },
  };
  return {
    ...base,
    metrics: { ...computeMetricsFromChecks(checks), ...base.metrics },
    checks,
  };
}

function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

// Sanitized config summary, ported from getConfigSummary() in the retired
// local-file-provider.ts (secrets_required is always false — Kelly Finance
// only ever holds non-secret company/model defaults).
export function buildConfigSummary(settingsRows = []) {
  const configRow = findSettingsRow(settingsRows, "config");
  const config = parseJsonObject(configRow?.payload);
  return {
    provider: "busabase",
    config_source: configRow ? "busabase" : "defaults",
    company: config.company || null,
    model_defaults: config.model_defaults || null,
    secrets_required: false,
  };
}

// Deterministic, explicitly-labeled demo dataset — ported verbatim (same
// fixed timestamp, same period/check figures) from the retired
// app/server/demo.ts's demoSnapshot(). Shared by js/providers/demo-provider.js
// so the offline ?demo= scenario always matches what the retired server used
// to return.
export function demoSnapshot(lang = "en") {
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
  const checks = [
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
  ];
  const model = {
    snapshot_id: "finance-demo-20260706",
    generated_at: "2026-07-06T09:00:00.000Z",
    source: "demo",
    company: zh ? "示例科技" : "ExampleCo",
    currency: "USD",
    display_unit: "units",
    model_purpose: zh ? "融资用五年三表预测" : "Five-year fundraising forecast",
    periods,
    metrics: {
      revenue_cagr: 0.2,
      ending_cash: 1238320,
      free_cash_flow: 189724,
      balance_check: 0,
    },
    warnings: [],
    workbook: {
      last_generated_path: "/tmp/kelly-finance-demo.xlsx",
      tabs: ["Assumptions", "Income Statement", "Balance Sheet", "Cash Flow", "Checks"],
    },
  };
  return assembleSnapshot({ model, checks });
}
