// Deterministic mock candidate seeds shared by the demo API scene and
// scripts/generate_batch.ts, so `?demo=1` and a real seeded batch show the same
// kind of data. Revenue series are hand-authored believable monthly time
// series (oldest -> newest), not random — repeatable screenshots and repeatable
// scoring.
import type { Category } from "../app/server/types.ts";

export interface CandidateSeed {
  id: string;
  business_name: string;
  category: Category;
  city: string;
  requested_principal: number;
  monthly_revenue: number[];
  red_flags: string[];
}

export const CANDIDATE_SEEDS: CandidateSeed[] = [
  {
    id: "cand-001",
    business_name: "Maple & Thyme Kitchen",
    category: "F&B",
    city: "Austin, TX",
    requested_principal: 180000,
    monthly_revenue: [61000, 63500, 58200, 66000, 69500, 71200, 68800, 74000, 76500, 79000, 81200, 83500],
    red_flags: [],
  },
  {
    id: "cand-002",
    business_name: "Northside Fitness Collective",
    category: "Fitness",
    city: "Denver, CO",
    requested_principal: 95000,
    monthly_revenue: [42000, 43500, 41000, 44800, 46200, 45500, 47000, 48200, 49500, 47800, 50200, 51500],
    red_flags: [],
  },
  {
    id: "cand-003",
    business_name: "Coastal Kids Learning Studio",
    category: "Education",
    city: "San Diego, CA",
    requested_principal: 60000,
    monthly_revenue: [28000, 29500, 30200, 31000, 32500, 33800, 34500, 35200, 36000, 37200, 38500, 39800],
    red_flags: [],
  },
  {
    id: "cand-004",
    business_name: "Ember & Oak BBQ",
    category: "F&B",
    city: "Nashville, TN",
    requested_principal: 220000,
    monthly_revenue: [88000, 92000, 79000, 71000, 66500, 61200, 58800, 54000, 51500, 49200, 46800, 44000],
    red_flags: ["recent_revenue_decline", "six_month_downtrend"],
  },
  {
    id: "cand-005",
    business_name: "Threadline Boutique",
    category: "Retail",
    city: "Charleston, SC",
    requested_principal: 75000,
    monthly_revenue: [35000, 41000, 29500, 44000, 31200, 46500, 33800, 48200, 30500, 45000, 34200, 47800],
    red_flags: ["high_seasonal_swing"],
  },
  {
    id: "cand-006",
    business_name: "Pixel Forge Print Shop",
    category: "Retail",
    city: "Portland, OR",
    requested_principal: 130000,
    monthly_revenue: [52000, 53500, 54800, 56200, 57500, 58800, 60200, 61500, 62800, 64200, 65500, 66800],
    red_flags: [],
  },
  {
    id: "cand-007",
    business_name: "Riverbend CrossFit",
    category: "Fitness",
    city: "Boise, ID",
    requested_principal: 210000,
    monthly_revenue: [24000, 25200, 23800, 26100, 25500, 27000, 26400, 28100, 27500, 29000, 28400, 30100],
    red_flags: ["high_principal_relative_to_revenue"],
  },
  {
    id: "cand-008",
    business_name: "Bright Path Tutoring Center",
    category: "Education",
    city: "Raleigh, NC",
    requested_principal: 45000,
    monthly_revenue: [18500, 19200, 19800, 20500, 21200, 22000, 22800, 23500, 24200, 25000, 25800, 26500],
    red_flags: [],
  },
];
