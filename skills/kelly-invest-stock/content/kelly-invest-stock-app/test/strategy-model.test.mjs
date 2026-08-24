import assert from "node:assert/strict";
import test from "node:test";

import { createRegressionSnapshot, createStrategyDesk } from "../app/js/strategy-model.js";

const record = (id, baseKey, fields) => ({ id, baseKey, fields });

test("groups strategies into L1, L2, and L3 and keeps the next-review order", () => {
  const desk = createStrategyDesk([
    record("later", "strategies", {
      key: "later",
      name: "稍后复核",
      status: "L1",
      confidence: 76,
      next_review_at: "2026-08-20",
    }),
    record("due", "strategies", {
      key: "due",
      name: "优先复核",
      status: "L1",
      confidence: 45,
      next_review_at: "2026-08-10",
    }),
    record("advanced", "strategies", { key: "advanced", name: "进阶", status: "L2", confidence: 62 }),
    record("confidence", "strategies", { key: "confidence", name: "高置信", status: "L3", confidence: 80 }),
  ]);

  assert.deepEqual(
    desk.levels.L1.map((strategy) => strategy.key),
    ["due", "later"],
  );
  assert.equal(desk.levels.L2.length, 1);
  assert.equal(desk.levels.L3.length, 1);
  assert.equal(desk.attention.l1, 2);
});

test("summarizes virtual accounts without treating them as real holdings", () => {
  const desk = createStrategyDesk([
    record("strategy-a", "strategies", { key: "a", name: "A" }),
    record("strategy-b", "strategies", { key: "b", name: "B" }),
    record("account-a", "ledger-accounts", {
      strategy_key: "a",
      nominal_capital: 100000,
      nav: 108000,
      cash: 107000,
      benchmark_return: 0.03,
      baseline_date: "2026-08-01",
    }),
    record("account-b", "ledger-accounts", {
      strategy_key: "b",
      nominal_capital: 50000,
      nav: 48000,
      cash: 48000,
      benchmark_return: 0,
      baseline_date: "2026-08-01",
    }),
    record("position-a", "ledger-positions", {
      strategy_key: "a",
      code: "AAA",
      quantity: 10,
      entry_price: 80,
      latest_price: 100,
      price_source: "交易所收盘价",
      price_as_of: "2026-08-05",
    }),
  ]);

  assert.equal(desk.ledger.nominalCapital, 150000);
  assert.equal(desk.ledger.nav, 156000);
  assert.equal(desk.ledger.pnl, 6000);
  assert.ok(Math.abs(desk.ledger.returnRate - 0.04) < Number.EPSILON);
  assert.ok(Math.abs(desk.ledger.benchmarkReturn - 0.02) < Number.EPSILON);
  assert.ok(Math.abs(desk.ledger.excessReturn - 0.02) < Number.EPSILON);
  assert.equal(desk.ledger.cash, 155000);
  assert.equal(desk.strategies[0].stage, "L1");
  assert.equal(desk.strategies[0].key, "a");
  assert.equal(desk.strategies[0].positions[0].pnl, 200);
});

test("surfaces missing, duplicate, and orphan virtual-ledger records", () => {
  const desk = createStrategyDesk([
    record("strategy-a", "strategies", { key: "a", name: "A" }),
    record("strategy-b", "strategies", { key: "b", name: "B" }),
    record("account-a-1", "ledger-accounts", {
      strategy_key: "a",
      nominal_capital: 100000,
      nav: 105000,
      cash: 25000,
      baseline_date: "2026-08-01",
    }),
    record("account-a-2", "ledger-accounts", {
      strategy_key: "a",
      nominal_capital: 100000,
      nav: 99000,
      cash: 50000,
      baseline_date: "2026-08-01",
    }),
    record("account-orphan", "ledger-accounts", {
      strategy_key: "missing",
      nominal_capital: 100000,
      nav: 250000,
    }),
    record("position-orphan", "ledger-positions", { strategy_key: "missing", code: "NOPE", quantity: 1 }),
  ]);

  assert.deepEqual(desk.integrity.missingAccountStrategyKeys, ["b"]);
  assert.deepEqual(desk.integrity.duplicateAccountStrategyKeys, ["a"]);
  assert.deepEqual(desk.integrity.orphanAccountIds, ["account-orphan"]);
  assert.deepEqual(desk.integrity.orphanPositionIds, ["position-orphan"]);
  assert.equal(desk.integrity.issueCount, 5);
  assert.equal(desk.integrity.isComplete, false);
  assert.equal(desk.strategies.find((strategy) => strategy.key === "a").accountCount, 2);
  assert.equal(desk.strategies.find((strategy) => strategy.key === "b").account, null);
  assert.equal(desk.ledger.nominalCapital, 100000);
  assert.equal(desk.ledger.nav, 105000);
});

test("marks one virtual account per strategy as complete", () => {
  const desk = createStrategyDesk([
    record("strategy-a", "strategies", { key: "a", name: "A" }),
    record("account-a", "ledger-accounts", {
      strategy_key: "a",
      nominal_capital: 100,
      nav: 101,
      cash: 101,
      baseline_date: "2026-08-01",
    }),
  ]);

  assert.equal(desk.integrity.isComplete, true);
  assert.equal(desk.integrity.issueCount, 0);
  assert.equal(desk.strategies[0].accountCount, 1);
});

test("associates dated backtest reports with strategies and preserves the evaluation window", () => {
  const desk = createStrategyDesk([
    record("strategy-a", "strategies", { key: "a", name: "A" }),
    record("account-a", "ledger-accounts", {
      strategy_key: "a",
      nominal_capital: 100,
      nav: 101,
      cash: 101,
      baseline_date: "2026-08-01",
    }),
    record("backtest-a-new", "strategy-backtests", {
      strategy_key: "a",
      report_date: "2026-07-02",
      window_start: "2024-07-01",
      window_end: "2026-07-02",
      window_label: "2年日线（Yahoo复权）",
      method: "静态等权（后视⚠️）",
      coverage: "8/8",
      benchmark: "SPY",
      total_return: 2.232,
      cagr: 0.798,
      volatility: 0.501,
      sharpe: 1.35,
      max_drawdown: -0.479,
      benchmark_return: 0.4,
      excess_return: 1.832,
    }),
    record("backtest-a-old", "strategy-backtests", {
      strategy_key: "a",
      report_date: "2025-07-02",
      window_start: "2023-07-01",
      window_end: "2025-07-02",
    }),
  ]);

  assert.equal(desk.backtests.length, 2);
  assert.equal(desk.strategies[0].backtests[0].reportDate, "2026-07-02");
  assert.equal(desk.strategies[0].backtests[0].windowStart, "2024-07-01");
  assert.equal(desk.strategies[0].backtests[0].windowEnd, "2026-07-02");
  assert.equal(desk.strategies[0].backtests[0].sharpe, 1.35);
  assert.equal(desk.integrity.isComplete, true);
});

test("calculates one strategy contribution and the total-book return without it", () => {
  const desk = createStrategyDesk([
    record("strategy-a", "strategies", { key: "a", name: "A" }),
    record("strategy-b", "strategies", { key: "b", name: "B" }),
    record("account-a", "ledger-accounts", {
      strategy_key: "a",
      nominal_capital: 100,
      nav: 120,
      cash: 120,
      baseline_date: "2026-08-01",
    }),
    record("account-b", "ledger-accounts", {
      strategy_key: "b",
      nominal_capital: 300,
      nav: 270,
      cash: 270,
      baseline_date: "2026-08-01",
    }),
  ]);
  const strategy = desk.strategies.find((item) => item.key === "a");
  const snapshot = createRegressionSnapshot(desk, strategy);

  assert.ok(Math.abs(snapshot.totalReturn + 0.025) < Number.EPSILON);
  assert.ok(Math.abs(snapshot.strategyReturn - 0.2) < Number.EPSILON);
  assert.ok(Math.abs(snapshot.contribution - 0.05) < Number.EPSILON);
  assert.ok(Math.abs(snapshot.capitalWeight - 0.25) < Number.EPSILON);
  assert.ok(Math.abs(snapshot.returnWithoutStrategy + 0.1) < Number.EPSILON);
});

test("does not invent returns when account or quote evidence is incomplete", () => {
  const desk = createStrategyDesk([
    record("strategy-a", "strategies", { key: "a", name: "A" }),
    record("account-a", "ledger-accounts", {
      strategy_key: "a",
      nominal_capital: 100,
      nav: 110,
      baseline_date: "2026-08-01",
    }),
    record("position-a", "ledger-positions", {
      strategy_key: "a",
      code: "AAA",
      quantity: 1,
      latest_price: 10,
    }),
  ]);

  assert.equal(desk.ledger.returnRate, null);
  assert.equal(desk.ledger.pnl, null);
  assert.deepEqual(desk.integrity.incompleteQuoteStrategyKeys, ["a"]);
});

test("does not treat capital and NAV as dated performance without a baseline", () => {
  const desk = createStrategyDesk([
    record("strategy-a", "strategies", { key: "a", name: "A" }),
    record("account-a", "ledger-accounts", {
      strategy_key: "a",
      nominal_capital: 100,
      nav: 110,
      cash: 110,
    }),
  ]);

  assert.equal(desk.strategies[0].account.pnl, null);
  assert.equal(desk.strategies[0].account.returnRate, null);
  assert.equal(desk.ledger.pnl, null);
  assert.equal(desk.ledger.returnRate, null);
  assert.deepEqual(desk.integrity.missingBaselineStrategyKeys, ["a"]);
});

test("attaches dated research evidence and marks a reconciled strategy approval-ready", () => {
  const desk = createStrategyDesk([
    record("strategy-a", "strategies", {
      key: "a",
      name: "A",
      family: "质量价值",
      thesis: "高质量企业长期复利。",
      selection_rule: "ROIC 与现金流持续领先。",
      invalidation_rule: "资本回报率连续下滑。",
      rebalance: "季度复核",
      benchmark: "沪深300",
      next_review_at: "2026-09-01",
    }),
    record("account-a", "ledger-accounts", {
      strategy_key: "a",
      nominal_capital: 100,
      nav: 101,
      cash: 101,
      baseline_date: "2026-08-01",
    }),
    record("research-a", "strategy-reviews", {
      strategy_key: "a",
      name: "季度研究复查",
      review_date: "2026-08-05",
      review_type: "research",
      source_as_of: "2026-06-30",
      supporting_evidence: "现金流与资本回报率保持稳定。",
      counter_evidence: "估值处于历史中枢上方。",
    }),
  ]);

  assert.equal(desk.strategies[0].latestResearch.id, "research-a");
  assert.equal(desk.strategies[0].isReconciled, true);
  assert.equal(desk.strategies[0].isApprovalReady, true);
});
