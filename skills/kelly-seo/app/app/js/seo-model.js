// Pure domain logic for kelly-seo, ported from the retired lib/geo-qa.ts,
// app/server/demo.ts, lib/data-provider/local-file-provider.ts, and
// scripts/execute_decisions.ts — same variable names, same order of
// operations, only TS types stripped and every destructured function
// parameter given a default value (avoids a known checkJs false-positive
// where TypeScript infers a destructured param without defaults as missing
// the property entirely).
//
// Shared by the browser (demo-provider.js, providers/busabase-provider.js,
// seo-ops-views.js, geo-views.js) AND the trusted Node scripts
// (scripts/sync_gsc.mjs, scripts/execute_decisions.mjs) — pure functions
// only, no `window`/`document`/`fs` usage, so this module is safe to import
// from either runtime.

// ── Numeric helpers, ported verbatim from app/server/demo.ts ──────────────────

export function ratio(a, b) {
  return b ? Number((a / b).toFixed(4)) : 0;
}

export function round1(value) {
  return Number(Number(value).toFixed(1));
}

export function slugify(value = "") {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

// Expected CTR curve by average position, ported verbatim from demo.ts.
export function expectedCtr(position) {
  if (position <= 1.5) return 0.28;
  if (position <= 2.5) return 0.15;
  if (position <= 3.5) return 0.1;
  if (position <= 4.5) return 0.07;
  if (position <= 5.5) return 0.05;
  if (position <= 10.5) return 0.03;
  if (position <= 20) return 0.015;
  return 0.008;
}

// Opportunity badges for a query row, ported verbatim from demo.ts. Shared
// by the demo dataset builder AND scripts/sync_gsc.mjs (real GSC rows).
export function badgesFor(clicks, impressions, position) {
  const badges = [];
  if (position >= 8 && position <= 15) badges.push("striking_distance");
  const ctr = ratio(clicks, impressions);
  if (impressions >= 200 && ctr < expectedCtr(position) * 0.6) badges.push("low_ctr");
  return badges;
}

// Sums a list of {clicks, impressions, position} into one totals block,
// rounding position to 1 decimal. Ported verbatim from demo.ts's sumTotals
// (used to roll up site totals when building/syncing a snapshot).
export function sumTotals(list = []) {
  const clicks = list.reduce((sum, item) => sum + item.clicks, 0);
  const impressions = list.reduce((sum, item) => sum + item.impressions, 0);
  const weighted = list.reduce((sum, item) => sum + item.position * item.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: ratio(clicks, impressions),
    position: impressions ? round1(weighted / impressions) : 0,
  };
}

// Aggregates a list of {clicks, impressions, position} into one totals
// block, WITHOUT rounding position. Ported verbatim from app.js's
// aggregateTotals (used by the live view to scope totals to the selected
// site, where sub-decimal precision matters for the delta arrows).
export function aggregateTotals(list = []) {
  const clicks = list.reduce((sum, item) => sum + Number(item?.clicks || 0), 0);
  const impressions = list.reduce((sum, item) => sum + Number(item?.impressions || 0), 0);
  const weighted = list.reduce((sum, item) => sum + Number(item?.position || 0) * Number(item?.impressions || 0), 0);
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weighted / impressions : 0,
  };
}

// ── geo-qa (⛩): the pre-ship quality gate for a proposed GEO content change,
// ported verbatim from the retired lib/geo-qa.ts. ─────────────────────────────
//
//   any fail  -> BLOCK  (a hard problem: a stat with no cited source / grounding)
//   any warn  -> FIX    (soft problem: no quotable structure, no schema)
//   all pass  -> SHIP

// A bare number followed by a stat-ish unit, e.g. "42%", "3x", "1,200 users".
const STAT_PATTERN =
  /\b\d[\d,.]*\s?(%|percent|x\b|times|users|customers|companies|hours|days|minutes|seconds|billion|million|thousand|k\b|\+)/i;

function draftHasBareStat(draft) {
  return STAT_PATTERN.test(draft);
}

export function evaluateGeoGate({ draft = "", claims = [], has_schema = false, has_qa_block = false } = {}) {
  const draftText = String(draft || "");
  const claimList = Array.isArray(claims) ? claims : [];
  const checks = [];

  // 1. Factual grounding -> hard fail (BLOCK). Every numeric claim the change
  //    introduces must carry a source; a stat in the prose with no matching
  //    grounded claim is a fabrication risk.
  const ungroundedClaim = claimList.find(
    (claim) => String(claim.text || "").trim() && !String(claim.source || "").trim(),
  );
  const bareStatInProse = draftHasBareStat(draftText) && !claimList.some((claim) => String(claim.source || "").trim());
  const grounded = !ungroundedClaim && !bareStatInProse;
  checks.push({
    id: "factual-grounding",
    label: "Factual grounding",
    result: grounded ? "pass" : "fail",
    note: ungroundedClaim
      ? `Stat "${String(ungroundedClaim.text).slice(0, 60)}" has no cited source.`
      : bareStatInProse
        ? "The draft states a number/stat with no cited source — AI engines would quote it verbatim."
        : claimList.length
          ? "Every quantitative claim carries a source."
          : "No quantitative claims to ground.",
  });

  // 2. Quotable structure -> soft warn (FIX). AI engines lift clear Q&A blocks;
  //    a page with none is far less citable.
  checks.push({
    id: "quotable-structure",
    label: "Quotable structure",
    result: has_qa_block ? "pass" : "warn",
    note: has_qa_block
      ? "Includes a Q&A / FAQ block engines can lift."
      : "No Q&A / FAQ block — add self-contained question/answer pairs.",
  });

  // 3. Structured data -> soft warn (FIX). schema.org markup helps engines and
  //    knowledge panels resolve the entity behind the claims.
  checks.push({
    id: "structured-data",
    label: "Structured data",
    result: has_schema ? "pass" : "warn",
    note: has_schema
      ? "Adds schema.org structured data."
      : "No schema.org markup — add Organization/FAQ/Article JSON-LD.",
  });

  const fails = checks.filter((check) => check.result === "fail").length;
  const warns = checks.filter((check) => check.result === "warn").length;
  const score = Math.max(0, 100 - fails * 45 - warns * 15);
  const verdict = fails > 0 ? "BLOCK" : warns > 0 ? "FIX" : "SHIP";
  const summary =
    verdict === "BLOCK"
      ? "Blocked before ship — a claim is ungrounded and could be quoted by an AI engine."
      : verdict === "FIX"
        ? "Shippable after a quick pass to make it more citable."
        : "Clears the GEO gate. Safe to publish.";

  return { verdict, score, checks, summary };
}

// ── AI visibility + entity readiness scoring, ported verbatim from demo.ts /
// local-file-provider.ts's applyEntityOverrides. ──────────────────────────────

export const GEO_ENGINES = ["chatgpt", "perplexity", "gemini", "claude", "copilot"];

// Overall AI-visibility score: share of engine x prompt cells that mention
// the brand, ported verbatim from demo.ts's demoAiVisibility().
export function aiVisibilityScore(prompts = [], engines = GEO_ENGINES) {
  const cellCount = prompts.length * engines.length;
  if (!cellCount) return 0;
  const hits = prompts.reduce((sum, prompt) => sum + (prompt.mentions || []).filter((m) => m.mentioned).length, 0);
  return Math.round((hits / cellCount) * 100);
}

export const ENTITY_WEIGHT = { present: 1, partial: 0.5, missing: 0 };

// Entity readiness score (0-100), ported verbatim from local-file-provider's
// applyEntityOverrides / geo-views.js's entityScore.
export function entityReadinessScore(signals = []) {
  if (!signals.length) return 0;
  const total = signals.reduce((sum, signal) => sum + (ENTITY_WEIGHT[signal.status] ?? 0), 0);
  return Math.round((total / signals.length) * 100);
}

// ── Decision/status mapping, ported verbatim from the retired
// lib/data-provider/local-file-provider.ts's applyDecision() action table. ────

export const DECISION_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);

export function statusForVerdict(action, currentStatus = "needs_review") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return currentStatus; // "revise" edits the draft/note only, status is unchanged
}

// A shipped GEO change (executed) stays done; otherwise a geo-qa BLOCK
// verdict is a hard gate that overrides an "approved" status. Ported
// verbatim from common.ts's mergeGeoOpportunities / geo-views.js's
// geoOpportunities().
export function geoEffectiveStatus(opportunity = {}) {
  if (opportunity.execution?.status === "executed") return "done";
  if (opportunity.gate?.verdict === "BLOCK") return "blocked";
  return opportunity.status;
}

// ── Execution planning, ported verbatim from the retired
// scripts/execute_decisions.ts (OPERATION_BY_TYPE + the results.map loop). ────

export const OPPORTUNITY_OPERATION_BY_TYPE = {
  title_meta_rewrite: "rewrite_title",
  internal_links: "add_internal_links",
  content_brief: "create_content_brief",
  fix_page_issue: "fix_page_issue",
};

export function operationForOpportunity(opportunity = {}, { apply = false } = {}) {
  const operation = OPPORTUNITY_OPERATION_BY_TYPE[opportunity.type] || "fix_page_issue";
  const target = opportunity.target_page || opportunity.target_query || "";
  if (!target) {
    return {
      operation,
      target: "",
      status: "blocked",
      detail: "No target page or query configured; ask the user before executing.",
    };
  }
  return {
    operation,
    target,
    status: apply ? "ready_for_agent" : "planned",
    detail: apply
      ? `Approved: agent should ${operation.replaceAll("_", " ")} for ${target} in the site repo/CMS, then record the real result here.`
      : `Dry run: would ${operation.replaceAll("_", " ")} for ${target} using the ${opportunity.decision_draft ? "user-edited" : "agent"} draft.`,
  };
}

// ── JSON field helpers ─────────────────────────────────────────────────────

export function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ── Normalization: Busabase rows (already snake_cased by the provider) ->
// item shapes. Every destructured field carries a default value. ─────────────

export function normalizeSiteRow({
  site_id = "",
  ref = 0,
  property_url = "",
  verification_type = "url_prefix",
  permission_level = "unknown",
  status = "not_configured",
  last_sync_at = "",
  totals = "",
  previous = "",
  daily = "",
} = {}) {
  return {
    site_id,
    ref: Number(ref) || 0,
    property_url,
    verification_type,
    permission_level,
    status,
    last_sync_at,
    totals: parseJsonValue(totals, { clicks: 0, impressions: 0, ctr: 0, position: 0 }),
    previous: parseJsonValue(previous, { clicks: 0, impressions: 0, ctr: 0, position: 0 }),
    daily: parseJsonValue(daily, []) || [],
  };
}

export function normalizeQueryRow({
  query_id = "",
  site_id = "",
  query = "",
  clicks = 0,
  impressions = 0,
  ctr = 0,
  position = 0,
  previous = "",
  badges = "",
  top_pages = "",
  trend = "",
  agent_notes = "",
} = {}) {
  return {
    query_id,
    site_id,
    query,
    clicks: Number(clicks) || 0,
    impressions: Number(impressions) || 0,
    ctr: Number(ctr) || 0,
    position: Number(position) || 0,
    previous: parseJsonValue(previous, { clicks: 0, impressions: 0, ctr: 0, position: 0 }),
    badges: parseJsonValue(badges, []) || [],
    top_pages: parseJsonValue(top_pages, []) || [],
    trend: parseJsonValue(trend, []) || [],
    agent_notes,
  };
}

export function normalizePageRow({
  page_id = "",
  site_id = "",
  url = "",
  clicks = 0,
  impressions = 0,
  ctr = 0,
  position = 0,
  previous = "",
  issues = "",
  top_queries = "",
  trend = "",
  agent_notes = "",
} = {}) {
  return {
    page_id,
    site_id,
    url,
    clicks: Number(clicks) || 0,
    impressions: Number(impressions) || 0,
    ctr: Number(ctr) || 0,
    position: Number(position) || 0,
    previous: parseJsonValue(previous, { clicks: 0, impressions: 0, ctr: 0, position: 0 }),
    issues: parseJsonValue(issues, []) || [],
    top_queries: parseJsonValue(top_queries, []) || [],
    trend: parseJsonValue(trend, []) || [],
    agent_notes,
  };
}

function normalizeDecision({ decision_action = "", decision_note = "", decision_draft = "", decided_at = "" } = {}) {
  if (!decision_action) return null;
  return { action: decision_action, note: decision_note, draft: decision_draft || null, decided_at };
}

function normalizeExecution({
  execution_status = "",
  execution_operation = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
} = {}) {
  if (!execution_status) return null;
  return {
    status: execution_status,
    operation: execution_operation,
    target: execution_target,
    detail: execution_detail,
    executed_at,
  };
}

export function normalizeOpportunityRow({
  opportunity_id = "",
  ref = 0,
  site_id = "",
  type = "fix_page_issue",
  title = "",
  target_page = "",
  target_query = "",
  reason = "",
  expected_impact = "",
  draft = "",
  status = "needs_review",
  agent_notes = "",
  created_at = "",
  decision_action = "",
  decision_note = "",
  decision_draft = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
} = {}) {
  return {
    id: opportunity_id,
    ref: Number(ref) || 0,
    site_id,
    type,
    title,
    target_page,
    target_query,
    reason,
    expected_impact,
    draft: decision_draft || draft,
    status,
    agent_notes,
    created_at,
    decision_action,
    decision_note,
    decision_draft,
    decided_at,
    decision: normalizeDecision({ decision_action, decision_note, decision_draft, decided_at }),
    execution: normalizeExecution({
      execution_status,
      execution_operation,
      execution_target,
      execution_detail,
      executed_at,
    }),
  };
}

export function normalizeGeoOpportunityRow({
  geo_opportunity_id = "",
  ref = 0,
  type = "citable_rewrite",
  title = "",
  target_page = "",
  target_prompt = "",
  reason = "",
  expected_impact = "",
  draft = "",
  grounding = "",
  claims = "",
  has_schema = "",
  has_qa_block = "",
  status = "needs_review",
  agent_notes = "",
  created_at = "",
  decision_action = "",
  decision_note = "",
  decision_draft = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
} = {}) {
  const effectiveDraft = decision_draft || draft;
  const gate = evaluateGeoGate({
    draft: effectiveDraft,
    claims: parseJsonValue(claims, []) || [],
    has_schema: has_schema === "true",
    has_qa_block: has_qa_block === "true",
  });
  const execution = normalizeExecution({
    execution_status,
    execution_operation,
    execution_target,
    execution_detail,
    executed_at,
  });
  const item = {
    id: geo_opportunity_id,
    ref: Number(ref) || 0,
    type,
    title,
    target_page,
    target_prompt,
    reason,
    expected_impact,
    draft: effectiveDraft,
    grounding: parseJsonValue(grounding, []) || [],
    claims: parseJsonValue(claims, []) || [],
    has_schema: has_schema === "true",
    has_qa_block: has_qa_block === "true",
    gate,
    status,
    agent_notes,
    created_at,
    decision_action,
    decision_note,
    decision_draft,
    decided_at,
    decision: normalizeDecision({ decision_action, decision_note, decision_draft, decided_at }),
    execution,
  };
  item.status = geoEffectiveStatus(item);
  return item;
}

export function normalizeAiVisibilityPromptRow({
  prompt_id = "",
  ref = 0,
  prompt = "",
  intent = "",
  mentions = "",
  trend = "",
} = {}) {
  return {
    prompt_id,
    ref: Number(ref) || 0,
    prompt,
    intent,
    mentions: parseJsonValue(mentions, []) || [],
    trend: parseJsonValue(trend, []) || [],
  };
}

export function normalizeEntitySignalRow({
  signal_id = "",
  label = "",
  category = "",
  status = "missing",
  detail = "",
  fix = "",
} = {}) {
  return { id: signal_id, label, category, status, detail, fix };
}

export function normalizeSettingsRow({
  record_id = "config",
  brand = "",
  locale = "auto",
  sync_window_days = 28,
  sync_row_limit = 250,
  sync_read_only = "true",
  range_current_start = "",
  range_current_end = "",
  range_previous_start = "",
  range_previous_end = "",
  warnings = "",
  ai_visibility_prev_score = 0,
  ai_visibility_engines = "",
} = {}) {
  return {
    record_id,
    brand,
    locale,
    sync_window_days: Number(sync_window_days) || 28,
    sync_row_limit: Number(sync_row_limit) || 250,
    sync_read_only: sync_read_only !== "false",
    range: {
      current: { start: range_current_start, end: range_current_end },
      previous: { start: range_previous_start, end: range_previous_end },
    },
    warnings: parseJsonValue(warnings, []) || [],
    ai_visibility_prev_score: Number(ai_visibility_prev_score) || 0,
    ai_visibility_engines: parseJsonValue(ai_visibility_engines, GEO_ENGINES) || GEO_ENGINES,
  };
}

// ── Snapshot assembly ───────────────────────────────────────────────────────

// Sanitized config summary for #/settings. Shape mirrors the retired
// local-file-provider.ts's summarizeConfig().
/**
 * @param {{ settings?: Record<string, any> }} [args]
 */
export function buildConfigSummary({ settings = {} } = {}) {
  return {
    config_path: "busabase",
    is_example: false,
    brand: settings.brand || "",
    locale: settings.locale || "auto",
    sync: {
      window_days: settings.sync_window_days ?? 28,
      compare_previous_period: true,
      row_limit: settings.sync_row_limit ?? 250,
      read_only: settings.sync_read_only ?? true,
    },
  };
}

// Pure assembly on already-parsed sites/queries/pages/opportunities/
// geoOpportunities/entitySignals (objects, not JSON strings) plus a settings
// row in normalizeSettingsRow()'s output shape. Used directly by the demo
// provider (which builds its fixtures already in this shape) and by
// buildSnapshot() below for the Busabase-row path.
/**
 * @param {{
 *   sites?: Array<Record<string, any>>,
 *   queries?: Array<Record<string, any>>,
 *   pages?: Array<Record<string, any>>,
 *   opportunities?: Array<Record<string, any>>,
 *   geoOpportunities?: Array<Record<string, any>>,
 *   entitySignals?: Array<Record<string, any>>,
 *   settings?: Record<string, any>,
 *   now?: string,
 * }} [args]
 */
export function assembleSnapshot({
  sites = [],
  queries = [],
  pages = [],
  opportunities = [],
  geoOpportunities = [],
  entitySignals = [],
  settings = {},
  now = new Date().toISOString(),
} = {}) {
  const sortedSites = [...sites].sort((a, b) => (a.ref || 0) - (b.ref || 0));
  const sortedOpportunities = [...opportunities].sort((a, b) => (a.ref || 0) - (b.ref || 0));
  const sortedGeoOpportunities = [...geoOpportunities].sort((a, b) => (a.ref || 0) - (b.ref || 0));
  const sortedPrompts = [...(settings.prompts || [])];
  const daily = sortedSites.flatMap((site) => (site.daily || []).map((point) => ({ site_id: site.site_id, ...point })));
  const totals = aggregateTotals(sortedSites.map((site) => site.totals));
  const prevTotals = aggregateTotals(sortedSites.map((site) => site.previous));

  const engines = settings.ai_visibility_engines?.length ? settings.ai_visibility_engines : GEO_ENGINES;
  const promptList = sortedPrompts.length ? sortedPrompts : [];

  const warnings = settings.warnings?.length
    ? settings.warnings
    : sortedSites.length
      ? []
      : [
          {
            id: "no-snapshot",
            severity: "info",
            message: "No SEO snapshot exists yet. Configure site properties, then run a read-only GSC sync.",
          },
        ];

  return {
    schema_version: "1",
    generated_at: now,
    source: "kelly-seo",
    range: settings.range || { current: { start: "", end: "" }, previous: { start: "", end: "" } },
    metrics: {
      site_count: sortedSites.length,
      query_count: queries.length,
      page_count: pages.length,
      opportunity_count: sortedOpportunities.length,
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: totals.ctr,
      position: totals.position,
      prev_clicks: prevTotals.clicks,
      prev_impressions: prevTotals.impressions,
      prev_ctr: prevTotals.ctr,
      prev_position: prevTotals.position,
    },
    sites: sortedSites,
    daily,
    queries,
    pages,
    opportunities: sortedOpportunities,
    warnings,
    ai_visibility: promptList.length
      ? {
          brand: settings.brand || "",
          engines,
          score: aiVisibilityScore(promptList, engines),
          prev_score: settings.ai_visibility_prev_score || 0,
          prompts: promptList,
        }
      : null,
    geo_opportunities: sortedGeoOpportunities,
    entity_signals: entitySignals.length
      ? { brand: settings.brand || "", score: entityReadinessScore(entitySignals), signals: entitySignals }
      : null,
  };
}

// Busabase-row wrapper: normalizes the raw sites/queries/pages/
// opportunities/geoOpportunities/entitySignals/aiVisibilityPrompts/settings
// rows read from Busabase (already snake_cased by the provider) into the
// shapes the UI expects, then calls assembleSnapshot().
/**
 * @param {{
 *   sites?: Array<Record<string, any>>,
 *   queries?: Array<Record<string, any>>,
 *   pages?: Array<Record<string, any>>,
 *   opportunities?: Array<Record<string, any>>,
 *   geoOpportunities?: Array<Record<string, any>>,
 *   entitySignals?: Array<Record<string, any>>,
 *   aiVisibilityPrompts?: Array<Record<string, any>>,
 *   settings?: Record<string, any>,
 *   now?: string,
 * }} [args]
 */
export function buildSnapshot({
  sites = [],
  queries = [],
  pages = [],
  opportunities = [],
  geoOpportunities = [],
  entitySignals = [],
  aiVisibilityPrompts = [],
  settings = {},
  now = new Date().toISOString(),
} = {}) {
  const normalizedSettings = normalizeSettingsRow(settings);
  return assembleSnapshot({
    sites: sites.map(normalizeSiteRow),
    queries: queries.map(normalizeQueryRow),
    pages: pages.map(normalizePageRow),
    opportunities: opportunities.map(normalizeOpportunityRow),
    geoOpportunities: geoOpportunities.map(normalizeGeoOpportunityRow),
    entitySignals: entitySignals.map(normalizeEntitySignalRow),
    settings: { ...normalizedSettings, prompts: aiVisibilityPrompts.map(normalizeAiVisibilityPromptRow) },
    now,
  });
}
