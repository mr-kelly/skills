import { round2 } from "../../lib/common.ts";
import { computeInsights } from "./insights.ts";
import type { Contract, ContractStatus, PortfolioSnapshot } from "./types.ts";

// Deterministic mock-portfolio generator. Shared by scripts/generate_demo_snapshot.ts
// (writes app/.data/snapshot.json) and app/server/demo.ts (?demo=1 API payload) so
// both paths render an identical, offline, brand-free RBF/private-credit book.
// No network calls, no real company names.

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
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, list: T[]): T {
  return list[Math.floor(rand() * list.length)];
}

function range(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min);
}

export function generateContracts(count = 52, seed = 20260601): Contract[] {
  const rand = mulberry32(seed);
  const contracts: Contract[] = [];

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
    let progressFactor: number;
    if (personality < 0.18)
      progressFactor = range(rand, 0.35, 0.65); // lagging
    else if (personality < 0.3)
      progressFactor = range(rand, 1.02, 1.2); // ahead
    else progressFactor = range(rand, 0.82, 1.02); // on track

    const actualPct = Math.min(100, expectedPct * progressFactor);
    const cumulativeRepayment = round2((actualPct / 100) * capAmount);
    const status: ContractStatus = actualPct >= 100 ? "completed" : personality < 0.06 ? "delinquent" : "active";

    // Six months of monthly revenue driving the repayment %; some contracts
    // trend down (revenue-decline watchlist), most are flat/growing.
    const baseRevenue = round2(range(rand, 8000, 90000));
    const trendPersonality = rand();
    const monthlyRevenue: number[] = [];
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
    });
  }

  return contracts;
}

export function buildSnapshot(count = 52, seed = 20260601): PortfolioSnapshot {
  const contracts = generateContracts(count, seed);
  const snapshot: PortfolioSnapshot = {
    schema_version: "1",
    snapshot_id: `demo-${seed}`,
    generated_at: new Date().toISOString(),
    source: "kelly-portfolio-health-demo",
    base_currency: "USD",
    fund_name: "Sample RBF Fund I",
    contracts,
  };
  snapshot.insights = computeInsights(contracts);
  return snapshot;
}
