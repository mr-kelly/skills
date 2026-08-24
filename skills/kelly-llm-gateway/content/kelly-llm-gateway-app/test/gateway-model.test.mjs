import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAnomalyAck,
  applyAnomalyAcks,
  applyRolloutDecision,
  baseRouteFields,
  buildConfigSummary,
  buildSnapshot,
  buildSpendTrend,
  buildTotals,
  computeAnomalies,
  deriveRouteMetrics,
  normalizeRouteRow,
  parseAnomalyId,
} from "../app/js/gateway-model.js";

// Worked example: 2 quiet baseline days, then a today spike in both cost and
// error rate. Numbers chosen so the math is easy to hand-check.
const SPIKED_ROUTE = {
  route_id: "svc-a__model-a",
  service_id: "svc-a",
  model_id: "model-a",
  status: "canary",
  canary_pct: 40,
  rollback_ready: true,
  daily: [
    { date: "2026-01-01", calls: 100, cost: 10, errors: 1 },
    { date: "2026-01-02", calls: 100, cost: 10, errors: 1 },
    { date: "2026-01-03", calls: 200, cost: 40, errors: 10 },
  ],
};

const QUIET_ROUTE = {
  route_id: "svc-b__model-b",
  service_id: "svc-b",
  model_id: "model-b",
  status: "stable",
  canary_pct: 0,
  rollback_ready: false,
  daily: [
    { date: "2026-01-01", calls: 50, cost: 5, errors: 0 },
    { date: "2026-01-02", calls: 50, cost: 5, errors: 0 },
    { date: "2026-01-03", calls: 50, cost: 5, errors: 0 },
  ],
};

test("deriveRouteMetrics: today/baseline are computed from the daily series", () => {
  const derived = deriveRouteMetrics(SPIKED_ROUTE);
  assert.equal(derived.calls_today, 200);
  assert.equal(derived.cost_today, 40);
  assert.equal(derived.error_rate_today, 0.05); // 10 / 200
  assert.equal(derived.cost_baseline, 10); // mean of [10, 10]
  assert.equal(derived.error_rate_baseline, 0.01); // mean of [1/100, 1/100]
});

test("deriveRouteMetrics: a route with no daily history derives to zeros, not a crash", () => {
  const derived = deriveRouteMetrics({ route_id: "empty", daily: [] });
  assert.equal(derived.calls_today, 0);
  assert.equal(derived.cost_today, 0);
  assert.equal(derived.error_rate_today, 0);
  assert.equal(derived.cost_baseline, 0);
  assert.equal(derived.error_rate_baseline, 0);
});

test("buildTotals: sums calls/cost today and the 7-day trailing average across routes", () => {
  const routes = [SPIKED_ROUTE, QUIET_ROUTE].map(deriveRouteMetrics);
  const totals = buildTotals(routes);
  assert.equal(totals.calls_today, 250); // 200 + 50
  assert.equal(totals.cost_today, 45); // 40 + 5
  // cost_7d_avg: SPIKED_ROUTE's own 3-day avg (10+10+40)/3=20, QUIET_ROUTE's (5+5+5)/3=5
  assert.equal(totals.cost_7d_avg, 25);
  assert.equal(totals.error_rate_today, 0.04); // 10 total errors today / 250 calls today
});

test("buildSpendTrend: one point per calendar date, summed across routes", () => {
  const routes = [SPIKED_ROUTE, QUIET_ROUTE].map(deriveRouteMetrics);
  const trend = buildSpendTrend(routes);
  assert.deepEqual(trend, [
    { date: "2026-01-01", cost: 15 },
    { date: "2026-01-02", cost: 15 },
    { date: "2026-01-03", cost: 45 },
  ]);
});

test("computeAnomalies: a route 3x over its cost baseline and 4x over its error baseline flags high severity for both kinds", () => {
  const routes = [SPIKED_ROUTE, QUIET_ROUTE].map(deriveRouteMetrics);
  const anomalies = computeAnomalies(routes, 50, 100);
  assert.equal(anomalies.length, 2);
  const costAnomaly = anomalies.find((a) => a.kind === "cost_spike");
  const errorAnomaly = anomalies.find((a) => a.kind === "error_spike");
  assert.equal(costAnomaly.id, "cost-spike-svc-a__model-a");
  assert.equal(costAnomaly.severity, "high"); // 300% >= 2x threshold (100%)
  assert.equal(costAnomaly.delta_pct, 300);
  assert.equal(errorAnomaly.severity, "high"); // 400% >= 2x threshold (200%)
  assert.equal(errorAnomaly.delta_pct, 400);
  // QUIET_ROUTE never deviates from its own baseline, so it produces nothing.
  assert.ok(!anomalies.some((a) => a.route_id === "svc-b__model-b"));
});

test("computeAnomalies: sorts high severity before watch, then by larger delta first", () => {
  const watchRoute = deriveRouteMetrics({
    route_id: "svc-c__model-c",
    daily: [
      { date: "2026-01-01", calls: 100, cost: 10, errors: 0 },
      { date: "2026-01-02", calls: 100, cost: 16, errors: 0 }, // 60% over baseline: watch, not high
    ],
  });
  const highRoute = deriveRouteMetrics(SPIKED_ROUTE);
  const anomalies = computeAnomalies([watchRoute, highRoute], 50, 100);
  assert.equal(anomalies[0].severity, "high");
  assert.equal(anomalies.at(-1).severity, "watch");
});

test("applyRolloutDecision: promote sets stable/100%/rollback-not-ready", () => {
  const next = applyRolloutDecision(SPIKED_ROUTE, "promote", "Quality parity confirmed", "2026-02-01T00:00:00.000Z");
  assert.equal(next.status, "stable");
  assert.equal(next.canary_pct, 100);
  assert.equal(next.rollback_ready, false);
  assert.equal(next.note, "Quality parity confirmed");
  assert.equal(next.updated_at, "2026-02-01T00:00:00.000Z");
});

test("applyRolloutDecision: rollback sets status and clears rollback-ready", () => {
  const next = applyRolloutDecision(SPIKED_ROUTE, "rollback", "", "2026-02-01T00:00:00.000Z");
  assert.equal(next.status, "rollback");
  assert.equal(next.rollback_ready, false);
});

test("applyRolloutDecision: hold only changes status, leaving canary_pct/rollback_ready untouched", () => {
  const next = applyRolloutDecision(SPIKED_ROUTE, "hold", "", "2026-02-01T00:00:00.000Z");
  assert.equal(next.status, "hold");
  assert.equal(next.canary_pct, 40);
  assert.equal(next.rollback_ready, true);
});

test("applyRolloutDecision: rejects an unknown action", () => {
  assert.throws(() => applyRolloutDecision(SPIKED_ROUTE, "delete"), /action must be one of/);
});

test("parseAnomalyId / applyAnomalyAck / applyAnomalyAcks round trip", () => {
  const parsedCost = parseAnomalyId("cost-spike-svc-a__model-a");
  assert.deepEqual(parsedCost, { kind: "cost_spike", route_id: "svc-a__model-a" });
  const parsedError = parseAnomalyId("error-spike-svc-a__model-a");
  assert.deepEqual(parsedError, { kind: "error_spike", route_id: "svc-a__model-a" });
  assert.deepEqual(parseAnomalyId("unknown-id"), { kind: "", route_id: "" });

  const acked = applyAnomalyAck(
    SPIKED_ROUTE,
    "cost_spike",
    "Known regression, rollback prepared",
    "2026-02-01T00:00:00.000Z",
  );
  assert.deepEqual(acked.cost_spike_ack, {
    note: "Known regression, rollback prepared",
    acknowledged_at: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(acked.error_spike_ack, null);

  const routes = [SPIKED_ROUTE, QUIET_ROUTE].map(deriveRouteMetrics);
  const anomalies = computeAnomalies(routes, 50, 100);
  const routesById = new Map([
    [acked.route_id, { ...deriveRouteMetrics(SPIKED_ROUTE), cost_spike_ack: acked.cost_spike_ack }],
  ]);
  const merged = applyAnomalyAcks(anomalies, routesById);
  const costAnomaly = merged.find((a) => a.kind === "cost_spike");
  assert.equal(costAnomaly.status, "acknowledged");
  assert.equal(costAnomaly.ack_note, "Known regression, rollback prepared");
  const errorAnomaly = merged.find((a) => a.kind === "error_spike");
  assert.equal(errorAnomaly.status, "open");
});

test("applyAnomalyAck: rejects an unknown kind", () => {
  assert.throws(() => applyAnomalyAck(SPIKED_ROUTE, "latency_spike"), /Unknown anomaly kind/);
});

test("normalizeRouteRow / baseRouteFields round trip through Busabase's string field types", () => {
  const row = normalizeRouteRow({
    route_id: "svc-a__model-a",
    service_id: "svc-a",
    model_id: "model-a",
    status: "canary",
    canary_pct: 40,
    rollback_ready: "true",
    note: "watching",
    daily: JSON.stringify(SPIKED_ROUTE.daily),
    cost_spike_ack: "",
    error_spike_ack: JSON.stringify({ note: "ok", acknowledged_at: "2026-02-01T00:00:00.000Z" }),
    updated_at: "2026-01-03T00:00:00.000Z",
  });
  assert.equal(row.canary_pct, 40);
  assert.equal(row.rollback_ready, true);
  assert.deepEqual(row.daily, SPIKED_ROUTE.daily);
  assert.equal(row.cost_spike_ack, null);
  assert.deepEqual(row.error_spike_ack, { note: "ok", acknowledged_at: "2026-02-01T00:00:00.000Z" });

  const fields = baseRouteFields(row);
  assert.equal(fields.rollback_ready, "true");
  assert.equal(fields.cost_spike_ack, "");
  assert.equal(JSON.parse(fields.error_spike_ack).note, "ok");
  assert.deepEqual(JSON.parse(fields.daily), SPIKED_ROUTE.daily);
});

test("buildConfigSummary: falls back to defaults and never fabricates a secrets-ready flag", () => {
  const summary = buildConfigSummary({});
  assert.equal(summary.base_currency, "USD");
  assert.equal(summary.cost_spike_threshold_pct, 50);
  assert.equal(summary.error_spike_threshold_pct, 100);
  assert.deepEqual(summary.gateway, { region: "", base_url: "", api_key_env: "" });
  assert.equal("secrets_ready" in summary.gateway, false);
});

test("buildSnapshot: end-to-end from raw routes to a rendered snapshot with acked anomalies", () => {
  const services = [{ service_id: "svc-a", display_name: "Service A", team: "Team A" }];
  const models = [{ model_id: "model-a", display_name: "Model A", provider: "Provider A", tier: "external" }];
  const ackedRoute = {
    ...SPIKED_ROUTE,
    error_spike_ack: { note: "seen", acknowledged_at: "2026-01-04T00:00:00.000Z" },
  };
  const snapshot = buildSnapshot({
    services,
    models,
    routes: [ackedRoute, QUIET_ROUTE],
    configSummary: buildConfigSummary({}),
    generatedAt: "2026-01-03T09:00:00.000Z",
  });
  assert.equal(snapshot.snapshot_id, "gateway-2026-01-03");
  assert.equal(snapshot.services, services);
  assert.equal(snapshot.totals.cost_today, 45);
  assert.equal(snapshot.anomalies.length, 2);
  const errorAnomaly = snapshot.anomalies.find((a) => a.kind === "error_spike");
  assert.equal(errorAnomaly.status, "acknowledged");
  assert.equal(errorAnomaly.ack_note, "seen");
  const costAnomaly = snapshot.anomalies.find((a) => a.kind === "cost_spike");
  assert.equal(costAnomaly.status, "open");
});
