// Shared deterministic mock-lead generator used by scripts/seed_leads.ts (real
// local seed data for the app) and app/server/demo.ts (fully offline demo
// scenes). Kept in one place so both stay consistent. Generic, brand-neutral
// sample merchants — no references to any real company.

import { scoreLead, suggestNextAction } from "./scoring.ts";
import type { Category, Lead, LeadSource, Stage } from "./types.ts";

interface RawLead {
  brand_name: string;
  category: Category;
  city: string;
  store_count: number;
  est_monthly_revenue: number;
  lead_source: LeadSource;
  data_verifiable: boolean;
  stage: Stage;
  note?: string;
  rejection_reason?: string;
  days_ago: number;
}

const RAW_LEADS: RawLead[] = [
  {
    brand_name: "Golden Wok Kitchens",
    category: "food_beverage",
    city: "Austin",
    store_count: 18,
    est_monthly_revenue: 640000,
    lead_source: "outbound_sourcing",
    data_verifiable: true,
    stage: "term_sheet_ready",
    note: "Strong POS data across all 18 locations.",
    days_ago: 2,
  },
  {
    brand_name: "BrightSmile Dental Group",
    category: "healthcare",
    city: "Denver",
    store_count: 9,
    est_monthly_revenue: 410000,
    lead_source: "referral",
    data_verifiable: true,
    stage: "term_sheet_ready",
    note: "Referred by an existing portfolio company.",
    days_ago: 4,
  },
  {
    brand_name: "Sunrise Laundry Co.",
    category: "services",
    city: "Phoenix",
    store_count: 34,
    est_monthly_revenue: 285000,
    lead_source: "partner",
    data_verifiable: true,
    stage: "term_sheet_ready",
    days_ago: 6,
  },
  {
    brand_name: "Nova Fitness Studios",
    category: "services",
    city: "Charlotte",
    store_count: 12,
    est_monthly_revenue: 190000,
    lead_source: "inbound_web",
    data_verifiable: true,
    stage: "scored",
    note: "Waiting on Q2 statements before term sheet.",
    days_ago: 3,
  },
  {
    brand_name: "Cascade Coffee Roasters",
    category: "food_beverage",
    city: "Portland",
    store_count: 22,
    est_monthly_revenue: 520000,
    lead_source: "event",
    data_verifiable: true,
    stage: "scored",
    days_ago: 5,
  },
  {
    brand_name: "UrbanCart Grocers",
    category: "ecommerce",
    city: "Seattle",
    store_count: 6,
    est_monthly_revenue: 980000,
    lead_source: "outbound_sourcing",
    data_verifiable: true,
    stage: "scored",
    days_ago: 7,
  },
  {
    brand_name: "Metro Vape & Tobacco",
    category: "retail_discretionary",
    city: "Las Vegas",
    store_count: 45,
    est_monthly_revenue: 310000,
    lead_source: "inbound_web",
    data_verifiable: true,
    stage: "scored",
    note: "Category risk noted; monitor closely.",
    days_ago: 8,
  },
  {
    brand_name: "PetPal Grooming",
    category: "services",
    city: "San Diego",
    store_count: 15,
    est_monthly_revenue: 155000,
    lead_source: "referral",
    data_verifiable: false,
    stage: "data_verified",
    note: "Chasing bank statements from owner.",
    days_ago: 2,
  },
  {
    brand_name: "Halo Nail Bars",
    category: "retail_discretionary",
    city: "Miami",
    store_count: 27,
    est_monthly_revenue: 275000,
    lead_source: "outbound_sourcing",
    data_verifiable: true,
    stage: "data_verified",
    days_ago: 3,
  },
  {
    brand_name: "Frost & Vine Cafes",
    category: "food_beverage",
    city: "Chicago",
    store_count: 8,
    est_monthly_revenue: 195000,
    lead_source: "event",
    data_verifiable: true,
    stage: "data_verified",
    days_ago: 4,
  },
  {
    brand_name: "Ace Auto Detailing",
    category: "services",
    city: "Dallas",
    store_count: 11,
    est_monthly_revenue: 165000,
    lead_source: "partner",
    data_verifiable: true,
    stage: "data_verified",
    days_ago: 5,
  },
  {
    brand_name: "PixelWear Streetwear",
    category: "ecommerce",
    city: "Los Angeles",
    store_count: 4,
    est_monthly_revenue: 720000,
    lead_source: "inbound_web",
    data_verifiable: false,
    stage: "new",
    note: "No POS integration yet; verify via bank feed.",
    days_ago: 1,
  },
  {
    brand_name: "Highland Hardware",
    category: "other",
    city: "Salt Lake City",
    store_count: 3,
    est_monthly_revenue: 88000,
    lead_source: "outbound_sourcing",
    data_verifiable: false,
    stage: "new",
    days_ago: 1,
  },
  {
    brand_name: "Bloom Family Clinics",
    category: "healthcare",
    city: "Nashville",
    store_count: 7,
    est_monthly_revenue: 350000,
    lead_source: "referral",
    data_verifiable: true,
    stage: "new",
    days_ago: 2,
  },
  {
    brand_name: "Ember Grill House",
    category: "food_beverage",
    city: "Atlanta",
    store_count: 2,
    est_monthly_revenue: 62000,
    lead_source: "event",
    data_verifiable: false,
    stage: "new",
    days_ago: 2,
  },
  {
    brand_name: "Wanderlust Travel Gear",
    category: "retail_discretionary",
    city: "Boston",
    store_count: 1,
    est_monthly_revenue: 34000,
    lead_source: "inbound_web",
    data_verifiable: false,
    stage: "new",
    days_ago: 3,
  },
  {
    brand_name: "Crown Cleaners",
    category: "services",
    city: "Houston",
    store_count: 60,
    est_monthly_revenue: 210000,
    lead_source: "outbound_sourcing",
    data_verifiable: true,
    stage: "new",
    days_ago: 3,
  },
  {
    brand_name: "OneClick Gadgets",
    category: "ecommerce",
    city: "San Jose",
    store_count: 2,
    est_monthly_revenue: 4200000,
    lead_source: "inbound_web",
    data_verifiable: true,
    stage: "new",
    note: "Likely too large for our check size; sanity-check revenue.",
    days_ago: 4,
  },
  {
    brand_name: "Bargain Bin Outlet",
    category: "retail_discretionary",
    city: "Memphis",
    store_count: 1,
    est_monthly_revenue: 15000,
    lead_source: "outbound_sourcing",
    data_verifiable: false,
    stage: "rejected",
    rejection_reason: "Revenue too small for minimum check size and no verifiable data.",
    days_ago: 10,
  },
  {
    brand_name: "Skyline Tattoo Parlors",
    category: "other",
    city: "New Orleans",
    store_count: 3,
    est_monthly_revenue: 58000,
    lead_source: "event",
    data_verifiable: false,
    stage: "rejected",
    rejection_reason: "Category outside current risk appetite; owner declined to share financials.",
    days_ago: 12,
  },
  {
    brand_name: "Prime Freight Brokers",
    category: "other",
    city: "Kansas City",
    store_count: 1,
    est_monthly_revenue: 6500000,
    lead_source: "partner",
    data_verifiable: true,
    stage: "rejected",
    rejection_reason: "Single-location freight brokerage; concentration risk too high for this product.",
    days_ago: 9,
  },
];

export function generateMockLeads(now: Date = new Date()): Lead[] {
  return RAW_LEADS.map((raw, index) => buildLead(raw, index, now));
}

// Forward progression order for the non-terminal, non-rejected stages. Used
// to synthesize a full stage_history for leads seeded directly into a later
// stage, so `hasReachedStage` correctly counts cumulative funnel reach at
// every intermediate stage (not just the final one).
const PROGRESSION: Stage[] = ["new", "data_verified", "scored", "term_sheet_ready"];

function buildStageHistory(
  raw: RawLead,
  createdAt: string,
  updatedAt: string,
): { from: Stage | null; to: Stage; at: string }[] {
  const history: { from: Stage | null; to: Stage; at: string }[] = [{ from: null, to: "new", at: createdAt }];
  if (raw.stage === "new") return history;

  if (raw.stage === "rejected") {
    // Rejections in this mock data happen directly out of the "new" stage
    // (before further verification/scoring work is invested).
    history.push({ from: "new", to: "rejected", at: updatedAt });
    return history;
  }

  const targetIndex = PROGRESSION.indexOf(raw.stage);
  const createdMs = new Date(createdAt).getTime();
  const updatedMs = new Date(updatedAt).getTime();
  const stepMs = targetIndex > 0 ? (updatedMs - createdMs) / targetIndex : 0;
  for (let i = 1; i <= targetIndex; i++) {
    const at = new Date(createdMs + stepMs * i).toISOString();
    history.push({ from: PROGRESSION[i - 1], to: PROGRESSION[i], at });
  }
  return history;
}

function buildLead(raw: RawLead, index: number, now: Date): Lead {
  const createdAt = new Date(now.getTime() - raw.days_ago * 86400000).toISOString();
  const updatedAt = new Date(now.getTime() - Math.max(raw.days_ago - 1, 0) * 86400000).toISOString();
  const { score, breakdown } = scoreLead(raw);
  const suggested_action = raw.rejection_reason ? "closed_no_action" : suggestNextAction(score, raw.stage);
  return {
    id: `lead-${String(index + 1).padStart(3, "0")}`,
    brand_name: raw.brand_name,
    category: raw.category,
    city: raw.city,
    store_count: raw.store_count,
    est_monthly_revenue: raw.est_monthly_revenue,
    lead_source: raw.lead_source,
    data_verifiable: raw.data_verifiable,
    stage: raw.stage,
    score,
    score_breakdown: breakdown,
    suggested_action,
    rejection_reason: raw.rejection_reason,
    notes: raw.note
      ? [{ id: `note-${index + 1}-1`, text: raw.note, author: "sourcing-team", created_at: createdAt }]
      : [],
    stage_history: buildStageHistory(raw, createdAt, updatedAt),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}
