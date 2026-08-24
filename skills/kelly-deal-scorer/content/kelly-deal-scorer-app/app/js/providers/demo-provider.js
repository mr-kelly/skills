// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// Ported verbatim (same candidate order, same fixed timestamp, same
// index-based approved/blocked showcase statuses) from the retired
// app/server/demo.ts, now sharing CANDIDATE_SEEDS/computeScore/buildBatch
// with the trusted seed script and the live Busabase provider so all three
// always agree on scoring.
import {
  CANDIDATE_CITIES_ZH,
  CANDIDATE_NAMES_ZH,
  CANDIDATE_SEEDS,
  DEFAULT_RUBRIC,
  buildBatch,
  computeScore,
} from "../scorer-model.js?v=0.1.0";

const NOW = "2026-07-01T15:00:00.000Z";

function localizedName(id, zh) {
  if (!zh) return "";
  return CANDIDATE_NAMES_ZH[id] || "";
}

function localizedCity(id, zh) {
  if (!zh) return "";
  return CANDIDATE_CITIES_ZH[id] || "";
}

function demoBatch(zh = false) {
  const items = CANDIDATE_SEEDS.map((seed, index) => {
    const score = computeScore(seed, DEFAULT_RUBRIC);
    const status = index === 0 ? "approved" : index === 3 ? "blocked" : "needs_review";
    const candidate = {
      id: seed.id,
      business_name: zh ? localizedName(seed.id, true) || seed.business_name : seed.business_name,
      category: seed.category,
      city: zh ? localizedCity(seed.id, true) || seed.city : seed.city,
      requested_principal: seed.requested_principal,
      monthly_revenue: seed.monthly_revenue,
      red_flags: seed.red_flags,
      status,
      score,
    };
    if (status === "approved") {
      candidate.decision = {
        action: "approve_term_sheet",
        comment: "Strong stable revenue, low ratio.",
        decided_at: NOW,
      };
    }
    if (status === "blocked") {
      candidate.decision = {
        action: "reject",
        comment: "Six-month revenue downtrend, high principal ask.",
        decided_at: NOW,
      };
    }
    return candidate;
  });

  return buildBatch({ items, batchId: "demo-2026-07-01", generatedAt: NOW, source: "kelly-deal-scorer-demo" });
}

function activeLangIsZh() {
  const params = new URLSearchParams(window.location.search);
  const lang = String(params.get("lang") || "").toLowerCase();
  if (lang) return lang.startsWith("zh");
  return Boolean(navigator.languages?.some((item) => String(item).toLowerCase().startsWith("zh")));
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const zh = activeLangIsZh();
    const batch = demoBatch(zh);
    return {
      demo: true,
      app: "kelly-deal-scorer",
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
      lock: null,
      config_summary: {
        config_path: "demo://kelly-deal-scorer/config.json",
        is_example: false,
        base_currency: "USD",
        rubric: {
          weights: DEFAULT_RUBRIC.weights,
          decision_thresholds: DEFAULT_RUBRIC.decision_thresholds,
        },
      },
      batch,
    };
  },

  async submitReview() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
