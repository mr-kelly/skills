import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENTS,
  baseAgentFields,
  baseHandoffFields,
  baseTraceFields,
  buildFleetSnapshot,
  generateFleetData,
  normalizeAgentRow,
  normalizeHandoffRow,
  normalizeTraceRow,
  round2,
  statusFor,
  summarizeFleet,
} from "../app/js/fleet-model.js";

test("round2 rounds to two decimal places", () => {
  assert.equal(round2(1.234), 1.23);
  assert.equal(round2(1.236), 1.24);
  assert.equal(round2(0.1 + 0.2), 0.3);
});

test("statusFor: worked-example thresholds (>=8%/8000ms critical, >=3%/4000ms degraded, else healthy)", () => {
  assert.equal(statusFor(0, 0), "healthy");
  assert.equal(statusFor(2.9, 3999), "healthy");
  assert.equal(statusFor(3, 0), "degraded");
  assert.equal(statusFor(0, 4000), "degraded");
  assert.equal(statusFor(7.9, 7999), "degraded");
  assert.equal(statusFor(8, 0), "critical");
  assert.equal(statusFor(0, 8000), "critical");
});

test("generateFleetData: seeded output is deterministic (bit-identical for the same seed/now/tracesPerAgent)", () => {
  const now = new Date("2026-07-10T20:00:00.000Z");
  const a = generateFleetData({ now, seed: 7, tracesPerAgent: 10 });
  const b = generateFleetData({ now, seed: 7, tracesPerAgent: 10 });
  assert.deepEqual(a, b);
  assert.equal(a.agents.length, AGENTS.length);
  assert.equal(a.metrics.length, AGENTS.length);
  assert.equal(a.traces.length, AGENTS.length * 10);
});

test("generateFleetData: a different seed changes the output", () => {
  const now = new Date("2026-07-10T20:00:00.000Z");
  const a = generateFleetData({ now, seed: 7, tracesPerAgent: 10 });
  const b = generateFleetData({ now, seed: 8, tracesPerAgent: 10 });
  assert.notDeepEqual(a.metrics, b.metrics);
});

test("generateFleetData: every metrics row has a status consistent with statusFor()", () => {
  const fleet = generateFleetData({ now: new Date("2026-07-10T20:00:00.000Z"), seed: 7, tracesPerAgent: 10 });
  for (const m of fleet.metrics) {
    assert.equal(m.status, statusFor(m.error_rate_pct, m.p95_latency_ms));
  }
});

test("generateFleetData: broken traces carry a broke_at_step_id that matches their last (error) step", () => {
  const fleet = generateFleetData({ now: new Date("2026-07-10T20:00:00.000Z"), seed: 7, tracesPerAgent: 16 });
  const broken = fleet.traces.filter((tr) => tr.status === "error");
  assert.ok(broken.length > 0, "expected at least one broken trace with seed=7/tracesPerAgent=16");
  for (const trace of broken) {
    const lastStep = trace.steps[trace.steps.length - 1];
    assert.equal(lastStep.status, "error");
    assert.equal(trace.broke_at_step_id, lastStep.step_id);
  }
});

test("summarizeFleet: worked example over a small synthetic fleet", () => {
  const fleet = {
    generated_at: "2026-01-01T00:00:00.000Z",
    agents: [{ agent_id: "a" }, { agent_id: "b" }, { agent_id: "c" }],
    metrics: [
      { agent_id: "a", status: "healthy", calls_24h: 100, cost_today_usd: 1.111 },
      { agent_id: "b", status: "degraded", calls_24h: 50, cost_today_usd: 2.222 },
      { agent_id: "c", status: "critical", calls_24h: 25, cost_today_usd: 3.333 },
    ],
    traces: [],
  };
  const summary = summarizeFleet(fleet);
  assert.equal(summary.total_calls_24h, 175);
  assert.equal(summary.total_cost_today_usd, round2(1.111 + 2.222 + 3.333));
  assert.equal(summary.degraded_agent_count, 1);
  assert.equal(summary.critical_agent_count, 1);
  assert.equal(summary.healthy_agent_count, 1);
  assert.equal(summary.agent_count, 3);
});

test("baseAgentFields/normalizeAgentRow round-trip through JSON-encoded hourly buckets", () => {
  const agent = {
    agent_id: "booking-assistant",
    name: "Booking Assistant",
    description: "desc",
    status: "healthy",
    calls_24h: 900,
    calls_48h: 1800,
    error_rate_pct: 1.2,
    p50_latency_ms: 950,
    p95_latency_ms: 2100,
    cost_per_call_usd: 0.018,
    cost_today_usd: 16.2,
    cost_7d_usd: 98.4,
    hourly: [{ hour: "2026-01-01T00:00:00.000Z", calls: 40, errors: 1 }],
  };
  const encoded = baseAgentFields(agent);
  assert.equal(typeof encoded.hourly, "string");
  const decoded = normalizeAgentRow(encoded);
  assert.equal(decoded.agent_id, agent.agent_id);
  assert.deepEqual(decoded.hourly, agent.hourly);
});

test("baseTraceFields/normalizeTraceRow round-trip through JSON-encoded steps", () => {
  const trace = {
    trace_id: "booking-assistant-trace-0001",
    agent_id: "booking-assistant",
    started_at: "2026-01-01T00:00:00.000Z",
    duration_ms: 2400,
    status: "error",
    cost_usd: 0.02,
    broke_at_step_id: "booking-assistant-t1-s3",
    steps: [
      { step_id: "booking-assistant-t1-s0", name: "parse_request", duration_ms: 120, status: "ok" },
      { step_id: "booking-assistant-t1-s3", name: "gateway.llm_call", duration_ms: 1400, status: "error" },
    ],
  };
  const encoded = baseTraceFields(trace);
  assert.equal(typeof encoded.steps, "string");
  const decoded = normalizeTraceRow(encoded);
  assert.equal(decoded.trace_id, trace.trace_id);
  assert.deepEqual(decoded.steps, trace.steps);
});

test("baseHandoffFields/normalizeHandoffRow round-trip", () => {
  const handoff = {
    handoff_id: "11111111-1111-1111-1111-111111111111",
    target_type: "trace",
    target_id: "booking-assistant-trace-0001",
    agent_id: "booking-assistant",
    status: "needs_investigation",
    note: "chain broke at payment_hold",
    created_at: "2026-01-01T00:00:00.000Z",
    created_by: "operator",
  };
  const encoded = baseHandoffFields(handoff);
  const decoded = normalizeHandoffRow(encoded);
  assert.deepEqual(
    { ...decoded, __recordId: undefined, __headCommitId: undefined },
    { ...handoff, __recordId: undefined, __headCommitId: undefined },
  );
});

test("buildFleetSnapshot assembles agents/metrics/traces from normalized rows", () => {
  const agentRows = [normalizeAgentRow({ agent_id: "a", name: "A", status: "healthy", calls_24h: 5 })];
  const traceRows = [normalizeTraceRow({ trace_id: "a-trace-0000", agent_id: "a", status: "ok" })];
  const snapshot = buildFleetSnapshot({ agentRows, traceRows, generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(snapshot.agents.length, 1);
  assert.equal(snapshot.agents[0].agent_id, "a");
  assert.equal(snapshot.metrics[0].calls_24h, 5);
  assert.equal(snapshot.traces[0].trace_id, "a-trace-0000");
  assert.equal(snapshot.generated_at, "2026-01-01T00:00:00.000Z");
});

test("destructured model functions never throw when called with no arguments (checkJs default-param gotcha)", () => {
  assert.doesNotThrow(() => normalizeAgentRow());
  assert.doesNotThrow(() => baseAgentFields());
  assert.doesNotThrow(() => normalizeTraceRow());
  assert.doesNotThrow(() => baseTraceFields());
  assert.doesNotThrow(() => normalizeHandoffRow());
  assert.doesNotThrow(() => baseHandoffFields());
  assert.doesNotThrow(() => buildFleetSnapshot());
});
