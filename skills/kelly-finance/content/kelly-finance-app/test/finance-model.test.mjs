import assert from "node:assert/strict";
import test from "node:test";

import {
  VALID_ACTIONS,
  assembleSnapshot,
  buildConfigSummary,
  computeCheckFromRow,
  computeMetricsFromChecks,
  computeModelFromRow,
  demoSnapshot,
  deriveModelMetrics,
  statusForAction,
} from "../app/js/finance-model.js";

test("statusForAction maps every valid action, ported verbatim from applyDecision()'s ternary chain", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("dismiss"), "done");
  assert.equal(statusForAction("unknown"), null);
  assert.equal(statusForAction(), null);
});

test("VALID_ACTIONS matches the four decision buttons in the review UI", () => {
  assert.deepEqual([...VALID_ACTIONS].sort(), ["approve", "block", "dismiss", "request_changes"].sort());
});

test("computeMetricsFromChecks: needs_review folds in changes_requested, ported verbatim from recalc()", () => {
  const checks = [
    { status: "needs_review" },
    { status: "changes_requested" },
    { status: "changes_requested" },
    { status: "approved" },
    { status: "done" },
    { status: "done" },
    { status: "blocked" },
  ];
  assert.deepEqual(computeMetricsFromChecks(checks), {
    needs_review: 3,
    approved: 1,
    done: 2,
    blocked: 1,
  });
  assert.deepEqual(computeMetricsFromChecks([]), { needs_review: 0, approved: 0, done: 0, blocked: 0 });
});

test("deriveModelMetrics: simple CAGR/ending-cash/free-cash-flow arithmetic over a supplied periods array", () => {
  const periods = [
    { revenue: 1000000, ending_cash: 100000, free_cash_flow: 10000 },
    { revenue: 1440000, ending_cash: 200000, free_cash_flow: 40000 },
  ];
  const metrics = deriveModelMetrics(periods);
  // (1440000/1000000)^(1/1) - 1 = 0.44
  assert.ok(Math.abs(metrics.revenue_cagr - 0.44) < 1e-9);
  assert.equal(metrics.ending_cash, 200000);
  assert.equal(metrics.free_cash_flow, 40000);
  assert.deepEqual(deriveModelMetrics([]), { revenue_cagr: 0, ending_cash: 0, free_cash_flow: 0 });
});

test("computeCheckFromRow: parses evidence JSON and assembles a decision object only when decided", () => {
  const undecided = computeCheckFromRow({
    check_id: "check-1",
    title: "Balance sheet balances",
    severity: "info",
    status: "needs_review",
    evidence: JSON.stringify(["2026: $0", "2027: $0"]),
  });
  assert.equal(undecided.id, "check-1");
  assert.deepEqual(undecided.evidence, ["2026: $0", "2027: $0"]);
  assert.equal(undecided.decision, undefined);

  const decided = computeCheckFromRow({
    check_id: "check-2",
    decision_action: "approve",
    decision_comment: "Looks right",
    decided_at: "2026-01-01T00:00:00.000Z",
  });
  assert.deepEqual(decided.decision, {
    action: "approve",
    comment: "Looks right",
    decided_at: "2026-01-01T00:00:00.000Z",
  });
});

test("computeCheckFromRow gives every destructured field a default (no bare required param)", () => {
  assert.doesNotThrow(() => computeCheckFromRow());
  assert.doesNotThrow(() => computeModelFromRow());
});

test("computeModelFromRow: parses periods/warnings/workbook-tabs JSON and groups metrics", () => {
  const model = computeModelFromRow({
    company: "ExampleCo",
    currency: "USD",
    periods: JSON.stringify([{ label: "2026", revenue: 1000000 }]),
    revenue_cagr: 0.2,
    ending_cash: 1238320,
    free_cash_flow: 189724,
    balance_check: 0,
    warnings: JSON.stringify(["watch collections"]),
    workbook_path: "/tmp/model.xlsx",
    workbook_tabs: JSON.stringify(["Assumptions", "Income Statement"]),
  });
  assert.equal(model.company, "ExampleCo");
  assert.deepEqual(model.periods, [{ label: "2026", revenue: 1000000 }]);
  assert.deepEqual(model.metrics, {
    revenue_cagr: 0.2,
    ending_cash: 1238320,
    free_cash_flow: 189724,
    balance_check: 0,
  });
  assert.deepEqual(model.warnings, ["watch collections"]);
  assert.deepEqual(model.workbook, {
    last_generated_path: "/tmp/model.xlsx",
    tabs: ["Assumptions", "Income Statement"],
  });
});

test("assembleSnapshot: falls back to the empty-model shape and recomputes check-count metrics", () => {
  const empty = assembleSnapshot();
  assert.equal(empty.company, "Unconfigured model");
  assert.deepEqual(empty.checks, []);
  assert.deepEqual(empty.metrics, {
    needs_review: 0,
    approved: 0,
    done: 0,
    blocked: 0,
    revenue_cagr: 0,
    ending_cash: 0,
    free_cash_flow: 0,
    balance_check: 0,
  });

  const model = computeModelFromRow({ company: "ExampleCo", ending_cash: 500, free_cash_flow: 50 });
  const checks = [{ status: "needs_review" }, { status: "approved" }];
  const snapshot = assembleSnapshot({ model, checks });
  assert.equal(snapshot.company, "ExampleCo");
  assert.equal(snapshot.metrics.needs_review, 1);
  assert.equal(snapshot.metrics.approved, 1);
  assert.equal(snapshot.metrics.ending_cash, 500);
  assert.equal(snapshot.checks.length, 2);
});

test("buildConfigSummary: never reports secrets_required, matches the retired getConfigSummary() contract", () => {
  const empty = buildConfigSummary([]);
  assert.equal(empty.secrets_required, false);
  assert.equal(empty.company, null);

  const configured = buildConfigSummary([
    {
      kind: "config",
      payload: JSON.stringify({ company: { name: "ExampleCo" }, model_defaults: { horizon_years: 5 } }),
    },
  ]);
  assert.deepEqual(configured.company, { name: "ExampleCo" });
  assert.deepEqual(configured.model_defaults, { horizon_years: 5 });
  assert.equal(configured.secrets_required, false);
});

test("demoSnapshot: exact worked example ported verbatim from the retired app/server/demo.ts", () => {
  const en = demoSnapshot("en");
  assert.equal(en.snapshot_id, "finance-demo-20260706");
  assert.equal(en.company, "ExampleCo");
  assert.equal(en.periods.length, 5);
  assert.equal(en.periods[0].label, "2026");
  assert.equal(en.periods[0].revenue, 1000000);
  assert.equal(en.periods[4].ending_cash, 1238320);
  assert.equal(en.periods[4].free_cash_flow, 189724);
  assert.equal(en.checks.length, 4);
  // recomputed from checks: done=1 (balance-sheet), needs_review=2
  // (interest-base, scenario-case), approved=1 (working-capital), blocked=0.
  assert.deepEqual(en.metrics, {
    needs_review: 2,
    approved: 1,
    done: 1,
    blocked: 0,
    revenue_cagr: 0.2,
    ending_cash: 1238320,
    free_cash_flow: 189724,
    balance_check: 0,
  });
  assert.equal(en.workbook.tabs.length, 5);

  const zh = demoSnapshot("zh");
  assert.equal(zh.company, "示例科技");
  assert.equal(zh.checks[0].title, "资产负债表平衡");
});
