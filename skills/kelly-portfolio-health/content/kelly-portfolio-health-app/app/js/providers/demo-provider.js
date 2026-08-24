// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
//
// The category/city lists, the mulberry32 PRNG, and generateContracts() are
// ported verbatim (same variable names, same order of operations) from the
// retired app/server/dataset.ts, which was shared by
// scripts/generate_demo_snapshot.ts (wrote app/.data/snapshot.json) and
// app/server/demo.ts (the ?demo=1 API payload). Neither retired script had a
// real external intake path — generate_demo_snapshot.ts only ever wrote this
// same deterministic mock book to a local file for dev convenience, and
// validate_ui_schema.ts had no equivalent need once Busabase enforces the
// Base schema — so neither becomes a skill-root trusted script; both are
// folded in here instead. Insights/totals are computed by the same
// portfolio-model.js functions the busabase provider uses, over this seed's
// raw contract rows.
import { buildSnapshot, round2 } from "../portfolio-model.js?v=0.1.0";

const CATEGORIES = [
  "Retail",
  "Food & Beverage",
  "E-commerce",
  "Personal Services",
  "Healthcare Services",
  "Logistics & Delivery",
  "Professional Services",
  "Light Manufacturing",
];

const CITIES = [
  "Riverton",
  "Fairview",
  "Lakeside",
  "Cedar Falls",
  "Millbrook",
  "Brookhaven",
  "Ashford",
  "Port Delgado",
  "Highgate",
  "Elmswood",
];

// Small mulberry32 PRNG so the generated book is reproducible run to run.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function range(rand, min, max) {
  return min + rand() * (max - min);
}

function generateContracts(count = 52, seed = 20260601) {
  const rand = mulberry32(seed);
  const contracts = [];

  for (let i = 0; i < count; i += 1) {
    const category = pick(rand, CATEGORIES);
    const city = pick(rand, CITIES);
    const fundingAmount = round2(range(rand, 15000, 160000));
    const capMultiple = round2(range(rand, 1.12, 1.42));
    const capAmount = round2(fundingAmount * capMultiple);
    const expectedTermMonths = Math.round(range(rand, 10, 30));
    const monthsSinceOrigination = Math.min(expectedTermMonths + 8, Math.round(range(rand, 1, 26)));

    // Decide a repayment "personality" per contract: on-track, lagging, or ahead.
    const personality = rand();
    const expectedPct = Math.min(100, (monthsSinceOrigination / expectedTermMonths) * 100);
    let progressFactor;
    if (personality < 0.18)
      progressFactor = range(rand, 0.35, 0.65); // lagging
    else if (personality < 0.3)
      progressFactor = range(rand, 1.02, 1.2); // ahead
    else progressFactor = range(rand, 0.82, 1.02); // on track

    const actualPct = Math.min(100, expectedPct * progressFactor);
    const cumulativeRepayment = round2((actualPct / 100) * capAmount);
    const status = actualPct >= 100 ? "completed" : personality < 0.06 ? "delinquent" : "active";

    // Six months of monthly revenue driving the repayment %; some contracts
    // trend down (revenue-decline watchlist), most are flat/growing.
    const baseRevenue = round2(range(rand, 8000, 90000));
    const trendPersonality = rand();
    const monthlyRevenue = [];
    let value = baseRevenue;
    for (let m = 0; m < 6; m += 1) {
      if (trendPersonality < 0.2)
        value *= range(rand, 0.82, 0.95); // declining
      else if (trendPersonality < 0.35)
        value *= range(rand, 1.02, 1.12); // growing
      else value *= range(rand, 0.94, 1.06); // flat/noisy
      monthlyRevenue.push(round2(value));
    }

    const origination = new Date();
    origination.setMonth(origination.getMonth() - monthsSinceOrigination);

    contracts.push({
      id: `rbf-${String(i + 1).padStart(4, "0")}`,
      business_name: `${category.split(" ")[0]} Partner ${String(i + 1).padStart(3, "0")}`,
      category,
      city,
      origination_date: origination.toISOString().slice(0, 10),
      months_since_origination: monthsSinceOrigination,
      expected_term_months: expectedTermMonths,
      funding_amount: fundingAmount,
      cap_multiple: capMultiple,
      cap_amount: capAmount,
      cumulative_repayment: cumulativeRepayment,
      monthly_revenue: monthlyRevenue,
      status,
      currency: "USD",
      flagged: false,
      note: "",
      decision_updated_at: "",
    });
  }

  return contracts;
}

const DEMO_CONFIG_SUMMARY = {
  config_path: "demo://kelly-portfolio-health/config.json",
  is_example: false,
  base_currency: "USD",
  fund_name: "Sample RBF Fund I",
  risk_policy: { lag_watch_pp: 15, lag_high_pp: 25, revenue_decline_pct: 10 },
};

// Ported verbatim from the retired app/server/demo.ts's localizeSnapshotZh
// category map. Contracts are localized before insights are computed (unlike
// the retired demo.ts, which localized the already-computed insights
// separately), so concentration/progress/watchlist category labels come out
// in Chinese without a second translation pass.
const CATEGORY_ZH = {
  Retail: "零售",
  "Food & Beverage": "餐饮",
  "E-commerce": "电子商务",
  "Personal Services": "个人服务",
  "Healthcare Services": "医疗服务",
  "Logistics & Delivery": "物流配送",
  "Professional Services": "专业服务",
  "Light Manufacturing": "轻工制造",
};

function localizeZh(contracts) {
  return contracts.map((c) => ({ ...c, category: CATEGORY_ZH[c.category] || c.category }));
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const lang = String(params.get("lang") || "");
    const zh = lang.toLowerCase().startsWith("zh");
    const contracts = generateContracts();
    const configSummary = zh ? { ...DEMO_CONFIG_SUMMARY, fund_name: "示例收入分成基金 I" } : DEMO_CONFIG_SUMMARY;
    const snapshot = buildSnapshot({
      contracts: zh ? localizeZh(contracts) : contracts,
      configSummary,
      generatedAt: new Date().toISOString(),
      source: "kelly-portfolio-health-demo",
    });
    return {
      app: "kelly-portfolio-health",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: snapshot.generated_at, config_version: "demo" },
      lock: null,
      config_summary: configSummary,
      snapshot,
    };
  },

  async decideContract() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
