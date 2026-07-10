// Deterministic seed data for the LLM Gateway Cost & Governance Desk.
//
// This module is the single source of truth for the synthetic (but internally
// consistent) gateway snapshot used by the demo endpoint, the seed script, and
// (until a real gateway usage API is wired) the local data provider. It is a
// GENERIC, brand-free dataset: services and models are named after roles/tiers,
// never real companies or products.
//
// Pure module: no fs, no network, no Math.random. Every number is derived from
// fixed per-route parameters and the day index, so re-running this produces the
// exact same snapshot byte-for-byte (given the same "today").

import type {
  DailyMetric,
  GatewaySnapshot,
  Model,
  Route,
  Service,
  SpendTrendPoint,
  Totals,
} from "../../app/server/types.ts";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HISTORY_DAYS = 14;

export const SERVICES: Service[] = [
  { service_id: "support-bot", display_name: "Support Bot", team: "Customer Ops" },
  { service_id: "search-ranking", display_name: "Search Ranking", team: "Search Platform" },
  { service_id: "content-summarizer", display_name: "Content Summarizer", team: "Content Platform" },
  { service_id: "internal-copilot", display_name: "Internal Copilot", team: "Developer Platform" },
];

export const MODELS: Model[] = [
  {
    model_id: "provider-a-model-large",
    display_name: "Provider A / Model Large",
    provider: "Provider A",
    tier: "external",
  },
  {
    model_id: "provider-a-model-small",
    display_name: "Provider A / Model Small",
    provider: "Provider A",
    tier: "external",
  },
  {
    model_id: "provider-b-model-pro",
    display_name: "Provider B / Model Pro",
    provider: "Provider B",
    tier: "external",
  },
  { model_id: "internal-model-v2", display_name: "Internal Model v2", provider: "Internal", tier: "internal" },
  {
    model_id: "internal-model-v1-mini",
    display_name: "Internal Model v1-mini",
    provider: "Internal",
    tier: "internal",
  },
];

// route(id, service, model, status, canary_pct, rollback_ready, baseCalls, baseCost/call,
//   baseErrorRate, wobble (0..1, deterministic day-of-week wiggle), spike)
// spike: { dayOffsetFromEnd, costMultiplier, errorMultiplier } — 0 = "today".
interface RouteSeed {
  route_id: string;
  service_id: string;
  model_id: string;
  status: Route["status"];
  canary_pct: number;
  rollback_ready: boolean;
  note?: string;
  base_calls: number;
  cost_per_call: number;
  base_error_rate: number;
  spike?: { day_offset_from_end: number; cost_multiplier: number; error_multiplier: number };
}

const ROUTE_SEEDS: RouteSeed[] = [
  {
    route_id: "support-bot__provider-a-model-large",
    service_id: "support-bot",
    model_id: "provider-a-model-large",
    status: "stable",
    canary_pct: 0,
    rollback_ready: false,
    base_calls: 42000,
    cost_per_call: 0.014,
    base_error_rate: 0.006,
  },
  {
    route_id: "support-bot__internal-model-v2",
    service_id: "support-bot",
    model_id: "internal-model-v2",
    status: "canary",
    canary_pct: 35,
    rollback_ready: true,
    note: "Mid-rollout: quality parity confirmed, watching latency.",
    base_calls: 22000,
    cost_per_call: 0.006,
    base_error_rate: 0.009,
  },
  {
    route_id: "search-ranking__provider-b-model-pro",
    service_id: "search-ranking",
    model_id: "provider-b-model-pro",
    status: "stable",
    canary_pct: 0,
    rollback_ready: false,
    base_calls: 96000,
    cost_per_call: 0.021,
    base_error_rate: 0.004,
  },
  {
    route_id: "search-ranking__internal-model-v1-mini",
    service_id: "search-ranking",
    model_id: "internal-model-v1-mini",
    status: "canary",
    canary_pct: 15,
    rollback_ready: true,
    note: "Held at 15% pending an error-rate review.",
    base_calls: 14000,
    cost_per_call: 0.004,
    base_error_rate: 0.011,
    spike: { day_offset_from_end: 0, cost_multiplier: 1.1, error_multiplier: 4.2 },
  },
  {
    route_id: "content-summarizer__provider-a-model-small",
    service_id: "content-summarizer",
    model_id: "provider-a-model-small",
    status: "stable",
    canary_pct: 0,
    rollback_ready: false,
    base_calls: 58000,
    cost_per_call: 0.009,
    base_error_rate: 0.005,
  },
  {
    route_id: "content-summarizer__internal-model-v2",
    service_id: "content-summarizer",
    model_id: "internal-model-v2",
    status: "canary",
    canary_pct: 60,
    rollback_ready: true,
    note: "Cost regressed after a prompt-template change; rollback prepared.",
    base_calls: 31000,
    cost_per_call: 0.0065,
    base_error_rate: 0.007,
    spike: { day_offset_from_end: 0, cost_multiplier: 2.6, error_multiplier: 1.3 },
  },
  {
    route_id: "internal-copilot__provider-a-model-large",
    service_id: "internal-copilot",
    model_id: "provider-a-model-large",
    status: "stable",
    canary_pct: 0,
    rollback_ready: false,
    base_calls: 18000,
    cost_per_call: 0.016,
    base_error_rate: 0.003,
  },
  {
    route_id: "internal-copilot__internal-model-v2",
    service_id: "internal-copilot",
    model_id: "internal-model-v2",
    status: "canary",
    canary_pct: 95,
    rollback_ready: false,
    note: "Near-complete rollout; ready to promote to 100% pending sign-off.",
    base_calls: 26000,
    cost_per_call: 0.0055,
    base_error_rate: 0.004,
  },
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Deterministic day-of-week style wobble in [-1, 1] from a route/day seed —
// no Math.random, just a fixed periodic function so re-runs are byte-identical.
function wobble(seed: number, dayIndex: number): number {
  return Math.sin(seed * 0.7 + dayIndex * 0.9) * 0.5 + Math.sin(seed * 1.3 + dayIndex * 0.31) * 0.5;
}

function buildDaily(seed: RouteSeed, seedIndex: number, today: Date): DailyMetric[] {
  const days: DailyMetric[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i -= 1) {
    const date = new Date(today.getTime() - i * DAY_MS);
    const dayIndex = HISTORY_DAYS - 1 - i; // 0 = oldest, HISTORY_DAYS-1 = today
    const dayOffsetFromEnd = i; // 0 = today
    const w = wobble(seedIndex, dayIndex);
    const calls = Math.round(seed.base_calls * (1 + w * 0.12));
    let costPerCall = seed.cost_per_call;
    let errorRate = seed.base_error_rate * (1 + Math.max(0, -w) * 0.4);

    if (seed.spike && seed.spike.day_offset_from_end === dayOffsetFromEnd) {
      costPerCall *= seed.spike.cost_multiplier;
      errorRate *= seed.spike.error_multiplier;
    }

    const cost = round2(calls * costPerCall);
    const errors = Math.round(calls * errorRate);
    days.push({ date: isoDate(date), calls, cost, errors });
  }
  return days;
}

function baseline(daily: DailyMetric[], key: "cost" | "errorRate", excludeToday: boolean): number {
  const rows = excludeToday ? daily.slice(0, -1) : daily;
  if (!rows.length) return 0;
  if (key === "cost") return rows.reduce((sum, d) => sum + d.cost, 0) / rows.length;
  const errorRates = rows.map((d) => (d.calls ? d.errors / d.calls : 0));
  return errorRates.reduce((sum, v) => sum + v, 0) / errorRates.length;
}

function buildRoutes(today: Date): Route[] {
  return ROUTE_SEEDS.map((seed, index) => {
    const daily = buildDaily(seed, index + 1, today);
    const todayRow = daily[daily.length - 1];
    const errorRateToday = todayRow.calls ? todayRow.errors / todayRow.calls : 0;
    const costBaseline = baseline(daily, "cost", true);
    const errorRateBaseline = baseline(daily, "errorRate", true);
    return {
      route_id: seed.route_id,
      service_id: seed.service_id,
      model_id: seed.model_id,
      status: seed.status,
      canary_pct: seed.canary_pct,
      rollback_ready: seed.rollback_ready,
      note: seed.note,
      daily,
      calls_today: todayRow.calls,
      cost_today: todayRow.cost,
      error_rate_today: round4(errorRateToday),
      cost_baseline: round2(costBaseline),
      error_rate_baseline: round4(errorRateBaseline),
    } satisfies Route;
  });
}

function buildTotals(routes: Route[]): Totals {
  const calls_today = routes.reduce((sum, r) => sum + r.calls_today, 0);
  const cost_today = round2(routes.reduce((sum, r) => sum + r.cost_today, 0));
  const cost_7d_avg = round2(
    routes.reduce((sum, r) => {
      const last7 = r.daily.slice(-7);
      return sum + last7.reduce((s, d) => s + d.cost, 0) / last7.length;
    }, 0),
  );
  const totalErrors = routes.reduce((sum, r) => sum + r.daily[r.daily.length - 1].errors, 0);
  const error_rate_today = calls_today ? round4(totalErrors / calls_today) : 0;
  return { calls_today, cost_today, cost_7d_avg, error_rate_today };
}

function buildSpendTrend(routes: Route[]): SpendTrendPoint[] {
  const byDate = new Map<string, number>();
  for (const route of routes) {
    for (const day of route.daily) {
      byDate.set(day.date, round2((byDate.get(day.date) || 0) + day.cost));
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cost]) => ({ date, cost: round2(cost) }));
}

/**
 * Build the deterministic gateway snapshot for a given "today" (defaults to a
 * fixed reference date so the seed script and demo endpoint always agree).
 */
export function buildSnapshot(today: Date = new Date("2026-07-10T09:00:00.000Z")): GatewaySnapshot {
  const routes = buildRoutes(today);
  const totals = buildTotals(routes);
  const spend_trend = buildSpendTrend(routes);
  return {
    schema_version: "1",
    snapshot_id: `gateway-${isoDate(today)}`,
    generated_at: today.toISOString(),
    source: "kelly-llm-gateway-seed",
    base_currency: "USD",
    services: SERVICES,
    models: MODELS,
    routes,
    totals,
    spend_trend,
    anomalies: [],
    warnings: [],
  };
}
