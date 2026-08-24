// Pure domain logic for kelly-feedback. recomputeDerived is ported verbatim
// (same variable names, same order of operations, only TS types stripped)
// from the retired lib/common.ts's recomputeDerived(): request
// frequency/weighted_score and snapshot metrics are always derived from the
// raw feedback stream, never trusted from a stored value. statusForProposalAction
// and triageForFeedbackAction are ported verbatim from the retired
// app/app.js's effectiveProposal()/effectiveFeedback() decision-overlay maps
// (statusByAction / triageByAction). PROPOSAL_ACTIONS/FEEDBACK_ACTIONS are
// ported verbatim from the retired lib/data-provider/local-file-provider.ts.
// normalize*/buildSnapshot/buildConfigSummary are new: they turn Busabase
// products/sources/feedback/requests/roadmap/proposals/sync_log rows (already
// snake_cased by the provider) into the FeedbackSnapshot/ConfigSummary shapes
// documented in references/feedback-schema.md.

export const CHANNELS = ["email", "discord", "slack", "x", "appstore", "survey", "interview"];
export const SENTIMENTS = ["positive", "neutral", "negative"];
export const TRIAGES = ["new", "clustered", "ignored", "insight"];
export const REQUEST_STATUSES = ["candidate", "roadmap", "declined", "needs_info"];
export const PROPOSAL_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
export const PROPOSAL_TYPES = ["promote_request", "decline_request", "merge_requests", "publish_changelog"];
export const TRENDS = ["up", "flat", "down"];
export const LANES = ["now", "next", "later"];

// Ported verbatim from the retired lib/data-provider/local-file-provider.ts.
export const PROPOSAL_ACTIONS = ["approve", "request_changes", "block", "revise"];
export const FEEDBACK_ACTIONS = ["assign", "ignore", "insight"];

// Ported verbatim from the retired app/app.js's effectiveProposal()'s
// statusByAction map: "revise" (an edited draft with no verdict) never
// changes status.
export function statusForProposalAction(action, currentStatus = "needs_review") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return currentStatus;
}

// Ported verbatim from the retired app/app.js's effectiveFeedback()'s
// triageByAction map.
export function triageForFeedbackAction(action, currentTriage = "new") {
  if (action === "assign") return "clustered";
  if (action === "ignore") return "ignored";
  if (action === "insight") return "insight";
  return currentTriage;
}

function parseJsonList(value = "") {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---- Normalization: Busabase rows -> snapshot item shapes ----

export function normalizeProduct({ product_id = "", display_name = "", tagline = "" } = {}) {
  return { product_id, display_name: display_name || product_id, tagline };
}

export function normalizeSource({
  source_id = "",
  channel = "",
  name = "",
  collection = "",
  secret_envs = "",
  last_ingest_at = "",
  item_count = 0,
  status = "ok",
} = {}) {
  return {
    source_id,
    channel,
    name: name || source_id,
    collection,
    secret_envs: parseJsonList(secret_envs),
    last_ingest_at,
    item_count: Number(item_count) || 0,
    status: status || "ok",
  };
}

export function normalizeFeedbackItem({
  feedback_id = "",
  source_id = "",
  channel = "",
  product = "",
  user_handle = "",
  user_plan = "",
  user_tenure_months = 0,
  user_weight = 1,
  text = "",
  sentiment = "neutral",
  received_at = "",
  permalink = "",
  request_id = "",
  triage = "new",
  agent_note = "",
} = {}) {
  return {
    feedback_id,
    source_id,
    channel,
    product,
    user: {
      handle: user_handle,
      plan: user_plan,
      tenure_months: Number(user_tenure_months) || 0,
      weight: Number(user_weight) || 1,
    },
    text,
    sentiment: SENTIMENTS.includes(sentiment) ? sentiment : "neutral",
    received_at,
    permalink,
    request_id,
    triage: TRIAGES.includes(triage) ? triage : "new",
    agent_note,
  };
}

export function normalizeRequestItem({
  request_id = "",
  title = "",
  product = "",
  status = "candidate",
  trend = "flat",
  effort_estimate = "",
  problem_statement = "",
  spec_summary = "",
  representative_feedback_ids = "",
  decision_history = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    request_id,
    title,
    product,
    status: REQUEST_STATUSES.includes(status) ? status : "candidate",
    trend: TRENDS.includes(trend) ? trend : "flat",
    frequency: 0,
    weighted_score: 0,
    problem_statement,
    spec_summary,
    effort_estimate,
    representative_feedback_ids: parseJsonList(representative_feedback_ids),
    decision_history: parseJsonList(decision_history),
    created_at,
    updated_at: updated_at || created_at,
  };
}

export function normalizeRoadmapItem({ item_id = "", lane = "now", title = "", request_id = "", note = "" } = {}) {
  return { item_id, lane: LANES.includes(lane) ? lane : "now", title, request_id, note };
}

export function normalizeProposal({
  proposal_id = "",
  type = "promote_request",
  title = "",
  status = "needs_review",
  request_id = "",
  request_ids = "",
  target_lane = "",
  reason = "",
  evidence = "",
  draft_kind = "",
  draft = "",
  review_note = "",
  created_at = "",
  decided_at = "",
} = {}) {
  return {
    proposal_id,
    ref: 0,
    type: PROPOSAL_TYPES.includes(type) ? type : "promote_request",
    title,
    status: PROPOSAL_STATUSES.includes(status) ? status : "needs_review",
    request_id,
    request_ids: parseJsonList(request_ids),
    target_lane,
    reason,
    evidence,
    draft_kind,
    draft,
    review_note,
    created_at,
    decided_at,
  };
}

export function normalizeSyncLogEntry({ sync_id = "", at = "", actor = "", action = "", detail = "", count = 0 } = {}) {
  return { sync_id, at, actor, action, detail, count: Number(count) || 0 };
}

// Ported from the retired local-file-provider.ts's proposal.ref assignment,
// adapted for Busabase reads that have no guaranteed insertion order: refs
// are assigned by a stable created_at ascending sort so "Proposal #N" stays
// put across reloads regardless of the page order records.list returns.
function withProposalRefs(proposals) {
  const ordered = proposals
    .slice()
    .sort((a, b) => String(a.created_at || a.proposal_id).localeCompare(String(b.created_at || b.proposal_id)));
  const refById = new Map(ordered.map((proposal, index) => [proposal.proposal_id, index + 1]));
  return proposals.map((proposal) => ({ ...proposal, ref: refById.get(proposal.proposal_id) || 0 }));
}

function buildRoadmap(roadmapRows) {
  const roadmap = { now: [], next: [], later: [] };
  for (const row of roadmapRows) {
    const { lane, ...item } = normalizeRoadmapItem(row);
    roadmap[lane].push(item);
  }
  return roadmap;
}

// Ported verbatim from the retired lib/common.ts's recomputeDerived(): derive
// request frequency/weighted score and snapshot metrics from the raw feedback
// stream so the numbers always agree after any merge.
export function recomputeDerived(snapshot) {
  const byRequest = new Map((snapshot.requests || []).map((item) => [item.request_id, item]));
  for (const request of snapshot.requests || []) {
    request.frequency = 0;
    request.weighted_score = 0;
  }
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const ref = new Date(snapshot.generated_at || Date.now()).getTime();
  const week_inflow = {};
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  for (const item of snapshot.feedback || []) {
    const request = byRequest.get(item.request_id);
    if (request) {
      request.frequency += 1;
      request.weighted_score += Number(item.user?.weight || 1);
    }
    sentiment[item.sentiment] = (sentiment[item.sentiment] || 0) + 1;
    if (ref - new Date(item.received_at).getTime() <= weekMs) {
      week_inflow[item.channel] = (week_inflow[item.channel] || 0) + 1;
    }
  }
  snapshot.metrics = {
    feedback_count: (snapshot.feedback || []).length,
    new_feedback: (snapshot.feedback || []).filter((item) => item.triage === "new").length,
    request_count: (snapshot.requests || []).length,
    proposals_needs_review: (snapshot.proposals || []).filter((item) => item.status === "needs_review").length,
    requests_needs_info: (snapshot.requests || []).filter((item) => item.status === "needs_info").length,
    week_inflow,
    sentiment,
  };
  return snapshot;
}

// Assemble the full FeedbackSnapshot from raw Busabase rows (already
// snake_cased by busabase-provider.js's normalizeFields()).
/**
 * @param {{
 *   products?: Array<Record<string, any>>,
 *   sources?: Array<Record<string, any>>,
 *   feedback?: Array<Record<string, any>>,
 *   requests?: Array<Record<string, any>>,
 *   roadmap?: Array<Record<string, any>>,
 *   proposals?: Array<Record<string, any>>,
 *   sync_log?: Array<Record<string, any>>,
 * }} [args]
 */
export function buildSnapshot({
  products = [],
  sources = [],
  feedback = [],
  requests = [],
  roadmap = [],
  proposals = [],
  sync_log = [],
} = {}) {
  const snapshot = {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-feedback",
    products: products.map(normalizeProduct),
    sources: sources.map(normalizeSource),
    feedback: feedback.map(normalizeFeedbackItem),
    requests: requests.map(normalizeRequestItem),
    roadmap: buildRoadmap(roadmap),
    proposals: withProposalRefs(proposals.map(normalizeProposal)),
    metrics: {},
    sync_log: [...sync_log.map(normalizeSyncLogEntry)].sort((a, b) =>
      String(a.at || "").localeCompare(String(b.at || "")),
    ),
  };
  recomputeDerived(snapshot);
  return snapshot;
}

// Sanitized config summary for #/settings — never exposes secret values, only
// the env-var *name* a source's token lives in. secrets_ready is a status
// proxy (the browser has no access to process.env): a source that declares no
// secret env is always ready; others read the source's own `status` field,
// set by whichever trusted process (scripts/ingest_feedback.mjs) created it.
/**
 * @param {{ settings?: Record<string, any>, products?: Array<Record<string, any>>, sources?: Array<Record<string, any>> }} [args]
 */
export function buildConfigSummary({ settings = {}, products = [], sources = [] } = {}) {
  const normalizedSources = sources.map(normalizeSource);
  return {
    config_path: "busabase",
    is_example: false,
    products: products.map(normalizeProduct),
    sources: normalizedSources.map((source) => ({
      source_id: source.source_id,
      channel: source.channel,
      name: source.name,
      collection: source.collection,
      secret_envs: source.secret_envs,
      secrets_ready: source.secret_envs.length === 0 || source.status === "ok",
    })),
    scoring: {
      plan_weights: parseJsonObject(settings.plan_weights) || {},
      default_weight:
        settings.default_weight !== undefined && settings.default_weight !== "" ? Number(settings.default_weight) : 1,
      recency_half_life_days:
        settings.recency_half_life_days !== undefined && settings.recency_half_life_days !== ""
          ? Number(settings.recency_half_life_days)
          : 30,
    },
    roadmap_lanes: parseJsonList(settings.roadmap_lanes).length ? parseJsonList(settings.roadmap_lanes) : LANES,
  };
}
