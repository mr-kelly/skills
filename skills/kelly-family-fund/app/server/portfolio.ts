// Shared fund rollup logic. Given the fund meta, beneficiaries (the elders),
// sibling families, pension income, and expenses, it computes the chronological
// monthly rollups (with a running balance), the fund totals, the per-category
// split, and the per-family fairness rollup. Used by the demo payload, the
// demo-snapshot generator, and the CSV importer so every rollup is internally
// consistent (months = sums, totals = sums, by_category sums to expense_total,
// by_family shares computed as specified).
//
// Fairness model (the core of this skill):
//   - `care` expenses are the parents' cost (family_id null, shared false) and
//     are EXCLUDED from family benefit.
//   - A family's benefit_total = expenses directed to it (family_id === fam)
//     PLUS its equal share of every `shared: true` expense (amount / #families).
//   - family_total   = all non-care expenses.
//   - avg_family_benefit = family_total / #families.
//   - deviation_pct  = (benefit_total - avg) / avg * 100.

import type {
  BuildSnapshotInput,
  CategoryRollup,
  Expense,
  ExpenseInput,
  FamilyRollup,
  FundSnapshot,
  Income,
  IncomeInput,
  MonthRollup,
} from "./types.ts";

function round2(value: unknown): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function round1(value: unknown): number {
  return Math.round((Number(value) || 0) * 10) / 10;
}

export function normalizeIncome(income: IncomeInput[]): Income[] {
  return income.map((row) => ({
    id: row.id,
    month: String(row.month || ""),
    beneficiary_id: row.beneficiary_id,
    amount: round2(row.amount),
    note: row.note || "",
  }));
}

export function normalizeExpenses(expenses: ExpenseInput[]): Expense[] {
  return expenses.map((row) => {
    const isCare = row.category === "care";
    return {
      id: row.id,
      month: String(row.month || ""),
      date: row.date || "",
      category: row.category,
      amount: round2(row.amount),
      payee: row.payee || "",
      occasion: row.occasion || "",
      family_id: isCare ? null : row.family_id || null,
      shared: isCare ? false : Boolean(row.shared),
      note: row.note || "",
    };
  });
}

export function buildSnapshot({
  snapshot_id,
  generated_at,
  base_currency = "CNY",
  fund = { name: "", steward: "" },
  beneficiaries = [],
  families = [],
  income = [],
  expenses = [],
  source = "kelly-family-fund",
}: BuildSnapshotInput): FundSnapshot {
  const normIncome = normalizeIncome(income);
  const normExpenses = normalizeExpenses(expenses);
  const numFamilies = families.length;

  // ---- Monthly rollups (chronological, running balance) ----
  const monthKeys = [...new Set([...normIncome.map((r) => r.month), ...normExpenses.map((r) => r.month)])]
    .filter(Boolean)
    .sort();
  const incomeByMonth = new Map<string, number>();
  const expenseByMonth = new Map<string, number>();
  for (const row of normIncome) incomeByMonth.set(row.month, (incomeByMonth.get(row.month) || 0) + row.amount);
  for (const row of normExpenses) expenseByMonth.set(row.month, (expenseByMonth.get(row.month) || 0) + row.amount);

  let running = 0;
  const months: MonthRollup[] = monthKeys.map((month) => {
    const income_total = round2(incomeByMonth.get(month) || 0);
    const expense_total = round2(expenseByMonth.get(month) || 0);
    const net = round2(income_total - expense_total);
    running = round2(running + net);
    return { month, income_total, expense_total, net, balance_end: running };
  });

  // ---- Totals ----
  const income_total = round2(normIncome.reduce((sum, r) => sum + r.amount, 0));
  const expense_total = round2(normExpenses.reduce((sum, r) => sum + r.amount, 0));
  const balance = round2(income_total - expense_total);
  const care_total = round2(normExpenses.filter((r) => r.category === "care").reduce((sum, r) => sum + r.amount, 0));
  const family_total = round2(expense_total - care_total);
  const avg_family_benefit = numFamilies ? round2(family_total / numFamilies) : 0;

  // ---- By category ----
  const catAgg = new Map<string, number>();
  for (const row of normExpenses) catAgg.set(row.category, (catAgg.get(row.category) || 0) + row.amount);
  const by_category: CategoryRollup[] = [...catAgg.entries()]
    .map(([category, amount]) => ({
      category,
      amount: round2(amount),
      pct: expense_total ? round1((amount / expense_total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // ---- By family (fairness) ----
  const benefitByFamily = new Map<string, number>();
  for (const family of families) benefitByFamily.set(family.id, 0);
  for (const row of normExpenses) {
    if (row.category === "care") continue;
    if (row.shared && numFamilies) {
      const share = row.amount / numFamilies;
      for (const family of families) {
        benefitByFamily.set(family.id, (benefitByFamily.get(family.id) || 0) + share);
      }
    } else if (row.family_id && benefitByFamily.has(row.family_id)) {
      benefitByFamily.set(row.family_id, (benefitByFamily.get(row.family_id) || 0) + row.amount);
    }
  }
  const by_family: FamilyRollup[] = families
    .map((family) => {
      const benefit_total = round2(benefitByFamily.get(family.id) || 0);
      const share_pct = family_total ? round1((benefit_total / family_total) * 100) : 0;
      const deviation_pct = avg_family_benefit
        ? round1(((benefit_total - avg_family_benefit) / avg_family_benefit) * 100)
        : 0;
      return { family_id: family.id, name: family.name, benefit_total, share_pct, deviation_pct };
    })
    .sort((a, b) => b.benefit_total - a.benefit_total);

  return {
    schema_version: "1",
    snapshot_id: snapshot_id || `ff-${Date.now()}`,
    generated_at: generated_at || new Date().toISOString(),
    base_currency,
    fund,
    beneficiaries,
    families,
    income: normIncome,
    expenses: normExpenses,
    months,
    totals: {
      income_total,
      expense_total,
      balance,
      care_total,
      family_total,
      avg_family_benefit,
    },
    by_category,
    by_family,
  };
}
