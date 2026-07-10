// Deterministic mock-data generator for the Agent Fleet Observability Desk.
// Produces a fake fleet of LLM agents running behind a shared AI gateway for a
// generic organization, with hourly call volume, latency, error rate, cost, and
// per-agent trace timelines (ordered tool-call steps) so a broken chain is
// visible. Used by both the seed script (scripts/generate_fleet_data.ts) and the
// server's demo mode (app/server/demo.ts) so both stay in sync.

import type { AgentDefinition, AgentMetrics, AgentStatus, FleetData, HourlyBucket, Trace, TraceStep } from "./types.ts";

export const AGENTS: AgentDefinition[] = [
  {
    agent_id: "booking-assistant",
    name: "Booking Assistant",
    description: "Handles travel and reservation booking requests end to end.",
  },
  {
    agent_id: "support-triage",
    name: "Support Triage",
    description: "Classifies and routes inbound support tickets to the right queue.",
  },
  {
    agent_id: "expense-approval",
    name: "Expense Approval",
    description: "Reviews expense reports against policy and approves or flags them.",
  },
  {
    agent_id: "itinerary-planner",
    name: "Itinerary Planner",
    description: "Builds multi-step travel itineraries from user preferences.",
  },
  {
    agent_id: "compliance-check",
    name: "Compliance Check",
    description: "Screens documents and requests against compliance rules.",
  },
  {
    agent_id: "vendor-sourcing",
    name: "Vendor Sourcing",
    description: "Finds and compares vendors/quotes for procurement requests.",
  },
  {
    agent_id: "meeting-scheduler",
    name: "Meeting Scheduler",
    description: "Coordinates calendars and books meetings across participants.",
  },
  {
    agent_id: "contract-summarizer",
    name: "Contract Summarizer",
    description: "Extracts key terms and risks from contract documents.",
  },
];

// Tool-call step names an agent trace can be built from, per agent flavor.
const STEP_LIBRARY: Record<string, string[]> = {
  "booking-assistant": [
    "parse_request",
    "search_inventory",
    "check_availability",
    "gateway.llm_call",
    "payment_hold",
    "confirm_booking",
  ],
  "support-triage": ["parse_request", "gateway.llm_call", "classify_intent", "lookup_customer", "route_ticket"],
  "expense-approval": ["parse_request", "extract_line_items", "policy_lookup", "gateway.llm_call", "approve_or_flag"],
  "itinerary-planner": [
    "parse_request",
    "gateway.llm_call",
    "search_flights",
    "search_hotels",
    "build_itinerary",
    "confirm_booking",
  ],
  "compliance-check": ["parse_request", "document_ocr", "gateway.llm_call", "rule_match", "risk_score"],
  "vendor-sourcing": ["parse_request", "gateway.llm_call", "search_vendors", "compare_quotes", "rank_results"],
  "meeting-scheduler": ["parse_request", "lookup_calendars", "gateway.llm_call", "find_slot", "send_invite"],
  "contract-summarizer": ["parse_request", "document_ocr", "gateway.llm_call", "extract_terms", "risk_score"],
};

// Small deterministic PRNG (mulberry32) so seeded output is stable across runs.
function mulberry32(seed: number) {
  let a = seed;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return h;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Per-agent baseline "personality": volume scale, latency scale, error tendency,
// and cost per call. Agent index picks a distinct profile so the fleet reads as
// varied, not random noise.
interface Profile {
  volume: number; // avg calls per hour
  latencyBase: number; // p50-ish base ms
  latencyJitter: number;
  errorBase: number; // 0..1 base error probability
  costPerCall: number;
  troubled: boolean; // biases this agent toward degraded/critical for demo realism
}

const PROFILES: Profile[] = [
  { volume: 42, latencyBase: 900, latencyJitter: 400, errorBase: 0.01, costPerCall: 0.018, troubled: false },
  { volume: 65, latencyBase: 650, latencyJitter: 300, errorBase: 0.02, costPerCall: 0.009, troubled: false },
  { volume: 28, latencyBase: 1200, latencyJitter: 500, errorBase: 0.09, costPerCall: 0.024, troubled: true },
  { volume: 20, latencyBase: 1800, latencyJitter: 900, errorBase: 0.03, costPerCall: 0.041, troubled: false },
  { volume: 33, latencyBase: 1100, latencyJitter: 450, errorBase: 0.045, costPerCall: 0.02, troubled: false },
  { volume: 15, latencyBase: 2200, latencyJitter: 1100, errorBase: 0.11, costPerCall: 0.055, troubled: true },
  { volume: 50, latencyBase: 500, latencyJitter: 200, errorBase: 0.015, costPerCall: 0.006, troubled: false },
  { volume: 18, latencyBase: 2600, latencyJitter: 1200, errorBase: 0.02, costPerCall: 0.062, troubled: false },
];

function statusFor(errorRatePct: number, p95: number): AgentStatus {
  if (errorRatePct >= 8 || p95 >= 8000) return "critical";
  if (errorRatePct >= 3 || p95 >= 4000) return "degraded";
  return "healthy";
}

function buildHourly(rng: () => number, profile: Profile, hours: number, nowMs: number): HourlyBucket[] {
  const buckets: HourlyBucket[] = [];
  for (let i = hours - 1; i >= 0; i -= 1) {
    const hourStart = new Date(Math.floor(nowMs / 3600000) * 3600000 - i * 3600000);
    const dayPhase = hourStart.getUTCHours();
    // Business-hours-ish curve: lower overnight, higher mid-day.
    const curve = 0.35 + 0.65 * Math.sin((Math.PI * Math.max(0, Math.min(23, dayPhase - 3))) / 20) ** 2;
    const calls = Math.max(0, Math.round(profile.volume * curve * (0.75 + rng() * 0.5)));
    const errorProb = profile.errorBase * (0.6 + rng() * 0.9);
    const errors = Math.min(calls, Math.round(calls * errorProb));
    buckets.push({ hour: hourStart.toISOString(), calls, errors });
  }
  return buckets;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function buildLatencySamples(rng: () => number, profile: Profile, count: number): number[] {
  const samples: number[] = [];
  for (let i = 0; i < count; i += 1) {
    // Rough log-normal-ish shape via sum of uniforms, biased by profile.
    const base = profile.latencyBase + rng() * profile.latencyJitter;
    const tailSpike = rng() < 0.06 ? profile.latencyJitter * (2 + rng() * 3) : 0;
    samples.push(Math.max(50, Math.round(base + tailSpike)));
  }
  return samples.sort((a, b) => a - b);
}

function buildTraces(rng: () => number, agentId: string, profile: Profile, nowMs: number, count: number): Trace[] {
  const steps = STEP_LIBRARY[agentId] || ["parse_request", "gateway.llm_call", "finalize"];
  const traces: Trace[] = [];
  for (let i = 0; i < count; i += 1) {
    const startedAt = new Date(nowMs - Math.round(rng() * 24 * 3600000));
    const isBroken = rng() < profile.errorBase * 2.2;
    const breakIndex = isBroken ? 1 + Math.floor(rng() * (steps.length - 1)) : -1;
    let cumulative = 0;
    let cost = 0;
    const traceSteps: TraceStep[] = [];
    for (let s = 0; s < steps.length; s += 1) {
      if (isBroken && s > breakIndex) break;
      const duration = Math.round(60 + rng() * 500 + (steps[s].includes("llm_call") ? 400 + rng() * 900 : 0));
      cumulative += duration;
      const status: "ok" | "error" = isBroken && s === breakIndex ? "error" : "ok";
      cost += steps[s].includes("llm_call") ? profile.costPerCall * (0.8 + rng() * 0.4) : 0;
      traceSteps.push({
        step_id: `${agentId}-t${i}-s${s}`,
        name: steps[s],
        duration_ms: duration,
        status,
        detail: status === "error" ? errorDetailFor(steps[s], rng) : undefined,
      });
    }
    traces.push({
      trace_id: `${agentId}-trace-${i.toString().padStart(4, "0")}`,
      agent_id: agentId,
      started_at: startedAt.toISOString(),
      duration_ms: cumulative,
      status: isBroken ? "error" : "ok",
      cost_usd: round2(cost || profile.costPerCall),
      broke_at_step_id: isBroken ? traceSteps[traceSteps.length - 1]?.step_id : undefined,
      steps: traceSteps,
    });
  }
  // Most recent first.
  return traces.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
}

function errorDetailFor(stepName: string, rng: () => number): string {
  const options = [
    `${stepName} timed out waiting on an upstream dependency.`,
    `${stepName} returned a validation error on the request payload.`,
    `${stepName} hit a rate limit from a downstream service.`,
    `${stepName} received an unexpected empty response.`,
    `${stepName} failed authentication against a downstream system.`,
  ];
  return options[Math.floor(rng() * options.length)];
}

export interface GenerateOptions {
  now?: Date;
  seed?: number;
  tracesPerAgent?: number;
}

export function generateFleetData(options: GenerateOptions = {}): FleetData {
  const now = options.now || new Date();
  const nowMs = now.getTime();
  const metrics: AgentMetrics[] = [];
  const traces: Trace[] = [];

  AGENTS.forEach((agent, index) => {
    const profile = PROFILES[index % PROFILES.length];
    const seed = (options.seed ?? 1) + hashString(agent.agent_id);
    const rng = mulberry32(seed);

    const hourly = buildHourly(rng, profile, 48, nowMs);
    const last24 = hourly.slice(-24);
    const calls24h = last24.reduce((sum, b) => sum + b.calls, 0);
    const calls48h = hourly.reduce((sum, b) => sum + b.calls, 0);
    const errors24h = last24.reduce((sum, b) => sum + b.errors, 0);
    const errorRatePct = calls24h ? round2((errors24h / calls24h) * 100) : 0;

    const latencySamples = buildLatencySamples(rng, profile, Math.max(50, calls24h));
    const p50 = percentile(latencySamples, 50);
    const p95 = percentile(latencySamples, 95);

    const costToday = round2(calls24h * profile.costPerCall * (0.9 + rng() * 0.2));
    const cost7d = round2(costToday * (5 + rng() * 3));

    metrics.push({
      agent_id: agent.agent_id,
      status: statusFor(errorRatePct, p95),
      calls_24h: calls24h,
      calls_48h: calls48h,
      error_rate_pct: errorRatePct,
      p50_latency_ms: p50,
      p95_latency_ms: p95,
      cost_per_call_usd: profile.costPerCall,
      cost_today_usd: costToday,
      cost_7d_usd: cost7d,
      hourly,
    });

    traces.push(...buildTraces(rng, agent.agent_id, profile, nowMs, options.tracesPerAgent ?? 14));
  });

  return {
    schema_version: "1",
    generated_at: now.toISOString(),
    agents: AGENTS,
    metrics,
    traces,
  };
}

export function summarizeFleet(fleet: FleetData) {
  const totalCalls24h = fleet.metrics.reduce((sum, m) => sum + m.calls_24h, 0);
  const totalCostToday = fleet.metrics.reduce((sum, m) => sum + m.cost_today_usd, 0);
  const degraded = fleet.metrics.filter((m) => m.status === "degraded").length;
  const critical = fleet.metrics.filter((m) => m.status === "critical").length;
  const healthy = fleet.metrics.filter((m) => m.status === "healthy").length;
  return {
    generated_at: fleet.generated_at,
    total_calls_24h: totalCalls24h,
    total_cost_today_usd: round2(totalCostToday),
    degraded_agent_count: degraded,
    critical_agent_count: critical,
    healthy_agent_count: healthy,
    agent_count: fleet.agents.length,
  };
}
