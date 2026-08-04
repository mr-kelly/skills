import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshot, computeInsights } from "../app/js/fund-model.js";

function fixtureSnapshot() {
  return buildSnapshot({
    snapshot_id: "test-1",
    generated_at: "2026-02-01T00:00:00.000Z",
    base_currency: "CNY",
    fund: { name: "Test Fund", steward: "Steward" },
    beneficiaries: [{ id: "elder-1", name: "Elder One", relation: "grandpa", pension_monthly: 1000 }],
    families: [
      { id: "fam-01", name: "Family One", head: "A", members_count: 2 },
      { id: "fam-02", name: "Family Two", head: "B", members_count: 3 },
    ],
    income: [{ id: "inc-1", month: "2026-01", beneficiary_id: "elder-1", amount: 1000 }],
    expenses: [
      {
        id: "exp-care",
        month: "2026-01",
        date: "2026-01-05",
        category: "care",
        amount: 400,
        family_id: null,
        shared: false,
      },
      { id: "exp-shared", month: "2026-01", date: "2026-01-10", category: "transport", amount: 100, shared: true },
      {
        id: "exp-directed",
        month: "2026-01",
        date: "2026-01-12",
        category: "gift",
        amount: 200,
        family_id: "fam-01",
        shared: false,
      },
    ],
  });
}

test("buildSnapshot excludes care from family benefit and totals", () => {
  const snapshot = fixtureSnapshot();
  assert.equal(snapshot.totals.income_total, 1000);
  assert.equal(snapshot.totals.expense_total, 700);
  assert.equal(snapshot.totals.care_total, 400);
  assert.equal(snapshot.totals.family_total, 300);
  assert.equal(snapshot.totals.balance, 300);
  assert.equal(snapshot.totals.avg_family_benefit, 150);
});

test("buildSnapshot splits shared expenses equally and adds directed expenses", () => {
  const snapshot = fixtureSnapshot();
  const fam01 = snapshot.by_family.find((f) => f.family_id === "fam-01");
  const fam02 = snapshot.by_family.find((f) => f.family_id === "fam-02");
  // fam-01: 50 (half of shared 100) + 200 (directed gift) = 250
  assert.equal(fam01.benefit_total, 250);
  // fam-02: 50 (half of shared 100) only
  assert.equal(fam02.benefit_total, 50);
  assert.equal(fam01.deviation_pct, round1(((250 - 150) / 150) * 100));
  assert.equal(fam02.deviation_pct, round1(((50 - 150) / 150) * 100));
});

test("buildSnapshot computes chronological running balance", () => {
  const snapshot = buildSnapshot({
    beneficiaries: [],
    families: [{ id: "fam-01", name: "F1" }],
    income: [
      { id: "i1", month: "2026-01", beneficiary_id: "e1", amount: 100 },
      { id: "i2", month: "2026-02", beneficiary_id: "e1", amount: 100 },
    ],
    expenses: [{ id: "e1", month: "2026-01", category: "misc", amount: 40, shared: true }],
  });
  assert.deepEqual(
    snapshot.months.map((m) => [m.month, m.net, m.balance_end]),
    [
      ["2026-01", 60, 60],
      ["2026-02", 100, 160],
    ],
  );
});

test("computeInsights flags fairness deviation above threshold", () => {
  const snapshot = fixtureSnapshot();
  const insights = computeInsights(snapshot, 20);
  const fairness = insights.filter((i) => i.code === "fairness_deviation");
  assert.ok(fairness.length >= 1);
  assert.ok(fairness.some((i) => i.params.name === "Family One"));
});

test("computeInsights returns nothing for an empty snapshot", () => {
  const snapshot = buildSnapshot({ beneficiaries: [], families: [], income: [], expenses: [] });
  assert.deepEqual(computeInsights(snapshot), []);
});

test("computeInsights flags monthly deficit as high severity", () => {
  const snapshot = buildSnapshot({
    beneficiaries: [],
    families: [{ id: "fam-01", name: "F1" }],
    income: [{ id: "i1", month: "2026-01", beneficiary_id: "e1", amount: 100 }],
    expenses: [{ id: "e1", month: "2026-01", category: "misc", amount: 500, shared: true }],
  });
  const insights = computeInsights(snapshot);
  const deficit = insights.find((i) => i.code === "monthly_deficit");
  assert.ok(deficit);
  assert.equal(deficit.severity, "high");
});

function round1(value) {
  return Math.round(value * 10) / 10;
}
