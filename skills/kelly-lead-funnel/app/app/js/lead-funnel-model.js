// Domain model for Kelly Lead Funnel: deal sourcing pipeline / kanban board
// for a BD/sourcing team triaging merchant and business financing leads.
// Scoring and funnel-summary logic are ported verbatim (same variable names,
// same order of operations, only TS types stripped) from the retired
// lib/scoring.ts and lib/funnel-summary.ts — this is NOT an LLM call and
// never should be: score is a pure function of a lead's own fields and the
// fund's scoring_criteria config, and funnel conversion is a pure per-stage
// rollup. Read this file before changing scoring or funnel-summary behavior.
//
// Architectural change from the retired local-file shape: score,
// score_breakdown, and suggested_action are never stored on the Busabase
// `leads` record — they are pure/derived from store_count,
// est_monthly_revenue, category, data_verifiable, and stage, so they are
// recomputed live on every read (buildSnapshot) instead of persisted, the
// same "reads are always live" simplification used across this batch of
// conversions (a scoring_criteria change is reflected immediately, with no
// staleness to manage). Only the fields a human actually decides (stage,
// rejection_reason, notes, stage_history) are stored on the record. This is
// a direct-manipulation kanban board, not a review/approval queue: there is
// no separate decisions bucket — stage moves, rejections, and notes are
// written straight onto the lead's own record.

export const STAGES = ["new", "data_verified", "scored", "term_sheet_ready", "rejected"];

// ---- lib/scoring.ts, ported verbatim ----
//
// Weights (sum to 100):
//   30  chain_size_fit        — store_count vs the fund's ideal chain-size band
//   30  revenue_scale_fit     — est_monthly_revenue vs the fund's target check size
//   25  category_risk         — merchant category risk tier
//   15  data_verifiability    — whether the lead's business data can be verified

export const DEFAULT_SCORING_CRITERIA = {
  ideal_store_count_min: 5,
  ideal_store_count_max: 150,
  ideal_monthly_revenue_min: 50000,
  ideal_monthly_revenue_max: 2000000,
  low_risk_categories: ["services", "healthcare"],
  medium_risk_categories: ["food_beverage", "ecommerce"],
  higher_risk_categories: ["retail_discretionary", "other"],
};

function resolveCriteria(criteria = {}) {
  return { ...DEFAULT_SCORING_CRITERIA, ...(criteria || {}) };
}

function chainSizeFactor(storeCount = 0, criteria = {}) {
  const { ideal_store_count_min: min, ideal_store_count_max: max } = criteria;
  let contribution;
  let rationale;
  if (storeCount >= min && storeCount <= max) {
    contribution = 30;
    rationale = `${storeCount} stores is within the ideal ${min}-${max} chain-size band.`;
  } else if (storeCount >= 2 && storeCount < min) {
    contribution = 18;
    rationale = `${storeCount} stores is below the ideal band (${min}+); early-stage chain risk.`;
  } else if (storeCount < 2) {
    contribution = 10;
    rationale = "Single-unit business; higher concentration/key-person risk.";
  } else if (storeCount > max && storeCount <= max * 3.3) {
    contribution = 22;
    rationale = `${storeCount} stores exceeds the ideal band; likely has other financing options.`;
  } else {
    contribution = 12;
    rationale = `${storeCount} stores is far outside the target band for this check size.`;
  }
  return { factor: "chain_size_fit", weight: 30, contribution, rationale };
}

function revenueScaleFactor(monthlyRevenue = 0, criteria = {}) {
  const { ideal_monthly_revenue_min: min, ideal_monthly_revenue_max: max } = criteria;
  let contribution;
  let rationale;
  if (monthlyRevenue >= min && monthlyRevenue <= max) {
    contribution = 30;
    rationale = `Est. monthly revenue fits the target check-size band (${money(min)}-${money(max)}).`;
  } else if (monthlyRevenue >= min * 0.4 && monthlyRevenue < min) {
    contribution = 18;
    rationale = `Est. monthly revenue is below the target band (${money(min)}+); may need a smaller facility.`;
  } else if (monthlyRevenue < min * 0.4) {
    contribution = 8;
    rationale = "Est. monthly revenue is well below the fund's minimum check size.";
  } else if (monthlyRevenue > max && monthlyRevenue <= max * 2.5) {
    contribution = 20;
    rationale = "Est. monthly revenue exceeds the target band; likely qualifies for cheaper bank credit.";
  } else {
    contribution = 10;
    rationale = "Est. monthly revenue is far outside the fund's target check size.";
  }
  return { factor: "revenue_scale_fit", weight: 30, contribution, rationale };
}

function categoryRiskFactor(category = "other", criteria = {}) {
  let contribution;
  let tier;
  if ((criteria.low_risk_categories || []).includes(category)) {
    contribution = 25;
    tier = "low";
  } else if ((criteria.medium_risk_categories || []).includes(category)) {
    contribution = 18;
    tier = "medium";
  } else if ((criteria.higher_risk_categories || []).includes(category)) {
    contribution = 12;
    tier = "higher";
  } else {
    contribution = 15;
    tier = "unclassified";
  }
  return {
    factor: "category_risk",
    weight: 25,
    contribution,
    rationale: `${categoryLabel(category)} is a ${tier}-risk category for revenue-based financing.`,
  };
}

function dataVerifiabilityFactor(verifiable = false) {
  return {
    factor: "data_verifiability",
    weight: 15,
    contribution: verifiable ? 15 : 5,
    rationale: verifiable
      ? "Bank/POS or platform data is available for independent verification."
      : "No independently verifiable revenue data yet; underwriting risk until verified.",
  };
}

function categoryLabel(category = "other") {
  return category.replaceAll("_", " ");
}

function money(value = 0) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/**
 * Compute a deterministic 0-100 lead-quality score with a full factor
 * breakdown. Pure function: (lead, criteria) -> { score, breakdown }.
 */
export function scoreLead(
  { store_count = 0, est_monthly_revenue = 0, category = "other", data_verifiable = false } = {},
  criteria = {},
) {
  const resolved = resolveCriteria(criteria);
  const breakdown = [
    chainSizeFactor(store_count, resolved),
    revenueScaleFactor(est_monthly_revenue, resolved),
    categoryRiskFactor(category, resolved),
    dataVerifiabilityFactor(data_verifiable),
  ];
  const score = Math.round(breakdown.reduce((sum, factor) => sum + factor.contribution, 0));
  return { score, breakdown };
}

/**
 * Suggest the next concrete action for a lead given its score and stage.
 * Deterministic mapping, not a recommendation engine.
 */
export function suggestNextAction(score = 0, stage = "new") {
  if (stage === "rejected") return "closed_no_action";
  if (stage === "term_sheet_ready") return "hand_off_to_underwriting";
  if (!scoreQualifiesForVerification(score) && stage === "new") return "flag_for_reject_review";
  if (score >= 75) return "advance_to_term_sheet";
  if (score >= 55) return stage === "new" ? "request_data_verification" : "advance_to_scored";
  return "flag_for_reject_review";
}

function scoreQualifiesForVerification(score = 0) {
  return score >= 30;
}

// ---- lib/funnel-summary.ts, ported verbatim ----

export function computeFunnelSummary(leads = []) {
  const total = leads.length;
  const counts = new Map();
  for (const stage of STAGES) counts.set(stage, 0);
  for (const lead of leads) counts.set(lead.stage, (counts.get(lead.stage) || 0) + 1);

  const by_stage = STAGES.map((stage) => {
    const count = counts.get(stage) || 0;
    // Conversion is "reached this stage or further" relative to New, so it
    // reads as a funnel drop-off rather than a point-in-time snapshot count.
    const reached = leads.filter((lead) => hasReachedStage(lead, stage)).length;
    return {
      stage,
      count,
      conversion_from_new_pct: total ? round1((reached / total) * 100) : 0,
    };
  });

  const termSheetReady = counts.get("term_sheet_ready") || 0;
  const rejected = counts.get("rejected") || 0;
  return {
    total,
    by_stage,
    overall_conversion_pct: total ? round1((termSheetReady / total) * 100) : 0,
    rejection_rate_pct: total ? round1((rejected / total) * 100) : 0,
  };
}

function hasReachedStage(lead, stage) {
  if (stage === "new") return true;
  if (stage === "rejected") return lead.stage === "rejected";
  return (lead.stage_history || []).some((change) => change.to === stage) || lead.stage === stage;
}

function round1(value = 0) {
  return Math.round(value * 10) / 10;
}

// ---- Busabase row <-> Lead normalization ----

function parseJsonArray(value = "") {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Normalizes a Busabase `leads` row (already snake_cased by the provider)
// into the Lead shape the UI renders. score/score_breakdown/suggested_action
// are attached separately by buildSnapshot() once the fund's
// scoring_criteria is known — see the module comment above.
export function normalizeLeadRow({
  lead_id = "",
  brand_name = "",
  category = "other",
  city = "",
  store_count = 0,
  est_monthly_revenue = 0,
  lead_source = "outbound_sourcing",
  data_verifiable = "false",
  stage = "new",
  rejection_reason = "",
  notes = "",
  stage_history = "",
  created_at = "",
  updated_at = "",
  __recordId = undefined,
  __headCommitId = undefined,
} = {}) {
  return {
    id: lead_id,
    brand_name,
    category,
    city,
    store_count: Number(store_count) || 0,
    est_monthly_revenue: Number(est_monthly_revenue) || 0,
    lead_source,
    data_verifiable: String(data_verifiable) === "true",
    stage,
    rejection_reason: rejection_reason || undefined,
    notes: parseJsonArray(notes),
    stage_history: parseJsonArray(stage_history),
    created_at,
    updated_at,
    __recordId,
    __headCommitId,
  };
}

// Attaches the derived score/score_breakdown/suggested_action fields the UI
// needs on top of a normalized lead. Pure, recomputed on every read.
function withScore(lead, criteria = {}) {
  const { score, breakdown } = scoreLead(lead, criteria);
  const suggested_action = lead.rejection_reason ? "closed_no_action" : suggestNextAction(score, lead.stage);
  return { ...lead, score, score_breakdown: breakdown, suggested_action };
}

// Builds the { leads, summary } shape app.js renders: attaches the derived
// score to every lead, then computes the funnel summary over the scored
// leads (score itself does not affect the funnel summary, but this keeps a
// single pass over the pipeline for both derived views).
export function buildSnapshot({ leads = [], criteria = {} } = {}) {
  const scored = leads.map((lead) => withScore(lead, criteria));
  return {
    leads: scored,
    summary: computeFunnelSummary(scored),
  };
}

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields). Every destructured parameter carries a default
// so checkJs never infers a required-but-absent property. Busabase has no
// boolean field type, so data_verifiable is written as a "true"/"false"
// string (see the migration recipe's field-type note).
export function baseLeadFields({
  id = "",
  brand_name = "",
  category = "other",
  city = "",
  store_count = 0,
  est_monthly_revenue = 0,
  lead_source = "outbound_sourcing",
  data_verifiable = false,
  stage = "new",
  rejection_reason = "",
  notes = [],
  stage_history = [],
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    lead_id: id,
    brand_name,
    category,
    city,
    store_count: Number(store_count) || 0,
    est_monthly_revenue: Number(est_monthly_revenue) || 0,
    lead_source,
    data_verifiable: data_verifiable ? "true" : "false",
    stage,
    rejection_reason: rejection_reason || "",
    notes: JSON.stringify(notes || []),
    stage_history: JSON.stringify(stage_history || []),
    created_at,
    updated_at,
  };
}

function newId(prefix) {
  const random =
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}-${String(random).replaceAll("-", "").slice(0, 8)}`;
}

// Ported from LocalFileProvider.moveStage() in the retired
// lib/data-provider/local-file-provider.ts — pure state-transition version.
// The Busabase-only shape writes the result straight onto the lead's own
// record (a direct kanban write, not a decision/approval flow); Busabase's
// own ChangeRequest history is the audit trail, replacing the retired
// handoff_log.json.
export function applyStageMove(lead, stage, reason = "", now = new Date().toISOString()) {
  const from = lead.stage;
  const next = {
    ...lead,
    stage,
    updated_at: now,
    stage_history: [...(lead.stage_history || []), { from, to: stage, at: now, reason: reason || undefined }],
  };
  next.rejection_reason = stage === "rejected" && reason ? reason : undefined;
  return next;
}

// Ported from LocalFileProvider.addNote().
export function applyNote(lead, text, author = "operator", now = new Date().toISOString()) {
  const note = { id: newId("note"), text, author, created_at: now };
  return {
    ...lead,
    notes: [...(lead.notes || []), note],
    updated_at: now,
  };
}

// Ported in spirit from summarizeConfig() in the retired
// app/server/store.ts; `payload` is the parsed Settings row's JSON.
export function buildConfigSummary(payload = {}) {
  return {
    config_path: "busabase:base/kelly-lead-funnel-settings-v1",
    is_example: false,
    base_currency: payload.base_currency || "USD",
    fund_profile: payload.fund_profile || {},
    scoring_criteria: { ...DEFAULT_SCORING_CRITERIA, ...(payload.scoring_criteria || {}) },
  };
}
