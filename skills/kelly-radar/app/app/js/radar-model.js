// Pure, storage-agnostic domain logic for kelly-radar — no fs, no network,
// safe in both the browser and the trusted skill-root scripts.
//
// DECISION_KINDS/SIGNAL_ACTIONS/BRIEF_ACTIONS/OPPORTUNITY_ACTIONS/statusForAction
// are ported verbatim (same variable names, same order of operations, only TS
// types stripped) from the retired lib/data-provider/local-file-provider.ts's
// DECISION_ACTIONS/statusForAction(). The brief→question status join in
// buildSnapshot is ported verbatim from local-file-provider.ts's
// applyDecisions() questions.map() block, just computed at read time from the
// live Busabase rows instead of overlaying a persisted decisions.json.
// signals_7d-per-target is ported verbatim from the retired
// scripts/ingest_signals.ts's weekAgo loop, likewise computed at read time.
//
// normalize*/buildSnapshot/buildConfigSummary are new: they turn Busabase
// watchlist/signals/questions/briefs/reports/movers/opportunities/sync_log/
// settings rows (already snake_cased by the provider) into the
// RadarSnapshot/ConfigSummary shapes documented in references/radar-schema.md.

export const DECISION_KINDS = ["signal", "brief", "opportunity", "report"];
export const SIGNAL_ACTIONS = ["approve", "watch", "ignore", "block"];
export const BRIEF_ACTIONS = ["approve", "request_changes", "block"];
export const OPPORTUNITY_ACTIONS = ["approve", "ignore"];
export const REPORT_ACTIONS = ["approve"];
export const SOURCE_KINDS = ["pricing", "changelog", "landing", "launch", "reviews", "news", "hiring", "community"];
export const SEVERITIES = ["high", "medium", "low"];
export const MOVER_SOURCES = ["search", "community", "category"];
export const TARGET_TYPES = ["competitor", "category", "keyword", "community"];
export const TARGET_STATUSES = ["ok", "warning", "stale", "paused"];

const DAY_MS = 24 * 60 * 60 * 1000;

// Ported verbatim from the retired lib/data-provider/local-file-provider.ts's
// statusForAction(): maps a triage/review verb to the workflow status stored
// on the item.
export function statusForAction(action = "") {
  if (action === "approve") return "approved";
  if (action === "watch") return "needs_review";
  if (action === "ignore") return "done";
  if (action === "block") return "blocked";
  if (action === "request_changes") return "changes_requested";
  return "needs_review";
}

function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// ── Normalization: Busabase rows -> snapshot item shapes ──────────────────
export function normalizeWatchTarget({
  target_id = "",
  name = "",
  type = "competitor",
  status = "ok",
  notes = "",
  last_check_at = "",
  sources = "",
} = {}) {
  return {
    target_id,
    name: name || target_id,
    type,
    status,
    notes,
    last_check_at,
    signals_7d: 0,
    sources: parseJsonValue(sources, []) || [],
  };
}

export function normalizeSignal({
  signal_id = "",
  target_id = "",
  source_id = "",
  source_kind = "news",
  severity = "medium",
  detected_at = "",
  status = "needs_review",
  headline = "",
  summary = "",
  why_it_matters = "",
  content_hash = "",
  evidence = "",
  proposed_action = "watch",
  handoff = "",
  diff = "",
  decision_verdict = "",
  decision_comment = "",
  decided_at = "",
} = {}) {
  const parsedHandoff = parseJsonValue(handoff, null);
  const parsedDiff = parseJsonValue(diff, null);
  return {
    signal_id,
    target_id,
    source_id,
    source_kind,
    severity,
    detected_at,
    status,
    headline: headline || "(untitled signal)",
    summary,
    why_it_matters,
    content_hash,
    evidence: parseJsonValue(evidence, []) || [],
    proposed_action,
    ...(parsedHandoff && Object.keys(parsedHandoff).length ? { handoff: parsedHandoff } : {}),
    ...(parsedDiff && Array.isArray(parsedDiff.lines) && parsedDiff.lines.length ? { diff: parsedDiff } : {}),
    ...(decision_verdict
      ? { triage: { kind: "signal", action: decision_verdict, status, comment: decision_comment, decided_at } }
      : {}),
  };
}

export function normalizeQuestion({
  question_id = "",
  question = "",
  status = "brief_needs_review",
  asked_at = "",
  depth = "standard",
  cost_note = "",
  brief_id = "",
  report_id = "",
  confidence = null,
  followups = "",
} = {}) {
  return {
    question_id,
    question: question || "(untitled question)",
    status,
    asked_at,
    depth,
    cost_note,
    brief_id,
    report_id,
    confidence: numberOrNull(confidence),
    followups: parseJsonValue(followups, []) || [],
  };
}

export function normalizeBrief({
  brief_id = "",
  question_id = "",
  status = "needs_review",
  drafted_at = "",
  depth = "standard",
  scope = "",
  planned_sources = "",
  expected_deliverable = "",
  notes = "",
  decision_verdict = "",
  decision_comment = "",
  decided_at = "",
} = {}) {
  return {
    brief_id,
    question_id,
    status,
    drafted_at,
    depth,
    scope,
    planned_sources: parseJsonValue(planned_sources, []) || [],
    expected_deliverable,
    notes,
    ...(decision_verdict
      ? { triage: { kind: "brief", action: decision_verdict, status, comment: decision_comment, decided_at } }
      : {}),
  };
}

export function normalizeReport({
  report_id = "",
  question_id = "",
  title = "",
  filed_at = "",
  summary = "",
  confidence = null,
  sections = "",
  sources = "",
  annotations = "",
  decided_at = "",
} = {}) {
  return {
    report_id,
    question_id,
    title: title || "(untitled report)",
    filed_at,
    summary,
    confidence: numberOrNull(confidence),
    sections: parseJsonValue(sections, []) || [],
    sources: parseJsonValue(sources, []) || [],
    annotations: parseJsonValue(annotations, []) || [],
    ...(decided_at ? { triage: { kind: "report", action: "approve", status: "", comment: "", decided_at } } : {}),
  };
}

export function normalizeMover({
  mover_id = "",
  keyword = "",
  source = "search",
  volume_proxy = 0,
  delta_pct = 0,
  momentum = "",
  first_seen = "",
  last_updated = "",
  opportunity_id = "",
} = {}) {
  return {
    mover_id,
    keyword,
    source,
    volume_proxy: Number(volume_proxy) || 0,
    delta_pct: Number(delta_pct) || 0,
    momentum: parseJsonValue(momentum, []) || [],
    first_seen,
    last_updated,
    opportunity_id,
  };
}

export function normalizeOpportunity({
  opportunity_id = "",
  title = "",
  mover_ids = "",
  status = "needs_review",
  created_at = "",
  rationale = "",
  proposed_next_step = "",
  decision_verdict = "",
  decision_comment = "",
  decided_at = "",
} = {}) {
  return {
    opportunity_id,
    title: title || "(untitled opportunity)",
    mover_ids: parseJsonValue(mover_ids, []) || [],
    status,
    created_at,
    rationale,
    proposed_next_step: parseJsonValue(proposed_next_step, {}) || {},
    ...(decision_verdict
      ? { triage: { kind: "opportunity", action: decision_verdict, status, comment: decision_comment, decided_at } }
      : {}),
  };
}

export function normalizeSyncLogEntry({
  log_id = "",
  at = "",
  actor = "kelly-radar-agent",
  action = "",
  detail = "",
} = {}) {
  return { log_id, at, actor, action, detail };
}

// ── Snapshot / config summary assembly (new: browser-side rollup of the
// Busabase rows the retired local-file radar_snapshot.json used to hold) ──
/**
 * @param {{
 *   watchlist?: Array<Record<string, any>>,
 *   signals?: Array<Record<string, any>>,
 *   questions?: Array<Record<string, any>>,
 *   briefs?: Array<Record<string, any>>,
 *   reports?: Array<Record<string, any>>,
 *   movers?: Array<Record<string, any>>,
 *   opportunities?: Array<Record<string, any>>,
 *   sync_log?: Array<Record<string, any>>,
 *   now?: number,
 * }} [args]
 */
export function buildSnapshot({
  watchlist = [],
  signals = [],
  questions = [],
  briefs = [],
  reports = [],
  movers = [],
  opportunities = [],
  sync_log = [],
  now = Date.now(),
} = {}) {
  const normalizedSignals = signals.map(normalizeSignal);
  const normalizedBriefs = briefs.map(normalizeBrief);
  const normalizedReports = reports.map(normalizeReport);
  const normalizedMovers = movers.map(normalizeMover);
  const normalizedOpportunities = opportunities.map(normalizeOpportunity);
  const normalizedSyncLog = sync_log
    .map(normalizeSyncLogEntry)
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, 50);

  // signals_7d-per-target, ported verbatim from the retired
  // scripts/ingest_signals.ts's weekAgo loop, computed at read time instead
  // of persisted onto the watchlist row.
  const weekAgo = now - 7 * DAY_MS;
  const normalizedWatchlist = watchlist.map(normalizeWatchTarget).map((target) => ({
    ...target,
    signals_7d: normalizedSignals.filter(
      (signal) => signal.target_id === target.target_id && Date.parse(signal.detected_at || "") >= weekAgo,
    ).length,
  }));

  // Brief → question status join, ported verbatim from the retired
  // local-file-provider.ts's applyDecisions() questions.map() block: a
  // question only ever moves off brief_needs_review once its linked brief
  // is approved (→ researching) or blocked (→ closed).
  const briefById = new Map(normalizedBriefs.map((brief) => [brief.brief_id, brief]));
  const normalizedQuestions = questions.map(normalizeQuestion).map((question) => {
    const brief = briefById.get(question.brief_id);
    if (!brief || question.status !== "brief_needs_review") return question;
    if (brief.status === "approved") return { ...question, status: "researching" };
    if (brief.status === "blocked") return { ...question, status: "closed" };
    return question;
  });

  const snapshot = {
    schema_version: "1",
    generated_at: new Date(now).toISOString(),
    source: "kelly-radar",
    range: {
      start: new Date(now - 7 * DAY_MS).toISOString().slice(0, 10),
      end: new Date(now).toISOString().slice(0, 10),
    },
    metrics: {},
    watchlist: normalizedWatchlist,
    signals: normalizedSignals,
    research: { questions: normalizedQuestions, briefs: normalizedBriefs, reports: normalizedReports },
    trends: { movers: normalizedMovers, opportunities: normalizedOpportunities },
    sync_log: normalizedSyncLog,
  };
  snapshot.metrics = computeMetrics(snapshot);
  return snapshot;
}

// Ported verbatim from the retired app/server/demo.ts's demoSnapshot() metrics block.
export function computeMetrics(snapshot = {}) {
  const watchlist = snapshot.watchlist || [];
  const signals = snapshot.signals || [];
  const research = snapshot.research || { questions: [], briefs: [], reports: [] };
  const trends = snapshot.trends || { movers: [], opportunities: [] };
  return {
    watch_target_count: watchlist.length,
    signal_count: signals.length,
    signals_needs_review: signals.filter((signal) => signal.status === "needs_review").length,
    questions_open: research.questions.filter((question) => question.status !== "closed").length,
    briefs_needs_review: research.briefs.filter((brief) => brief.status === "needs_review").length,
    reports_ready: research.questions.filter((question) => question.status === "report_ready").length,
    trend_mover_count: trends.movers.length,
    opportunities_open: trends.opportunities.filter((item) => item.status === "needs_review").length,
  };
}

// Sanitized config summary for #/settings — research defaults/trend sources/
// cadence/product profile plus the watchlist roster derived from the same
// live Busabase rows the overview uses (no separate config store in the
// Busabase-only shape).
/**
 * @param {{ watchlist?: Array<Record<string, any>>, settings?: Record<string, any> }} [args]
 */
export function buildConfigSummary({ watchlist = [], settings = {} } = {}) {
  return {
    config_path: "busabase",
    is_example: false,
    profile: { products: parseJsonValue(settings.products, []) || [] },
    watchlist: watchlist.map((target) => ({
      target_id: target.target_id || "",
      name: target.name || target.target_id || "",
      type: target.type || "",
      source_count: Array.isArray(target.sources) ? target.sources.length : 0,
      methods: [...new Set((target.sources || []).map((source) => source.method || "manual"))],
    })),
    research_defaults: {
      default_depth: settings.research_default_depth || "standard",
      source_policy: settings.research_source_policy || "public_pages_only",
      require_citations: settings.research_require_citations !== "false",
      max_sources: Number(settings.research_max_sources) || 8,
    },
    trend_sources: parseJsonValue(settings.trend_sources, []) || [],
    cadence: { monitor: settings.cadence_monitor || "daily", trends: settings.cadence_trends || "weekly" },
    env_readiness: [],
  };
}

// ── Execute-decisions planning (ported verbatim from the retired
// lib/data-provider/local-file-provider.ts's executeDecisions() loops) ────
export function operationForSignal(signal = {}) {
  const handoff = signal.handoff || { operation: "start_research", target: "", summary: "" };
  return {
    operation: handoff.operation || "start_research",
    target: handoff.target || "",
    summary: handoff.summary || signal.headline || "",
  };
}

export function operationForBrief(brief = {}, question = {}) {
  return {
    operation: "start_research",
    target: question.question_id || "",
    summary: `Run approved brief for: ${question.question || question.question_id || ""}`,
  };
}

export function operationForOpportunity(opportunity = {}) {
  const step = opportunity.proposed_next_step || {};
  return {
    operation: step.operation || "handoff_content_brief",
    target: step.target || "",
    summary: step.summary || opportunity.title || "",
  };
}
