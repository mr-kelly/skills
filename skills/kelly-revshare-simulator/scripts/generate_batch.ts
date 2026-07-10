#!/usr/bin/env node
// Seed 3-4 example revenue-share scenarios into app/.data/scenarios.json so
// the app has something to review on first run. All names/figures are
// generic placeholders — no real company names.

import type { Scenario, ScenarioBatch } from "../app/server/types.ts";
import { ensureDirs } from "../lib/common.ts";
import { writeJson } from "../lib/common.ts";
import { SCENARIOS_PATH } from "../lib/paths.ts";
import { simulateScenario } from "../lib/simulate.ts";
import type { ScenarioInput } from "../lib/simulate.ts";

function scenario(
  id: string,
  name: string,
  input: ScenarioInput,
  decisionAction: Scenario["decision"]["action"] = null,
  note = "",
): Scenario {
  const now = new Date().toISOString();
  return {
    id,
    name,
    created_at: now,
    updated_at: now,
    input,
    result: simulateScenario(input),
    decision: { action: decisionAction, note, decided_at: decisionAction ? now : null },
  };
}

const scenarios: Scenario[] = [
  scenario(
    "bubble-tea-chain",
    "Bubble Tea Chain — 12 Stores",
    {
      business_type: "Bubble tea retail chain",
      avg_monthly_revenue: 420000,
      revenue_volatility_pct: 18,
      principal: 250000,
      initial_share_rate_pct: 6,
      step_down_share_rate_pct: 3,
      repayment_cap_multiple: 1.4,
      term_months: 18,
    },
    "approve_underwriting",
    "Healthy cap coverage well inside the term; cost is reasonable for the segment.",
  ),
  scenario(
    "gym-chain",
    "Fitness / Gym Chain — 5 Clubs",
    {
      business_type: "Gym / fitness chain",
      avg_monthly_revenue: 180000,
      revenue_volatility_pct: 12,
      principal: 150000,
      initial_share_rate_pct: 8,
      step_down_share_rate_pct: 4,
      repayment_cap_multiple: 1.5,
      term_months: 24,
    },
    "needs_revision",
    "Ask for a slightly lower initial rate; membership revenue is stable enough to support a longer, gentler ramp.",
  ),
  scenario(
    "hotpot-restaurant-group",
    "Hotpot Restaurant Group — 8 Locations",
    {
      business_type: "Hotpot restaurant group",
      avg_monthly_revenue: 560000,
      revenue_volatility_pct: 22,
      principal: 400000,
      initial_share_rate_pct: 7,
      step_down_share_rate_pct: 3.5,
      repayment_cap_multiple: 1.6,
      term_months: 24,
    },
    null,
    "",
  ),
  scenario(
    "discount-mart-risky",
    "Discount Mart — Aggressive Ask (Risky)",
    {
      business_type: "Discount retail mart",
      avg_monthly_revenue: 150000,
      revenue_volatility_pct: 35,
      principal: 300000,
      initial_share_rate_pct: 14,
      step_down_share_rate_pct: 10,
      repayment_cap_multiple: 2,
      term_months: 12,
    },
    "reject",
    "Term is too short and rate too high for this revenue base — cap is not reached and merchant cost is punitive.",
  ),
];

const batch: ScenarioBatch = {
  batch_id: `seed-${new Date().toISOString().slice(0, 10)}`,
  generated_at: new Date().toISOString(),
  source: "kelly-revshare-simulator",
  mode: "app-in-skill",
  metrics: { total: 0, approved: 0, needs_revision: 0, rejected: 0, undecided: 0 },
  scenarios,
};

batch.metrics = {
  total: scenarios.length,
  approved: scenarios.filter((s) => s.decision.action === "approve_underwriting").length,
  needs_revision: scenarios.filter((s) => s.decision.action === "needs_revision").length,
  rejected: scenarios.filter((s) => s.decision.action === "reject").length,
  undecided: scenarios.filter((s) => !s.decision.action).length,
};

await ensureDirs();
await writeJson(SCENARIOS_PATH, batch);
console.log(`Wrote ${SCENARIOS_PATH} with ${scenarios.length} scenarios`);
for (const s of scenarios) {
  console.log(
    `  - ${s.name}: cap_multiple=${s.input.repayment_cap_multiple}x months_to_cap=${s.result.months_to_cap ?? "not reached"} risk_flags=${s.result.risk_flags.length}`,
  );
}
