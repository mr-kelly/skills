// Deterministic, rule-based, READ-ONLY fund observations.
//
// computeInsights derives a small set of neutral, factual flags from an already
// built fund snapshot (the same shape produced by buildSnapshot) plus an
// optional fairness deviation threshold. These are OBSERVATIONS ONLY — they are
// not financial advice, not recommendations, and not actions. Nothing moves
// money. The module is pure (no fs, no I/O); the frontend renders the localized
// text from each insight's `code` + `params`.
//
// Each insight: { id, code, severity: "info"|"watch"|"high", category, params }.

import type { FundSnapshot, Insight, Severity } from "./types.ts";

const DEFAULT_DEVIATION_THRESHOLD = 20;

const SEVERITY_RANK: Record<Severity, number> = { high: 3, watch: 2, info: 1 };

function round2(value: unknown): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function round1(value: unknown): number {
  return Math.round((Number(value) || 0) * 10) / 10;
}

export function computeInsights(snapshot: FundSnapshot, deviationThreshold?: number): Insight[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const months = Array.isArray(snapshot.months) ? snapshot.months : [];
  const byCategory = Array.isArray(snapshot.by_category) ? snapshot.by_category : [];
  const byFamily = Array.isArray(snapshot.by_family) ? snapshot.by_family : [];
  const beneficiaries = Array.isArray(snapshot.beneficiaries) ? snapshot.beneficiaries : [];
  const totals = snapshot.totals || ({} as FundSnapshot["totals"]);
  const expenseTotal = Number(totals.expense_total) || 0;
  const careTotal = Number(totals.care_total) || 0;
  const balance = Number(totals.balance) || 0;
  const threshold =
    typeof deviationThreshold === "number" && deviationThreshold > 0 ? deviationThreshold : DEFAULT_DEVIATION_THRESHOLD;

  if (!months.length) return [];

  const insights: Insight[] = [];

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

  const magnitude = (insight: Insight): number => {
    const p = (insight.params || {}) as { pct?: unknown; delta?: unknown; amount?: unknown; months?: unknown };
    return Math.abs(Number(p.pct ?? p.delta ?? p.amount ?? p.months ?? 0)) || 0;
  };
  insights.sort((a, b) => {
    const rank = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    return rank !== 0 ? rank : magnitude(b) - magnitude(a);
  });

  return insights.slice(0, 6);
}
