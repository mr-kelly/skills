// Deterministic, rule-based anomaly detection over the gateway snapshot.
//
// Anomalies compare "today" against a rolling baseline (the mean of the
// preceding days in the same route's daily series) — never randomness, never
// external calls. Pure module: no fs, no network, no side effects. Ack state is
// merged in by the caller (store.ts) from decisions.json.

import type { Anomaly, GatewaySnapshot, Route } from "./types.ts";

export const DEFAULT_COST_SPIKE_THRESHOLD_PCT = 50;
export const DEFAULT_ERROR_SPIKE_THRESHOLD_PCT = 100;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function severityForDelta(deltaPct: number, highAt: number): "watch" | "high" {
  return deltaPct >= highAt ? "high" : "watch";
}

function costAnomalyFor(route: Route, thresholdPct: number): Anomaly | null {
  if (route.cost_baseline <= 0) return null;
  const deltaPct = ((route.cost_today - route.cost_baseline) / route.cost_baseline) * 100;
  if (deltaPct < thresholdPct) return null;
  return {
    id: `cost-spike-${route.route_id}`,
    route_id: route.route_id,
    kind: "cost_spike",
    severity: severityForDelta(deltaPct, thresholdPct * 2),
    baseline: route.cost_baseline,
    actual: route.cost_today,
    delta_pct: round1(deltaPct),
    status: "open",
  };
}

function errorAnomalyFor(route: Route, thresholdPct: number): Anomaly | null {
  if (route.error_rate_baseline <= 0) return null;
  const deltaPct = ((route.error_rate_today - route.error_rate_baseline) / route.error_rate_baseline) * 100;
  if (deltaPct < thresholdPct) return null;
  return {
    id: `error-spike-${route.route_id}`,
    route_id: route.route_id,
    kind: "error_spike",
    severity: severityForDelta(deltaPct, thresholdPct * 2),
    baseline: route.error_rate_baseline,
    actual: route.error_rate_today,
    delta_pct: round1(deltaPct),
    status: "open",
  };
}

/**
 * Compute anomalies for every route: a cost spike and/or an error spike vs the
 * route's own rolling baseline (mean of the preceding days, excluding today).
 */
export function computeAnomalies(
  snapshot: GatewaySnapshot,
  costThresholdPct: number = DEFAULT_COST_SPIKE_THRESHOLD_PCT,
  errorThresholdPct: number = DEFAULT_ERROR_SPIKE_THRESHOLD_PCT,
): Anomaly[] {
  if (!snapshot || !Array.isArray(snapshot.routes)) return [];
  const anomalies: Anomaly[] = [];
  for (const route of snapshot.routes) {
    const cost = costAnomalyFor(route, costThresholdPct);
    if (cost) anomalies.push(cost);
    const error = errorAnomalyFor(route, errorThresholdPct);
    if (error) anomalies.push(error);
  }
  const order: Record<string, number> = { high: 2, watch: 1, info: 0 };
  anomalies.sort((a, b) => (order[b.severity] || 0) - (order[a.severity] || 0) || b.delta_pct - a.delta_pct);
  return anomalies;
}
