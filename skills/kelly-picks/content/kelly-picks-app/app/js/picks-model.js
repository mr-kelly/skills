// Pure, storage-agnostic domain logic for kelly-picks — no fs, no network,
// safe in both the browser and the trusted skill-root scripts.
//
// DECISION_KINDS/CANDIDATE_ACTIONS/PROPOSAL_ACTIONS/TREND_ACTIONS,
// stageForCandidateAction/statusForProposalAction, and computeMetrics are
// ported verbatim (same variable names, same order of operations, only TS
// types stripped) from the retired lib/picks-core.ts. round2/round1 and the
// per-candidate margin math in computeMarginCard are ported verbatim from
// the retired scripts/compute_margins.ts's loop body, refactored into a pure
// function so the trusted script and the browser's live-editable margin-card
// panel share one formula instead of two copies that could drift.
//
// normalize*/buildSnapshot/buildConfigSummary are new: they turn Busabase
// candidates/trend_items/proposals/sources/sync_log/settings rows (already
// snake_cased by the provider) into the PicksSnapshot/ConfigSummary shapes
// documented in references/picks-schema.md.

// ── Decision vocabulary (the product-research radar verbs) ────────────────
export const DECISION_KINDS = ["candidate", "proposal", "trend"];
export const CANDIDATE_ACTIONS = ["develop", "watch", "drop"];
export const PROPOSAL_ACTIONS = ["approve", "request_changes", "revise", "block"];
export const TREND_ACTIONS = ["promote"];
export const SOURCE_KINDS = ["amazon_bsr", "tiktok", "temu", "aliexpress", "trends", "competitor"];
export const STAGES = ["new", "reviewing", "develop", "watch", "dropped"];

export function stageForCandidateAction(action = "") {
  if (action === "develop") return "develop";
  if (action === "watch") return "watch";
  if (action === "drop") return "dropped";
  return "reviewing";
}

export function statusForProposalAction(action = "") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return "needs_review";
}

// ── Margin math (ported verbatim from scripts/compute_margins.ts) ─────────
export function round2(value = 0) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function round1(value = 0) {
  return Math.round(Number(value || 0) * 10) / 10;
}

/**
 * Ported verbatim from the retired scripts/compute_margins.ts's
 * per-candidate loop body — same variable names, same order of operations.
 * `freightRules` is a Map<category, per_unit>; `platform` is the resolved
 * config platform row (or null/undefined).
 * @param {{
 *   card?: Record<string, any>,
 *   category?: string,
 *   estPrice?: number,
 *   platform?: { referral_fee_pct?: number, fulfillment_flat?: number } | null,
 *   freightRules?: Map<string, number>,
 *   freightDefault?: number,
 *   adDefaultPct?: number,
 *   marginFloor?: number,
 * }} [args]
 */
export function computeMarginCard({
  card = {},
  category = "",
  estPrice = 0,
  platform = null,
  freightRules = new Map(),
  freightDefault = 0,
  adDefaultPct = 0,
  marginFloor = 0,
} = {}) {
  const price = Number(card.price ?? estPrice ?? 0);
  const cogs = Number(card.cogs ?? 0);
  const referralPct = Number(platform?.referral_fee_pct ?? card.platform_fee_pct ?? 0);
  const fulfillmentFlat = Number(platform?.fulfillment_flat ?? 0);
  const freight =
    card.freight_quoted && Number.isFinite(Number(card.freight))
      ? Number(card.freight)
      : freightRules.has(category || "")
        ? (freightRules.get(category || "") ?? freightDefault)
        : Number(card.freight) || freightDefault;
  const adCost =
    Number.isFinite(Number(card.ad_cost)) && Number(card.ad_cost) > 0
      ? Number(card.ad_cost)
      : round2(price * (adDefaultPct / 100));

  const feeAmount = round2(price * (referralPct / 100) + fulfillmentFlat);
  const effectiveFeePct = price > 0 ? round1((feeAmount / price) * 100) : 0;
  const marginBeforeAds = round2(price - cogs - freight - feeAmount);
  const margin = round2(marginBeforeAds - adCost);
  const marginPct = price > 0 ? round1((margin / price) * 100) : 0;
  const acosPct = price > 0 ? round1((marginBeforeAds / price) * 100) : 0;
  const belowFloor = marginPct < marginFloor;

  return {
    ...card,
    price,
    cogs,
    freight: round2(freight),
    platform_fee_pct: effectiveFeePct,
    platform_fee: feeAmount,
    ad_cost: round2(adCost),
    margin,
    margin_pct: marginPct,
    breakeven_acos_pct: acosPct,
    below_floor: belowFloor,
  };
}

// ── JSON helpers ────────────────────────────────────────────────────────
function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ── Normalization: Busabase rows -> snapshot item shapes ──────────────────
export function normalizeCandidate({
  candidate_id = "",
  name = "",
  category = "",
  source = "",
  source_ref = "",
  stage = "new",
  platform_id = "",
  competition_grade = "C",
  momentum_pct = 0,
  est_price = 0,
  currency = "USD",
  margin_card = "",
  competition = "",
  evidence = "",
  why_it_matters = "",
  first_seen = "",
  last_updated = "",
  verdict_action = "",
  verdict_comment = "",
  verdict_decided_at = "",
} = {}) {
  return {
    candidate_id,
    name: name || "(untitled candidate)",
    category,
    source,
    source_ref,
    stage,
    platform_id,
    competition_grade,
    momentum_pct: Number(momentum_pct) || 0,
    est_price: Number(est_price) || 0,
    currency: currency || "USD",
    margin_card: parseJsonValue(margin_card, {}) || {},
    competition: parseJsonValue(competition, {}) || {},
    evidence: parseJsonValue(evidence, []) || [],
    why_it_matters,
    first_seen,
    last_updated,
    verdict: verdict_action
      ? { action: verdict_action, comment: verdict_comment, decided_at: verdict_decided_at }
      : null,
  };
}

export function normalizeTrendItem({
  trend_id = "",
  source = "",
  title = "",
  summary = "",
  url = "",
  metric_label = "",
  metric_value = 0,
  delta_pct = 0,
  momentum = "",
  observed_at = "",
  candidate_id = "",
  external_id = "",
  content_hash = "",
  promotion_action = "",
  promotion_comment = "",
  promotion_decided_at = "",
} = {}) {
  return {
    trend_id,
    source,
    title: title || "(untitled trend)",
    summary,
    url,
    metric_label,
    metric_value: Number(metric_value) || 0,
    delta_pct: Number(delta_pct) || 0,
    momentum: parseJsonValue(momentum, []) || [],
    observed_at,
    candidate_id,
    external_id,
    content_hash,
    promotion: promotion_action
      ? { action: promotion_action, comment: promotion_comment, decided_at: promotion_decided_at }
      : null,
  };
}

export function normalizeProposal({
  proposal_id = "",
  candidate_id = "",
  title = "",
  verdict = "watch",
  status = "needs_review",
  reason = "",
  brief = "",
  proposed_at = "",
  review_comment = "",
  review_decided_at = "",
} = {}) {
  return {
    proposal_id,
    candidate_id,
    title: title || "(untitled proposal)",
    verdict,
    status,
    reason,
    brief,
    proposed_at,
    review: review_decided_at ? { comment: review_comment, decided_at: review_decided_at } : null,
  };
}

export function normalizeSource({
  source_id = "",
  kind = "",
  name = "",
  method = "manual",
  last_sweep_at = "",
  items_7d = 0,
  status = "ok",
} = {}) {
  return { source_id, kind, name: name || source_id, method, last_sweep_at, items_7d: Number(items_7d) || 0, status };
}

export function normalizeSyncLogEntry({
  log_id = "",
  at = "",
  actor = "kelly-picks-agent",
  action = "",
  detail = "",
} = {}) {
  return { log_id, at, actor, action, detail };
}

// ── Metrics (ported verbatim from lib/picks-core.ts's computeMetrics) ─────
export function computeMetrics(snapshot = {}) {
  const candidates = snapshot.candidates || [];
  const proposals = snapshot.proposals || [];
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const approved = candidates.filter((item) => item.stage === "develop");
  const marginOf = (item) => Number(item.margin_card?.margin_pct || 0);
  return {
    source_count: (snapshot.sources || []).length,
    trend_item_count: (snapshot.trend_items || []).length,
    candidate_count: candidates.length,
    candidates_new_7d: candidates.filter((item) => Date.parse(item.first_seen || "") >= weekAgo).length,
    candidates_to_review: candidates.filter((item) => ["new", "reviewing"].includes(item.stage)).length,
    in_development: approved.length,
    watching: candidates.filter((item) => item.stage === "watch").length,
    dropped: candidates.filter((item) => item.stage === "dropped").length,
    proposals_needs_review: proposals.filter((item) => item.status === "needs_review").length,
    avg_margin_approved_pct: approved.length
      ? Math.round((approved.reduce((sum, item) => sum + marginOf(item), 0) / approved.length) * 10) / 10
      : 0,
    below_margin_floor: candidates.filter((item) => item.margin_card?.below_floor).length,
  };
}

// ── Snapshot / config summary assembly (new: browser-side rollup of the
// Busabase rows the retired local-file snapshot.json used to hold) ────────
/**
 * @param {{
 *   candidates?: Array<Record<string, any>>,
 *   trend_items?: Array<Record<string, any>>,
 *   proposals?: Array<Record<string, any>>,
 *   sources?: Array<Record<string, any>>,
 *   sync_log?: Array<Record<string, any>>,
 *   base_currency?: string,
 *   now?: number,
 * }} [args]
 */
export function buildSnapshot({
  candidates = [],
  trend_items = [],
  proposals = [],
  sources = [],
  sync_log = [],
  base_currency = "USD",
  now = Date.now(),
} = {}) {
  const normalizedCandidates = candidates.map(normalizeCandidate);
  const normalizedTrendItems = trend_items.map(normalizeTrendItem);
  const normalizedProposals = proposals.map(normalizeProposal);
  const normalizedSources = sources.map(normalizeSource);
  const normalizedSyncLog = sync_log
    .map(normalizeSyncLogEntry)
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, 50);

  const snapshot = {
    schema_version: "1",
    generated_at: new Date(now).toISOString(),
    source: "kelly-picks",
    base_currency: base_currency || "USD",
    range: {
      start: new Date(now - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      end: new Date(now).toISOString().slice(0, 10),
    },
    metrics: {},
    sources: normalizedSources,
    trend_items: normalizedTrendItems,
    candidates: normalizedCandidates,
    proposals: normalizedProposals,
    sync_log: normalizedSyncLog,
  };
  snapshot.metrics = computeMetrics(snapshot);
  return snapshot;
}

// Sanitized config summary for #/settings — thresholds/fee tables plus the
// source roster derived from the same live Busabase rows the overview uses
// (no separate config store in the Busabase-only shape).
/**
 * @param {{ settings?: Record<string, any>, sources?: Array<Record<string, any>> }} [args]
 */
export function buildConfigSummary({ settings = {}, sources = [] } = {}) {
  const profile = parseJsonValue(settings.seller_profile, {}) || {};
  const platforms = parseJsonValue(settings.platforms, []) || [];
  const freight = parseJsonValue(settings.freight, {}) || {};
  return {
    config_path: "busabase",
    is_example: false,
    seller_profile: {
      store_name: profile.store_name || "",
      categories: Array.isArray(profile.categories) ? profile.categories : [],
      target_platforms: Array.isArray(profile.target_platforms) ? profile.target_platforms : [],
      margin_floor_pct: Number(profile.margin_floor_pct) || 0,
      max_cogs: Number(profile.max_cogs) || 0,
    },
    platforms: (Array.isArray(platforms) ? platforms : []).map((platform) => ({
      platform_id: platform.platform_id || "",
      name: platform.name || platform.platform_id || "",
      currency: platform.currency || "USD",
      referral_fee_pct: Number(platform.referral_fee_pct) || 0,
      fulfillment_flat: Number(platform.fulfillment_flat) || 0,
    })),
    freight: {
      default_per_unit: Number(freight.default_per_unit) || 0,
      rules: (Array.isArray(freight.rules) ? freight.rules : []).map((rule) => ({
        category: rule.category || "*",
        per_unit: Number(rule.per_unit) || 0,
      })),
    },
    ad_cost_default_pct: Number(settings.ad_cost_default_pct) || 0,
    sources: sources.map((source) => ({
      source_id: source.source_id || "",
      kind: source.kind || "",
      name: source.name || source.source_id || "",
      method: source.method || "manual",
    })),
  };
}

/** Resolve the platforms[]/freight config into the Map shape computeMarginCard expects. */
export function platformsMap(platforms = []) {
  return new Map((Array.isArray(platforms) ? platforms : []).map((platform) => [platform.platform_id || "", platform]));
}

export function freightRulesMap(freight = {}) {
  return new Map(
    (freight && Array.isArray(freight.rules) ? freight.rules : []).map((rule) => [
      rule.category || "*",
      Number(rule.per_unit) || 0,
    ]),
  );
}
