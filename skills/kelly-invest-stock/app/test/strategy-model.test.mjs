import assert from "node:assert/strict";
import test from "node:test";

import { createStrategyDesk } from "../app/js/strategy-model.js";

const record = (id, baseKey, fields) => ({ id, baseKey, fields });

test("groups candidates into L1, L2, and L3 and sorts by score", () => {
  const desk = createStrategyDesk([
    record("strategy", "strategies", { key: "quality", name: "质量" }),
    record("low", "candidates", { strategy_key: "quality", stage: "L1", confidence: 45, code: "LOW" }),
    record("high", "candidates", { strategy_key: "quality", stage: "L1", confidence: 76, code: "HIGH" }),
    record("paper", "candidates", { strategy_key: "quality", stage: "L2", confidence: 62, code: "PAPER" }),
    record("graduate", "candidates", { strategy_key: "quality", stage: "L3", confidence: 80, code: "GRAD" }),
  ]);

  assert.deepEqual(
    desk.levels.L1.map((candidate) => candidate.code),
    ["HIGH", "LOW"],
  );
  assert.equal(desk.levels.L2.length, 1);
  assert.equal(desk.levels.L3.length, 1);
  assert.equal(desk.strategies[0].candidates.length, 4);
});

test("summarizes virtual accounts without treating them as real holdings", () => {
  const desk = createStrategyDesk([
    record("strategy-a", "strategies", { key: "a", name: "A" }),
    record("strategy-b", "strategies", { key: "b", name: "B" }),
    record("account-a", "ledger-accounts", {
      strategy_key: "a",
      nominal_capital: 100000,
      nav: 108000,
      cash: 20000,
      benchmark_return: 0.03,
    }),
    record("account-b", "ledger-accounts", {
      strategy_key: "b",
      nominal_capital: 50000,
      nav: 48000,
      cash: 10000,
    }),
    record("position-a", "ledger-positions", {
      strategy_key: "a",
      code: "AAA",
      quantity: 10,
      entry_price: 80,
      latest_price: 100,
    }),
  ]);

  assert.equal(desk.ledger.nominalCapital, 150000);
  assert.equal(desk.ledger.nav, 156000);
  assert.equal(desk.ledger.pnl, 6000);
  assert.ok(Math.abs(desk.ledger.returnRate - 0.04) < Number.EPSILON);
  assert.ok(Math.abs(desk.ledger.benchmarkReturn - 0.02) < Number.EPSILON);
  assert.ok(Math.abs(desk.ledger.excessReturn - 0.02) < Number.EPSILON);
  assert.equal(desk.ledger.cash, 30000);
  assert.equal(desk.strategies[0].stageCounts.L1, 0);
  assert.equal(desk.strategies[0].key, "a");
  assert.equal(desk.strategies[0].positions[0].pnl, 200);
});

test("uses null for absent market observations", () => {
  const desk = createStrategyDesk([
    record("candidate", "candidates", { code: "NONE", stage: "L1", latest_price: null, daily_change: "" }),
  ]);
  assert.equal(desk.candidates[0].latestPrice, null);
  assert.equal(desk.candidates[0].dailyChange, null);
});
