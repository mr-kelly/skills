// Pure domain logic for kelly-family-fund, ported from the retired
// app/server/{portfolio.ts,insights.ts}. Given the fund meta, beneficiaries
// (the elders), sibling families, pension income, and expenses, buildSnapshot
// computes the chronological monthly rollups (with a running balance), the
// fund totals, the per-category split, and the per-family fairness rollup.
// computeInsights derives a small set of neutral, factual observations from
// an already-built snapshot. Both are read-only: nothing here moves money.
//
// Fairness model (the core of this skill):
//   - `care` expenses are the parents' cost (family_id null, shared false) and
//     are EXCLUDED from family benefit.
//   - A family's benefit_total = expenses directed to it (family_id === fam)
//     PLUS its equal share of every `shared: true` expense (amount / #families).
//   - family_total   = all non-care expenses.
//   - avg_family_benefit = family_total / #families.
//   - deviation_pct  = (benefit_total - avg) / avg * 100.

const DEFAULT_DEVIATION_THRESHOLD = 20;
const SEVERITY_RANK = { high: 3, watch: 2, info: 1 };

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

export function normalizeIncome(income) {
  return income.map((row) => ({
    id: row.id,
    month: String(row.month || ""),
    beneficiary_id: row.beneficiary_id,
    amount: round2(row.amount),
    note: row.note || "",
  }));
}

export function normalizeExpenses(expenses) {
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
  snapshot_id = "",
  generated_at = "",
  base_currency = "CNY",
  fund = { name: "", steward: "" },
  beneficiaries = [],
  families = [],
  income = [],
  expenses = [],
} = {}) {
  const normIncome = normalizeIncome(income);
  const normExpenses = normalizeExpenses(expenses);
  const numFamilies = families.length;

  // ---- Monthly rollups (chronological, running balance) ----
  const monthKeys = [...new Set([...normIncome.map((r) => r.month), ...normExpenses.map((r) => r.month)])]
    .filter(Boolean)
    .sort();
  const incomeByMonth = new Map();
  const expenseByMonth = new Map();
  for (const row of normIncome) incomeByMonth.set(row.month, (incomeByMonth.get(row.month) || 0) + row.amount);
  for (const row of normExpenses) expenseByMonth.set(row.month, (expenseByMonth.get(row.month) || 0) + row.amount);

  let running = 0;
  const months = monthKeys.map((month) => {
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
  const catAgg = new Map();
  for (const row of normExpenses) catAgg.set(row.category, (catAgg.get(row.category) || 0) + row.amount);
  const by_category = [...catAgg.entries()]
    .map(([category, amount]) => ({
      category,
      amount: round2(amount),
      pct: expense_total ? round1((amount / expense_total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // ---- By family (fairness) ----
  const benefitByFamily = new Map();
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
  const by_family = families
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

export function computeInsights(snapshot, deviationThreshold) {
  if (!snapshot || typeof snapshot !== "object") return [];
  const months = Array.isArray(snapshot.months) ? snapshot.months : [];
  const byFamily = Array.isArray(snapshot.by_family) ? snapshot.by_family : [];
  const beneficiaries = Array.isArray(snapshot.beneficiaries) ? snapshot.beneficiaries : [];
  const totals = snapshot.totals || {};
  const expenseTotal = Number(totals.expense_total) || 0;
  const careTotal = Number(totals.care_total) || 0;
  const balance = Number(totals.balance) || 0;
  const threshold =
    typeof deviationThreshold === "number" && deviationThreshold > 0 ? deviationThreshold : DEFAULT_DEVIATION_THRESHOLD;

  if (!months.length) return [];

  const insights = [];

  // 1. monthly_surplus / monthly_deficit — latest month net.
  const latest = months[months.length - 1];
  if (latest) {
    const net = round2(latest.net);
    if (net > 0) {
      insights.push({
        id: "monthly_surplus",
        code: "monthly_surplus",
        severity: "info",
        category: "cashflow",
        params: { amount: net, month: latest.month },
      });
    } else if (net < 0) {
      insights.push({
        id: "monthly_deficit",
        code: "monthly_deficit",
        severity: "high",
        category: "cashflow",
        params: { amount: net, month: latest.month },
      });
    }
  }

  // 2. care_coverage — pension_total - care per month.
  const pensionMonthly = round2(beneficiaries.reduce((sum, b) => sum + (Number(b.pension_monthly) || 0), 0));
  const careMonths = new Set(
    (Array.isArray(snapshot.expenses) ? snapshot.expenses : [])
      .filter((e) => e.category === "care")
      .map((e) => e.month),
  );
  const careMonthly = careMonths.size ? round2(careTotal / careMonths.size) : 0;
  if (pensionMonthly > 0 && careMonthly > 0) {
    const coverage = round2(pensionMonthly - careMonthly);
    insights.push({
      id: "care_coverage",
      code: "care_coverage",
      severity: coverage < 0 ? "high" : "info",
      category: "care",
      params: { amount: coverage },
    });
  }

  // 3. care_share — care as a share of total expense.
  if (expenseTotal > 0) {
    const pct = round1((careTotal / expenseTotal) * 100);
    if (pct >= 60) {
      insights.push({
        id: "care_share",
        code: "care_share",
        severity: "watch",
        category: "care",
        params: { pct },
      });
    }
  }

  // 4. balance_runway — if recent months trend negative, months of runway left.
  const recent = months.slice(-3);
  const recentNet = recent.reduce((sum, m) => sum + (Number(m.net) || 0), 0);
  if (recentNet < 0 && recent.length) {
    const avgDeficit = Math.abs(recentNet / recent.length);
    if (avgDeficit > 0 && balance > 0) {
      const runway = round1(balance / avgDeficit);
      insights.push({
        id: "balance_runway",
        code: "balance_runway",
        severity: "watch",
        category: "cashflow",
        params: { months: runway },
      });
    }
  }

  // 5. fairness_deviation — any family |deviation_pct| >= threshold.
  const drifted = [...byFamily]
    .filter((row) => Math.abs(Number(row.deviation_pct) || 0) >= threshold)
    .sort((a, b) => Math.abs(Number(b.deviation_pct) || 0) - Math.abs(Number(a.deviation_pct) || 0));
  for (const row of drifted.slice(0, 2)) {
    insights.push({
      id: `fairness_deviation:${row.family_id}`,
      code: "fairness_deviation",
      severity: "watch",
      category: "fairness",
      params: { name: row.name, delta: round1(row.deviation_pct) },
    });
  }

  const magnitude = (insight) => {
    const p = insight.params || {};
    return Math.abs(Number(p.pct ?? p.delta ?? p.amount ?? p.months ?? 0)) || 0;
  };
  insights.sort((a, b) => {
    const rank = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    return rank !== 0 ? rank : magnitude(b) - magnitude(a);
  });

  return insights.slice(0, 6);
}
