// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
//
// The 21-lead mock pipeline below is ported verbatim (same brand names, same
// figures, same days_ago values) from the retired lib/mock-leads.ts, which
// was shared by the retired app/server/demo.ts and scripts/seed_leads.ts.
// scripts/seed_leads.ts had no real external intake path — it only ever
// wrote this same deterministic mock pipeline to a local file for dev
// convenience — so its logic is folded in here instead of becoming a
// skill-root trusted script; there is no trusted-writer precedent (like
// kelly-money's provider sync or kelly-family-fund's CSV import) to preserve.
import { DEFAULT_SCORING_CRITERIA, buildSnapshot } from "../lead-funnel-model.js?v=0.1.0";

const NOW = new Date("2026-07-01T15:00:00.000Z");

const RAW_LEADS = [
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

// Forward progression order for the non-terminal, non-rejected stages. Used
// to synthesize a full stage_history for leads seeded directly into a later
// stage, so hasReachedStage() in lead-funnel-model.js correctly counts
// cumulative funnel reach at every intermediate stage (not just the final
// one). Ported verbatim from the retired lib/mock-leads.ts.
const PROGRESSION = ["new", "data_verified", "scored", "term_sheet_ready"];

function buildStageHistory(raw, createdAt, updatedAt) {
  const history = [{ from: null, to: "new", at: createdAt }];
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

function buildLead(raw, index, now) {
  const createdAt = new Date(now.getTime() - raw.days_ago * 86400000).toISOString();
  const updatedAt = new Date(now.getTime() - Math.max(raw.days_ago - 1, 0) * 86400000).toISOString();
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
    rejection_reason: raw.rejection_reason,
    notes: raw.note
      ? [{ id: `note-${index + 1}-1`, text: raw.note, author: "sourcing-team", created_at: createdAt }]
      : [],
    stage_history: buildStageHistory(raw, createdAt, updatedAt),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function generateMockLeads(now = NOW) {
  return RAW_LEADS.map((raw, index) => buildLead(raw, index, now));
}

// Ported verbatim from the retired app/server/demo.ts.
const CITY_NAMES = {
  Austin: "奥斯汀",
  Denver: "丹佛",
  Phoenix: "凤凰城",
  Charlotte: "夏洛特",
  Portland: "波特兰",
  Seattle: "西雅图",
  "Las Vegas": "拉斯维加斯",
  "San Diego": "圣地亚哥",
  Miami: "迈阿密",
  Chicago: "芝加哥",
  Dallas: "达拉斯",
  "Los Angeles": "洛杉矶",
  "Salt Lake City": "盐湖城",
  Nashville: "纳什维尔",
  Atlanta: "亚特兰大",
  Boston: "波士顿",
  Houston: "休斯顿",
  "San Jose": "圣何塞",
  Memphis: "孟菲斯",
  "New Orleans": "新奥尔良",
  "Kansas City": "堪萨斯城",
};

function localizeZh(leads) {
  return leads.map((lead) => ({
    ...lead,
    city: CITY_NAMES[lead.city] || lead.city,
  }));
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "board");
    const lang = String(params.get("lang") || "");
    const zh = lang.toLowerCase().startsWith("zh");
    const rawLeads = zh ? localizeZh(generateMockLeads(NOW)) : generateMockLeads(NOW);
    const snapshot = buildSnapshot({ leads: rawLeads, criteria: DEFAULT_SCORING_CRITERIA });
    return {
      app: "kelly-lead-funnel",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW.toISOString(), config_version: "demo" },
      lock: null,
      config_summary: {
        config_path: "demo://kelly-lead-funnel/config.json",
        is_example: false,
        base_currency: "USD",
        fund_profile: {
          display_name: "Example Lending Fund",
          product: "SME merchant cash advance / revenue-based financing",
          target_check_size: "USD 50,000 - 2,000,000 monthly revenue equivalent",
        },
        scoring_criteria: DEFAULT_SCORING_CRITERIA,
      },
      leads: snapshot.leads,
      summary: snapshot.summary,
    };
  },

  async moveStage() {
    throw new Error("Demo mode is read-only.");
  },

  async addNote() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
