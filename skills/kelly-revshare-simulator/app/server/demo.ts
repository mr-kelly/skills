// Deterministic, fully offline demo payload for documentation/screenshots.
// Never reads or writes local handoff files.

import { simulateScenario } from "../../lib/simulate.ts";
import { buildScenario, emptyDecision, recomputeMetrics } from "./store.ts";
import type { Scenario, ScenarioBatch } from "./types.ts";

interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

const NOW = "2026-07-10T09:00:00.000Z";

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

export function demoStatePayload(query: DemoQuery = {}): Record<string, unknown> {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const batch = zh ? localizeZh(demoBatch()) : demoBatch();
  return {
    demo: true,
    demo_scenario: scenario,
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
    batch,
  };
}

function localizeZh(batch: ScenarioBatch): ScenarioBatch {
  const names: Record<string, string> = {
    "Bubble Tea Chain — 12 Stores": "奶茶连锁 — 12 家门店",
    "Fitness / Gym Chain — 5 Clubs": "健身连锁 — 5 家门店",
    "Hotpot Restaurant Group — 8 Locations": "火锅餐饮集团 — 8 家门店",
    "Discount Mart — Aggressive Ask (Risky)": "折扣超市 — 激进方案（高风险）",
  };
  batch.scenarios = batch.scenarios.map((scenario) => ({
    ...scenario,
    name: names[scenario.name] || scenario.name,
  }));
  return batch;
}

function scenario(
  name: string,
  business_type: string,
  avg_monthly_revenue: number,
  revenue_volatility_pct: number,
  principal: number,
  initial_share_rate_pct: number,
  step_down_share_rate_pct: number,
  repayment_cap_multiple: number,
  term_months: number,
  decisionAction: Scenario["decision"]["action"] = null,
  decisionNote = "",
): Scenario {
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

function demoBatch(): ScenarioBatch {
  const scenarios: Scenario[] = [
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
  const batch: ScenarioBatch = {
    batch_id: "demo-2026-07-10",
    generated_at: NOW,
    source: "kelly-revshare-simulator-demo",
    mode: "app-in-skill",
    metrics: { total: 0, approved: 0, needs_revision: 0, rejected: 0, undecided: 0 },
    scenarios,
  };
  return recomputeMetrics(batch);
}
