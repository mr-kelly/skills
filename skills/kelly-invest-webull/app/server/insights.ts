// Deterministic, rule-based, READ-ONLY portfolio observations.
//
// Insights are neutral facts/flags, never advice or actions. No buy/sell/
// rebalance suggestions, nothing executable. Each insight carries structured
// `params` only — the frontend renders localized text from a per-code template,
// so no English sentences are baked into the snapshot.
//
// Pure module: no fs, no network, no side effects.

import type { Insight, PortfolioSnapshot, Position, TargetAllocation } from "./types.ts";

export const DEFAULT_TARGET_ALLOCATION: TargetAllocation = { STOCK: 45, ETF: 35, CRYPTO: 10, CASH: 10 };

const SEVERITY_ORDER: Record<string, number> = { high: 3, watch: 2, info: 1 };

function round2(value: unknown): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Compute read-only observations from a portfolio snapshot.
 */
export function computeInsights(
  snapshot: PortfolioSnapshot,
  targetAllocation: TargetAllocation = DEFAULT_TARGET_ALLOCATION,
): Insight[] {
  if (!snapshot || !Array.isArray(snapshot.positions) || snapshot.positions.length === 0) {
    return [];
  }
  const positions = snapshot.positions;
  const totals = snapshot.totals || ({} as PortfolioSnapshot["totals"]);
  const allocation = Array.isArray(snapshot.allocation) ? snapshot.allocation : [];
  const targets = targetAllocation || DEFAULT_TARGET_ALLOCATION;
  const insights: Insight[] = [];

  // 1. single_position_concentration — largest position by weight.
  const largest = positions.reduce<Position | null>(
    (best, p) => (Number(p.weight_pct || 0) > Number(best?.weight_pct || 0) ? p : best),
    null,
  );
  if (largest) {
    const pct = round2(Number(largest.weight_pct || 0));
    if (pct >= 20 || pct >= 12) {
      insights.push({
        id: `single-position-concentration-${largest.symbol}`,
        code: "single_position_concentration",
        severity: pct >= 20 ? "high" : "watch",
        category: "concentration",
        params: { symbol: largest.symbol, pct },
      });
    }
  }

  // 2. crypto_concentration — total CRYPTO allocation weight.
  const cryptoSlice = allocation.find((slice) => slice.asset_type === "CRYPTO");
  if (cryptoSlice) {
    const pct = round2(Number(cryptoSlice.weight_pct || 0));
    if (pct >= 15) {
      insights.push({
        id: "crypto-concentration",
        code: "crypto_concentration",
        severity: pct >= 25 ? "high" : "watch",
        category: "concentration",
        params: { pct },
      });
    }
  }

  // 3. allocation_drift — one insight per asset class drifting >= 10pp.
  const actualByType = new Map<string, number>();
  for (const slice of allocation) {
    actualByType.set(slice.asset_type, round2(Number(slice.weight_pct || 0)));
  }
  const marketValue = Number(totals.market_value || 0);
  const cashPctForDrift = marketValue > 0 ? round2((Number(totals.total_cash || 0) / marketValue) * 100) : 0;
  if (targets.CASH != null) actualByType.set("CASH", cashPctForDrift);
  for (const assetType of Object.keys(targets)) {
    const target = Number(targets[assetType] || 0);
    const actual = actualByType.has(assetType) ? actualByType.get(assetType) : 0;
    const delta = round2(actual - target);
    if (Math.abs(delta) >= 10) {
      insights.push({
        id: `allocation-drift-${assetType}`,
        code: "allocation_drift",
        severity: "watch",
        category: "drift",
        params: { asset_type: assetType, actual, target, delta },
      });
    }
  }

  // 4. cash_drag — cash as a percentage of market value.
  if (marketValue > 0) {
    const cashPct = round2((Number(totals.total_cash || 0) / marketValue) * 100);
    if (cashPct >= 15) {
      insights.push({
        id: "cash-drag",
        code: "cash_drag",
        severity: "watch",
        category: "cash",
        params: { pct: cashPct },
      });
    }
  }

  // 5. negative_cash — margin/negative cash balance.
  if (Number(totals.total_cash || 0) < 0) {
    insights.push({
      id: "negative-cash",
      code: "negative_cash",
      severity: "watch",
      category: "cash",
      params: { amount: round2(Number(totals.total_cash || 0)) },
    });
  }

  // 6. top_gainer — position with highest positive unrealized P/L %.
  const gainer = positions.reduce<Position | null>(
    (best, p) =>
      Number(p.unrealized_pnl_pct || 0) > Number(best?.unrealized_pnl_pct ?? Number.NEGATIVE_INFINITY) ? p : best,
    null,
  );
  if (gainer && Number(gainer.unrealized_pnl_pct || 0) > 0) {
    insights.push({
      id: `top-gainer-${gainer.symbol}`,
      code: "top_gainer",
      severity: "info",
      category: "performance",
      params: { symbol: gainer.symbol, pct: round2(Number(gainer.unrealized_pnl_pct || 0)) },
    });
  }

  // 7. top_laggard — position with lowest negative unrealized P/L %.
  const laggard = positions.reduce<Position | null>(
    (worst, p) =>
      Number(p.unrealized_pnl_pct || 0) < Number(worst?.unrealized_pnl_pct ?? Number.POSITIVE_INFINITY) ? p : worst,
    null,
  );
  if (laggard && Number(laggard.unrealized_pnl_pct || 0) < 0) {
    insights.push({
      id: `top-laggard-${laggard.symbol}`,
      code: "top_laggard",
      severity: "info",
      category: "performance",
      params: { symbol: laggard.symbol, pct: round2(Number(laggard.unrealized_pnl_pct || 0)) },
    });
  }

  // Order by severity desc, then by magnitude of the primary param. Cap at 6.
  const magnitude = (insight: Insight): number => {
    const p = (insight.params || {}) as Record<string, unknown>;
    return Math.abs(Number(p.pct ?? p.delta ?? p.amount ?? 0));
  };
  insights.sort((a, b) => {
    const sev = (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
    if (sev !== 0) return sev;
    return magnitude(b) - magnitude(a);
  });

  return insights.slice(0, 6);
}
