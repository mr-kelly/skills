// Deterministic, fully auditable deal-scoring rubric, ported verbatim (same
// variable names, same order of operations, only TS types stripped) from the
// retired lib/scoring.ts. Plain arithmetic only — no LLM call, no API call,
// no randomness. Every sub-factor is hand recomputable from the candidate's
// raw fields plus the rubric weights below, so a human reviewer can check the
// app's numbers with a calculator.
//
// CANDIDATE_SEEDS is the fixed 8-candidate deterministic mock queue, ported
// verbatim from the retired lib/demo-candidates.ts — hand-authored believable
// monthly time series (oldest -> newest), not random. Shared by the trusted
// seed script (scripts/generate_batch.mjs), the live Busabase read path
// (js/providers/busabase-provider.js), and the offline ?demo= scenario
// (js/providers/demo-provider.js), so all three always agree on the rubric
// and the seed data.

export const DEFAULT_RUBRIC = {
  weights: {
    stability: 0.25,
    growth: 0.2,
    category_risk: 0.15,
    principal_ratio: 0.25,
    track_record: 0.15,
  },
  category_risk_tier: {
    Education: 90,
    Fitness: 70,
    Retail: 65,
    "F&B": 50,
  },
  decision_thresholds: {
    high_confidence_min: 78,
    needs_review_min: 50,
  },
  revenue_share_rate: {
    base_min_pct: 6,
    base_max_pct: 14,
  },
};

function round1(value) {
  return Math.round(value * 10) / 10;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values = []) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function stdDev(values = [], avg = 0) {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Revenue stability/volatility: 100 - (coefficient of variation * 100), clamped
 * to [0, 100]. CV = stdDev / mean. Lower volatility -> higher score.
 */
export function scoreStability(monthlyRevenue = []) {
  const avg = mean(monthlyRevenue);
  const sd = stdDev(monthlyRevenue, avg);
  const cv = avg > 0 ? sd / avg : 1;
  const score = clamp(100 - cv * 100, 0, 100);
  return {
    score: round1(score),
    detail: `avg=${round1(avg)}, stdDev=${round1(sd)}, CV=${round1(cv * 100)}% -> 100 - CV% = ${round1(score)}`,
  };
}

/**
 * Growth trend: compares the average of the most recent 3 months against the
 * average of the earliest 3 months. Percent change is mapped onto a 0-100
 * scale centered at 50 (flat), +/-2 points per 1% change, clamped.
 */
export function scoreGrowth(monthlyRevenue = []) {
  const n = monthlyRevenue.length;
  const window = Math.min(3, Math.floor(n / 2) || 1);
  const early = monthlyRevenue.slice(0, window);
  const recent = monthlyRevenue.slice(n - window);
  const earlyAvg = mean(early);
  const recentAvg = mean(recent);
  const pctChange = earlyAvg > 0 ? ((recentAvg - earlyAvg) / earlyAvg) * 100 : 0;
  const score = clamp(50 + pctChange * 2, 0, 100);
  return {
    score: round1(score),
    detail: `first ${window}-mo avg=${round1(earlyAvg)}, last ${window}-mo avg=${round1(recentAvg)}, change=${round1(pctChange)}% -> 50 + change%*2 = ${round1(score)}`,
  };
}

/**
 * Category risk tier: a fixed lookup table of default risk scores per
 * vertical, from the rubric config (editable per fund policy). Missing
 * categories fall back to 60 (moderate).
 */
export function scoreCategoryRisk(category = "", tierTable = DEFAULT_RUBRIC.category_risk_tier) {
  const score = tierTable[category] ?? 60;
  return {
    score: round1(score),
    detail: `category "${category}" risk tier lookup = ${round1(score)}`,
  };
}

/**
 * Requested-principal-to-revenue ratio: principal divided by trailing average
 * monthly revenue gives a "months of revenue requested" multiple. Lower
 * multiples score higher. 0-2x -> 100..70, 2-4x -> 70..40, 4-8x -> 40..0.
 */
export function scorePrincipalRatio(requestedPrincipal = 0, monthlyRevenue = []) {
  const avgMonthly = mean(monthlyRevenue);
  const ratio = avgMonthly > 0 ? requestedPrincipal / avgMonthly : 999;
  let score;
  if (ratio <= 2)
    score = 100 - (ratio / 2) * 30; // 100 at 0x, 70 at 2x
  else if (ratio <= 4)
    score = 70 - ((ratio - 2) / 2) * 30; // 70 at 2x, 40 at 4x
  else if (ratio <= 8)
    score = 40 - ((ratio - 4) / 4) * 40; // 40 at 4x, 0 at 8x
  else score = 0;
  score = clamp(score, 0, 100);
  return {
    score: round1(score),
    ratio: round1(ratio),
    detail: `principal=${requestedPrincipal} / avg monthly revenue=${round1(avgMonthly)} = ${round1(ratio)}x -> ${round1(score)}`,
  };
}

/**
 * Track record/scale: rewards a longer revenue history and larger absolute
 * average monthly revenue. 60% weight on months of history (capped at 12mo =
 * full marks), 40% weight on scale (avg monthly revenue vs. a $50k benchmark).
 */
export function scoreTrackRecord(monthlyRevenue = []) {
  const months = monthlyRevenue.length;
  const historyScore = clamp((months / 12) * 100, 0, 100);
  const avgMonthly = mean(monthlyRevenue);
  const scaleScore = clamp((avgMonthly / 50000) * 100, 0, 100);
  const score = historyScore * 0.6 + scaleScore * 0.4;
  return {
    score: round1(score),
    detail: `history=${months}mo -> ${round1(historyScore)} (60%), scale avg=${round1(avgMonthly)} vs $50k benchmark -> ${round1(scaleScore)} (40%) = ${round1(score)}`,
  };
}

/**
 * Suggested revenue-share rate range: starts from the rubric's base range and
 * narrows/shifts down as the composite score improves — higher-scoring
 * candidates are offered a lower, tighter rate band; weaker candidates get a
 * wider band biased toward the top of the range. Deterministic, no rounding
 * surprises: both bounds are simple linear functions of compositeScore.
 */
export function suggestedShareRate(compositeScore = 0, rubric = DEFAULT_RUBRIC) {
  const { base_min_pct, base_max_pct } = rubric.revenue_share_rate;
  const t = clamp(compositeScore, 0, 100) / 100; // 0..1, higher = stronger candidate
  const min_pct = base_min_pct + (1 - t) * 2; // 6 at score 100, 8 at score 0
  const max_pct = base_max_pct - t * 3; // 11 at score 100, 14 at score 0
  return { min_pct: round1(min_pct), max_pct: round1(Math.max(max_pct, min_pct + 1)) };
}

/**
 * Compute the full, auditable score breakdown for one candidate. Pure
 * function: same inputs always produce the same output, and every
 * intermediate number is exposed in `detail` for hand recomputation. Never
 * stored — recomputed fresh on every read (busabase-provider.js/demo-provider.js)
 * so the breakdown always matches the current rubric.
 */
export function computeScore(
  { category = "F&B", requested_principal = 0, monthly_revenue = [] } = {},
  rubric = DEFAULT_RUBRIC,
) {
  const stability = scoreStability(monthly_revenue);
  const growth = scoreGrowth(monthly_revenue);
  const categoryRisk = scoreCategoryRisk(category, rubric.category_risk_tier);
  const principalRatio = scorePrincipalRatio(requested_principal, monthly_revenue);
  const trackRecord = scoreTrackRecord(monthly_revenue);

  const factors = [
    {
      key: "stability",
      label: "Revenue stability",
      raw_score: stability.score,
      weight: rubric.weights.stability,
      contribution: round1(stability.score * rubric.weights.stability),
      detail: stability.detail,
    },
    {
      key: "growth",
      label: "Growth trend",
      raw_score: growth.score,
      weight: rubric.weights.growth,
      contribution: round1(growth.score * rubric.weights.growth),
      detail: growth.detail,
    },
    {
      key: "category_risk",
      label: "Category risk tier",
      raw_score: categoryRisk.score,
      weight: rubric.weights.category_risk,
      contribution: round1(categoryRisk.score * rubric.weights.category_risk),
      detail: categoryRisk.detail,
    },
    {
      key: "principal_ratio",
      label: "Principal-to-revenue ratio",
      raw_score: principalRatio.score,
      weight: rubric.weights.principal_ratio,
      contribution: round1(principalRatio.score * rubric.weights.principal_ratio),
      detail: principalRatio.detail,
    },
    {
      key: "track_record",
      label: "Track record & scale",
      raw_score: trackRecord.score,
      weight: rubric.weights.track_record,
      contribution: round1(trackRecord.score * rubric.weights.track_record),
      detail: trackRecord.detail,
    },
  ];

  const composite_score = round1(factors.reduce((sum, f) => sum + f.contribution, 0));

  return {
    composite_score,
    factors,
    suggested_share_rate: suggestedShareRate(composite_score, rubric),
  };
}

// ---- Fixed mock candidate queue, ported verbatim from the retired
// lib/demo-candidates.ts ----

export const CANDIDATE_SEEDS = [
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

// ---- Chinese localization for the demo scenario, ported verbatim from the
// retired app/server/demo.ts ----

export const CANDIDATE_NAMES_ZH = {
  "cand-001": "枫糖百里香厨房",
  "cand-002": "北区健身联盟",
  "cand-003": "海岸儿童学习中心",
  "cand-004": "余烬橡木烧烤",
  "cand-005": "线迹精品店",
  "cand-006": "像素印刷工坊",
  "cand-007": "河湾 CrossFit",
  "cand-008": "光途辅导中心",
};

export const CANDIDATE_CITIES_ZH = {
  "cand-001": "德克萨斯州 奥斯汀",
  "cand-002": "科罗拉多州 丹佛",
  "cand-003": "加利福尼亚州 圣地亚哥",
  "cand-004": "田纳西州 纳什维尔",
  "cand-005": "南卡罗来纳州 查尔斯顿",
  "cand-006": "俄勒冈州 波特兰",
  "cand-007": "爱达荷州 博伊西",
  "cand-008": "北卡罗来纳州 罗利",
};

// ---- Decision verdicts, ported verbatim from the retired
// lib/data-provider/local-file-provider.ts ----

export const VALID_ACTIONS = new Set(["approve_term_sheet", "send_back_for_data", "reject"]);

export function statusForAction(action = "") {
  if (action === "approve_term_sheet") return "approved";
  if (action === "send_back_for_data") return "changes_requested";
  return "blocked";
}

// Builds the raw candidate list straight off CANDIDATE_SEEDS, all
// "needs_review", no decisions applied — used by the trusted seed script
// (scripts/generate_batch.mjs). Ported from the retired
// scripts/generate_batch.ts's buildBatch().
export function buildRawCandidates(rubric = DEFAULT_RUBRIC) {
  return CANDIDATE_SEEDS.map((seed) => ({
    id: seed.id,
    business_name: seed.business_name,
    category: seed.category,
    city: seed.city,
    requested_principal: seed.requested_principal,
    monthly_revenue: seed.monthly_revenue,
    red_flags: seed.red_flags,
    status: "needs_review",
    score: computeScore(seed, rubric),
    decision: undefined,
  }));
}

function parseJsonArray(value = "[]") {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Normalize a Busabase `candidates` row (already snake_cased by the provider)
// -> the same candidate shape the UI renders, recomputing the score
// breakdown fresh on every read (never stored) exactly like
// kelly-family-fund/kelly-agent-eval.
export function computeCandidate(
  {
    candidate_id = "",
    business_name = "",
    category = "F&B",
    city = "",
    requested_principal = 0,
    monthly_revenue = "[]",
    red_flags = "[]",
    status = "needs_review",
    decision_action = "",
    decision_comment = "",
    decided_at = "",
  } = {},
  rubric = DEFAULT_RUBRIC,
) {
  const revenue = parseJsonArray(monthly_revenue).map(Number);
  const flags = parseJsonArray(red_flags);
  const principal = Number(requested_principal) || 0;
  const decision = decision_action
    ? { action: decision_action, comment: decision_comment || "", decided_at: decided_at || "" }
    : undefined;
  return {
    id: candidate_id,
    business_name,
    category,
    city,
    requested_principal: principal,
    monthly_revenue: revenue,
    red_flags: flags,
    status,
    score: computeScore({ category, requested_principal: principal, monthly_revenue: revenue }, rubric),
    decision,
  };
}

// Recompute metrics/distribution from items so the batch header is always
// internally consistent, even against a hand-edited record. Ported verbatim
// from the retired lib/data-provider/local-file-provider.ts's
// deriveBatchAggregates().
export function deriveBatchAggregates(items = [], rubric = DEFAULT_RUBRIC) {
  const metrics = { needs_review: 0, approved: 0, done: 0, blocked: 0 };
  let high = 0;
  let review = 0;
  let low = 0;
  let sum = 0;
  for (const item of items) {
    if (item.status === "needs_review" || item.status === "changes_requested") metrics.needs_review += 1;
    else if (item.status === "approved") metrics.approved += 1;
    else if (item.status === "done") metrics.done += 1;
    else if (item.status === "blocked") metrics.blocked += 1;
    const score = item.score?.composite_score ?? 0;
    sum += score;
    if (score >= rubric.decision_thresholds.high_confidence_min) high += 1;
    else if (score >= rubric.decision_thresholds.needs_review_min) review += 1;
    else low += 1;
  }
  return {
    metrics,
    distribution: {
      high_confidence: high,
      needs_review: review,
      low_confidence: low,
      average_score: items.length ? round1(sum / items.length) : 0,
    },
  };
}

// Assembles the full batch object the UI renders, mirroring the retired
// Batch shape (batch_id/generated_at/source/mode/metrics/distribution/items).
export function buildBatch({
  items = [],
  batchId = "",
  generatedAt = "",
  source = "kelly-deal-scorer",
  rubric = DEFAULT_RUBRIC,
} = {}) {
  const { metrics, distribution } = deriveBatchAggregates(items, rubric);
  return {
    batch_id: batchId,
    generated_at: generatedAt,
    source,
    mode: "app-in-skill",
    metrics,
    distribution,
    items,
  };
}

// ---- Settings row helpers, ported from rubricFromConfig()/summarizeConfig()
// in the retired lib/data-provider/local-file-provider.ts. The `settings`
// Base holds one row keyed by record-id/kind = "config" (base currency +
// optional rubric override). A missing row means "not set yet" -> defaults. ----

function parseJsonPayload(value = "") {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

export function rubricFromConfig(config = {}) {
  const rubric = config.rubric;
  if (!rubric) return DEFAULT_RUBRIC;
  return {
    weights: { ...DEFAULT_RUBRIC.weights, ...rubric.weights },
    category_risk_tier: { ...DEFAULT_RUBRIC.category_risk_tier, ...rubric.category_risk_tier },
    decision_thresholds: { ...DEFAULT_RUBRIC.decision_thresholds, ...rubric.decision_thresholds },
    revenue_share_rate: { ...DEFAULT_RUBRIC.revenue_share_rate, ...rubric.revenue_share_rate },
  };
}

export function buildConfigSummary(settingsRows = []) {
  const configRow = findSettingsRow(settingsRows, "config");
  const config = parseJsonPayload(configRow?.payload);
  const rubric = rubricFromConfig(config);
  return {
    config_path: "busabase",
    is_example: false,
    base_currency: config.base_currency || "USD",
    rubric: {
      weights: rubric.weights,
      decision_thresholds: rubric.decision_thresholds,
    },
  };
}

// Full rubric (weights + category_risk_tier + decision_thresholds +
// revenue_share_rate) merged with any override in the settings "config" row
// — used to recompute every candidate's score breakdown on read. Kept
// separate from buildConfigSummary()'s trimmed ConfigSummary shape (which
// only ever exposed weights/decision_thresholds to the UI).
export function rubricFromSettings(settingsRows = []) {
  const configRow = findSettingsRow(settingsRows, "config");
  return rubricFromConfig(parseJsonPayload(configRow?.payload));
}

// The `settings` Base's "run" row holds the current queue's batch_id/
// generated_at, written by scripts/generate_batch.mjs. A missing row means
// no batch has been seeded yet.
export function runMetaFromSettings(settingsRows = []) {
  const runRow = findSettingsRow(settingsRows, "run");
  return parseJsonPayload(runRow?.payload);
}
