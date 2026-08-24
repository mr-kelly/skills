// Deterministic, fully offline demo payload for documentation/screenshots.
// Never reads or writes Busabase, never persists anything -- matches the
// ?demo=1 contract used across Kelly App-in-Skills. The four scenarios below
// are ported verbatim (same names, same figures, same decisions) from the
// retired app/server/demo.ts, which was also the same fixture
// scripts/generate_batch.ts seeded into a local file for first-run dev
// convenience -- there was no separate real batch-scenario intake path, so
// that script's dataset is folded in here instead of becoming a skill-root
// trusted script.
import { buildBatch, buildScenario, emptyDecision, simulateScenario } from "../simulator-model.js?v=0.1.0";

const NOW = "2026-07-10T09:00:00.000Z";

function scenario(
  name,
  business_type,
  avg_monthly_revenue,
  revenue_volatility_pct,
  principal,
  initial_share_rate_pct,
  step_down_share_rate_pct,
  repayment_cap_multiple,
  term_months,
  decisionAction = null,
  decisionNote = "",
) {
  const input = {
    business_type,
    avg_monthly_revenue,
    revenue_volatility_pct,
    principal,
    initial_share_rate_pct,
    step_down_share_rate_pct,
    repayment_cap_multiple,
    term_months,
  };
  const built = buildScenario(name, input, name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  built.created_at = NOW;
  built.updated_at = NOW;
  built.result = simulateScenario(input);
  built.decision = decisionAction ? { action: decisionAction, note: decisionNote, decided_at: NOW } : emptyDecision();
  return built;
}

function demoScenarios() {
  return [
    scenario(
      "Bubble Tea Chain — 12 Stores",
      "Bubble tea retail chain",
      420000,
      18,
      250000,
      6,
      3,
      1.4,
      18,
      "approve_underwriting",
      "Healthy cap coverage well inside the term; cost is reasonable for the segment.",
    ),
    scenario(
      "Fitness / Gym Chain — 5 Clubs",
      "Gym / fitness chain",
      180000,
      12,
      150000,
      8,
      4,
      1.5,
      24,
      "needs_revision",
      "Ask for a slightly lower initial rate; membership revenue is stable enough to support a longer, gentler ramp.",
    ),
    scenario(
      "Hotpot Restaurant Group — 8 Locations",
      "Hotpot restaurant group",
      560000,
      22,
      400000,
      7,
      3.5,
      1.6,
      24,
      null,
      "",
    ),
    scenario(
      "Discount Mart — Aggressive Ask (Risky)",
      "Discount retail mart",
      150000,
      35,
      300000,
      14,
      10,
      2,
      12,
      "reject",
      "Term is too short and rate too high for this revenue base — cap is not reached and merchant cost is punitive.",
    ),
  ];
}

const NAMES_ZH = {
  "Bubble Tea Chain — 12 Stores": "奶茶连锁 — 12 家门店",
  "Fitness / Gym Chain — 5 Clubs": "健身连锁 — 5 家门店",
  "Hotpot Restaurant Group — 8 Locations": "火锅餐饮集团 — 8 家门店",
  "Discount Mart — Aggressive Ask (Risky)": "折扣超市 — 激进方案（高风险）",
};

function localizeZh(scenarios) {
  return scenarios.map((s) => ({ ...s, name: NAMES_ZH[s.name] || s.name }));
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenarioParam = String(params.get("demo") || "overview");
    const lang = String(params.get("lang") || "");
    const zh = lang.toLowerCase().startsWith("zh");
    const scenarios = zh ? localizeZh(demoScenarios()) : demoScenarios();
    return {
      demo: true,
      demo_scenario: scenarioParam,
      app: "kelly-revshare-simulator",
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
      lock: null,
      config_summary: {
        config_path: "demo://kelly-revshare-simulator/config.json",
        is_example: false,
        base_currency: "USD",
        data_provider: "demo",
        underwriting_policy: {
          max_effective_annual_cost_pct: 40,
          min_cap_multiple: 1.2,
          max_cap_multiple: 2.5,
          max_term_months: 36,
        },
      },
      batch: buildBatch(scenarios, { batchId: "demo-2026-07-10", generatedAt: NOW }),
    };
  },

  async createScenario() {
    throw new Error("Demo mode is read-only.");
  },

  async updateScenario() {
    throw new Error("Demo mode is read-only.");
  },

  async saveDecision() {
    throw new Error("Demo mode is read-only.");
  },

  async deleteScenario() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
