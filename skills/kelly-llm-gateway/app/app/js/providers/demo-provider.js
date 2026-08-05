// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
//
// The route seeds, wobble/daily-series generator, and the 4 services / 5
// models below are ported verbatim (same ids, same figures, same spike
// parameters) from the retired lib/data-provider/seed-data.ts, which was
// shared by the retired app/server/demo.ts and scripts/seed_snapshot.ts.
// scripts/seed_snapshot.ts had no real external intake path — it only ever
// wrote this same deterministic seed to a local file for dev convenience —
// so its logic is folded in here instead of becoming a skill-root trusted
// script; there is no trusted-writer precedent (like kelly-money's provider
// sync or kelly-family-fund's CSV import) to preserve. Today/baseline
// metrics, totals, spend trend, and anomalies are computed by the same
// gateway-model.js functions the busabase provider uses, over this seed's
// raw `daily` series.
import {
  DEFAULT_COST_SPIKE_THRESHOLD_PCT,
  DEFAULT_ERROR_SPIKE_THRESHOLD_PCT,
  buildConfigSummary,
  buildSnapshot,
  round2,
} from "../gateway-model.js?v=0.1.0";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 14;
const NOW = new Date("2026-07-10T09:00:00.000Z");

const SERVICES = [
  { service_id: "support-bot", display_name: "Support Bot", team: "Customer Ops" },
  { service_id: "search-ranking", display_name: "Search Ranking", team: "Search Platform" },
  { service_id: "content-summarizer", display_name: "Content Summarizer", team: "Content Platform" },
  { service_id: "internal-copilot", display_name: "Internal Copilot", team: "Developer Platform" },
];

const MODELS = [
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
const ROUTE_SEEDS = [
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

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Deterministic day-of-week style wobble in [-1, 1] from a route/day seed —
// no Math.random, just a fixed periodic function so re-runs are byte-identical.
function wobble(seed, dayIndex) {
  return Math.sin(seed * 0.7 + dayIndex * 0.9) * 0.5 + Math.sin(seed * 1.3 + dayIndex * 0.31) * 0.5;
}

function buildDaily(seed, seedIndex, today) {
  const days = [];
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

function buildRoutes(today) {
  return ROUTE_SEEDS.map((seed, index) => ({
    route_id: seed.route_id,
    service_id: seed.service_id,
    model_id: seed.model_id,
    status: seed.status,
    canary_pct: seed.canary_pct,
    rollback_ready: seed.rollback_ready,
    note: seed.note,
    daily: buildDaily(seed, index + 1, today),
    cost_spike_ack: null,
    error_spike_ack: null,
    updated_at: today.toISOString(),
  }));
}

const DEMO_CONFIG_SUMMARY = buildConfigSummary({
  base_currency: "USD",
  cost_spike_threshold_pct: DEFAULT_COST_SPIKE_THRESHOLD_PCT,
  error_spike_threshold_pct: DEFAULT_ERROR_SPIKE_THRESHOLD_PCT,
  gateway: {
    region: "global",
    base_url: "https://gateway.internal.example/usage/v1",
    api_key_env: "KELLY_LLM_GATEWAY_API_KEY",
  },
});

// Ported verbatim from the retired app/server/demo.ts's localizeSnapshotZh.
const SERVICE_NAMES_ZH = {
  "support-bot": "客服机器人",
  "search-ranking": "搜索排序",
  "content-summarizer": "内容摘要",
  "internal-copilot": "内部助手",
};
const MODEL_NAMES_ZH = {
  "provider-a-model-large": "供应商 A / 大模型",
  "provider-a-model-small": "供应商 A / 小模型",
  "provider-b-model-pro": "供应商 B / 专业模型",
  "internal-model-v2": "内部模型 v2",
  "internal-model-v1-mini": "内部模型 v1-mini",
};

function localizeZh(services, models) {
  return {
    services: services.map((service) => ({
      ...service,
      display_name: SERVICE_NAMES_ZH[service.service_id] || service.display_name,
    })),
    models: models.map((model) => ({
      ...model,
      display_name: MODEL_NAMES_ZH[model.model_id] || model.display_name,
    })),
  };
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const lang = String(params.get("lang") || "");
    const zh = lang.toLowerCase().startsWith("zh");
    const { services, models } = zh ? localizeZh(SERVICES, MODELS) : { services: SERVICES, models: MODELS };
    const routes = buildRoutes(NOW);
    const snapshot = buildSnapshot({
      services,
      models,
      routes,
      configSummary: DEMO_CONFIG_SUMMARY,
      generatedAt: NOW.toISOString(),
    });
    snapshot.source = "kelly-llm-gateway-demo";
    return {
      app: "kelly-llm-gateway",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW.toISOString(), config_version: "demo" },
      lock: null,
      config_summary: DEMO_CONFIG_SUMMARY,
      snapshot,
    };
  },

  async decideRollout() {
    throw new Error("Demo mode is read-only.");
  },

  async ackAnomaly() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
