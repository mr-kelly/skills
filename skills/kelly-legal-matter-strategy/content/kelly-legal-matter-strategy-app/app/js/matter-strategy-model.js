// Pure domain logic for kelly-legal-matter-strategy, ported verbatim (same
// field names, same order of operations, only TS types stripped) from the
// retired lib/common.ts (emptyMetrics/recomputeMetrics/statusFromDecision)
// and lib/data-provider/local-file-provider.ts (summarizeConfig's shape,
// applyDecision's allowed-action set). Identity fields are renamed only
// where the retired schema used a bare `id`/`fields` that now needs a
// Busabase-safe column name: `item.id` -> Busabase field `item-id`
// (normalized to `item_id`), `entity.id` -> `entity-id` (`entity_id`),
// `check.id` -> `check-id` (`check_id`). Every other field name is unchanged
// from lib/types.ts's ReviewItem/EntityCard/CheckItem/MetricSet shapes so
// review-views.js ports with minimal risk of transcription error.
//
// Reviewer decisions are no longer a separate decisions.json bucket: the
// verdict (`decision_action`/`decision_note`/`decided_at`) is written
// directly onto the item's own Busabase row, mirroring
// kelly-legal-casebase-ingest's and kelly-legal-firm-radar's items Base.
// `agent_tasks.json` (queued "revise_review_item" work created by a
// `request_changes` decision) is dropped entirely — nothing in the UI ever
// read it, so there is no Busabase equivalent to preserve.

export const APP_ID = "kelly-legal-matter-strategy";
export const APP_TITLE = "Legal Matter Strategy";
export const APP_TITLE_ZH = "案件策略与文书辅助台";
export const APP_SUBTITLE = "Strategy, evidence, and drafting plans";
export const APP_SUBTITLE_ZH = "争议策略、证据与文书方案";
export const ITEM_LABEL_EN = "Strategy";
export const ITEM_LABEL_ZH = "策略项";

export function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function boolField(value, fallback = false) {
  if (value === "" || value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

export function slugify(value = "") {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

// ---- Decision -> status mapping, ported verbatim from the retired
// lib/common.ts's statusFromDecision(). "revise" maps back to
// "needs_review" (saving an edited draft/note returns the record to the
// review queue) rather than leaving status unchanged — this is the retired
// app's actual behavior (lib/data-provider/local-file-provider.ts's
// ALLOWED_ACTIONS included "revise" alongside approve/request_changes/block,
// and lib/common.ts's statusFromDecision() table below is unchanged). ----

export const DECISION_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);

export function statusFromDecision(action) {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  if (action === "revise") return "needs_review";
  return null;
}

// ---- Normalization: Busabase rows (already snake_cased by the provider) -> item shapes ----

export function normalizeItemRow({
  item_id = "",
  ref = "",
  title = "",
  category = "",
  status = "needs_review",
  owner = "",
  risk = "",
  summary = "",
  body = "",
  recommendation = "",
  proposed_action = "",
  draft = "",
  evidence = "",
  matter_stage = "",
  evidence_gap_count = "",
  evidence_gaps_list = "",
  issue_tree = "",
  negotiation_options = "",
  posture = "",
  pleading_outline = "",
  deadline = "",
  decision_action = "",
  decision_note = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    id: item_id,
    ref,
    title,
    category,
    status: status || "needs_review",
    owner,
    risk: parseJsonValue(risk, []) || [],
    summary,
    body,
    recommendation,
    proposed_action,
    draft,
    evidence: parseJsonValue(evidence, []) || [],
    fields: {
      matter_stage,
      evidence_gap_count: evidence_gap_count === "" ? undefined : Number(evidence_gap_count),
      evidence_gaps_list: parseJsonValue(evidence_gaps_list, []) || [],
      issue_tree: parseJsonValue(issue_tree, []) || [],
      negotiation_options: parseJsonValue(negotiation_options, []) || [],
      posture,
      pleading_outline,
      deadline,
    },
    decision_action,
    review_note: decision_note,
    decided_at: decided_at || undefined,
    execution_status: execution_status || undefined,
    execution_operation: execution_operation || undefined,
    execution_target: execution_target || undefined,
    execution_detail: execution_detail || undefined,
    executed_at: executed_at || undefined,
    created_at,
    updated_at,
  };
}

export function normalizeEntityRow({
  entity_id = "",
  title = "",
  meta = "",
  status = "",
  owner = "",
  summary = "",
  tags = "",
  metrics = "",
} = {}) {
  return {
    id: entity_id,
    title,
    meta,
    status,
    owner,
    summary,
    tags: parseJsonValue(tags, []) || [],
    metrics: parseJsonValue(metrics, {}) || {},
  };
}

export function normalizeCheckRow({
  check_id = "",
  label = "",
  status = "pass",
  detail = "",
  item_id = "",
  severity = "",
} = {}) {
  return { id: check_id, label, status, detail, item_id, severity };
}

// Sanitized config summary for #/settings — reads straight off the live
// Settings row. Shape mirrors the retired local-file-provider.ts's
// summarizeConfig()/config.example.json's top-level keys
// (firm_profile/strategy_policy/templates/export).
/**
 * @param {{ settings?: Record<string, any> }} [args]
 */
export function buildConfigSummary({ settings = {} } = {}) {
  const defaultJurisdictions = parseJsonValue(settings.default_jurisdictions, []) || [];
  const defaultRiskScale = parseJsonValue(settings.default_risk_scale, []) || [];
  const templatesEnabled = parseJsonValue(settings.templates_enabled, []) || [];
  return {
    config_path: "busabase",
    is_example: false,
    firm_profile: {
      firm_name: settings.firm_name || "",
      branch: settings.branch || "",
      reviewer_role: settings.reviewer_role || "",
      default_jurisdictions: defaultJurisdictions,
    },
    strategy_policy: {
      require_precedent_links: boolField(settings.require_precedent_links, true),
      require_evidence_map: boolField(settings.require_evidence_map, true),
      default_risk_scale: defaultRiskScale,
      approval_required_for_client_facing: boolField(settings.approval_required_for_client_facing, true),
    },
    templates: {
      enabled: templatesEnabled,
    },
    export: {
      format: settings.export_format || "markdown+json",
      out_dir: settings.export_out_dir || "exports/strategy-packs",
    },
  };
}

// ---- Metrics, ported verbatim from the retired lib/common.ts. Only the
// metric keys that are actually stored fields are recomputed here
// (items_total/needs_review/changes_requested/approved/done/blocked/
// checks_failed) — evidence_gaps/deadlines_soon/draft_ready have no
// dedicated Busabase column on items (app.js's businessMetricsHtml already
// falls back to summing the item fields / counting ready items when
// absent); `extra` lets a caller merge in display-only metrics the same way
// the retired demo/server payload did. ----

export function emptyMetrics() {
  return { items_total: 0, needs_review: 0, changes_requested: 0, approved: 0, done: 0, blocked: 0, checks_failed: 0 };
}

/**
 * @param {Array<Record<string, any>>} [items]
 * @param {Array<Record<string, any>>} [checks]
 * @param {Record<string, any>} [extra]
 * @returns {Record<string, any>}
 */
export function recomputeMetrics(items = [], checks = [], extra = {}) {
  const metrics = emptyMetrics();
  metrics.items_total = items.length;
  for (const item of items) {
    const status = item.status || "needs_review";
    if (status in metrics) metrics[status] = Number(metrics[status] || 0) + 1;
  }
  metrics.checks_failed = checks.filter((check) => check.status === "fail").length;
  return { ...extra, ...metrics };
}

// New orchestration (not a port): derives a recent-activity feed from each
// item's own timestamps instead of reading a persisted activity_log.json,
// since Busabase reads are always live — same technique as
// kelly-legal-casebase-ingest's and kelly-legal-firm-radar's deriveActivityLog.
export function deriveActivityLog(items = [], { limit = 50 } = {}) {
  const entries = [];
  for (const item of items) {
    if (item.created_at) {
      entries.push({
        at: item.created_at,
        actor: "agent",
        action: "prepare",
        detail: `Prepared matter strategy "${item.title}" for review.`,
        count: 1,
      });
    }
    if (item.updated_at && item.updated_at !== item.created_at) {
      entries.push({
        at: item.updated_at,
        actor: "agent",
        action: "update",
        detail: `Updated matter strategy "${item.title}".`,
        count: 1,
      });
    }
    if (item.decided_at && item.decision_action) {
      const label =
        item.decision_action === "approve"
          ? "Approved"
          : item.decision_action === "request_changes"
            ? "Requested changes on"
            : item.decision_action === "block"
              ? "Blocked"
              : "Revised";
      entries.push({
        at: item.decided_at,
        actor: "reviewer",
        action: "decision",
        detail: `${label} "${item.title}"${item.review_note ? `: ${item.review_note}` : "."}`,
        count: 1,
      });
    }
  }
  return entries.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

// Adapted (not a byte-for-byte port) from the retired scripts/execute_decisions.ts:
// maps an approved or changes-requested item to the concrete follow-up
// operation the agent must perform outside the app, and the target the
// operation acts on. The retired script wrote item.status = "done" directly
// when --apply was passed; this Busabase-only shape follows
// kelly-legal-casebase-ingest's/kelly-legal-firm-radar's more conservative
// precedent instead — it never flips workflow status itself, only records an
// execution marker directly on the item record (execution_status/operation/
// target/detail/executed_at).
export function itemExecution(item, action, { apply = false } = {}) {
  if (action === "approve") {
    const target = `exports/strategy-packs/${slugify(item.title || item.id)}.md`;
    return {
      operation: "export_strategy_pack",
      target,
      status: apply ? "ready_for_agent" : "planned",
      detail: `Run scripts/export_strategy_pack.mjs to write ${target}. Filing, sending, and client advice remain a separate explicit approval, never this script.`,
    };
  }
  if (action === "request_changes") {
    return {
      operation: "request_revision",
      target: item.id,
      status: apply ? "ready_for_agent" : "planned",
      detail: "Redraft the matter strategy per the review note, then re-import with scripts/create_strategy_batch.mjs.",
    };
  }
  return null;
}

// Pure assembly on already-parsed items/entities/checks (fields as real
// objects/arrays, not JSON strings) plus a configSummary in
// buildConfigSummary()'s output shape. Used directly by the demo provider
// (which builds its fixtures already in this shape) and by buildSnapshot()
// below for the Busabase-row path.
/**
 * @param {{
 *   items?: Array<Record<string, any>>,
 *   entities?: Array<Record<string, any>>,
 *   checks?: Array<Record<string, any>>,
 *   workspace?: Record<string, any>,
 *   now?: string,
 *   extra?: Record<string, any>,
 * }} [args]
 */
export function assembleSnapshot({
  items = [],
  entities = [],
  checks = [],
  workspace = {},
  now = new Date().toISOString(),
  extra = {},
} = {}) {
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-legal-matter-strategy",
    workspace,
    metrics: {},
    entities,
    items,
    checks,
    activity_log: deriveActivityLog(items),
  };
  snapshot.metrics = recomputeMetrics(items, checks, extra);
  return snapshot;
}

// Busabase-row wrapper: normalizes the raw items/entities/checks rows read
// from Busabase (already snake_cased by the provider) into the shapes the
// UI expects, then calls assembleSnapshot().
export function buildSnapshot({
  items = [],
  entities = [],
  checks = [],
  workspace = {},
  now = new Date().toISOString(),
  extra = {},
} = {}) {
  return assembleSnapshot({
    items: items.map(normalizeItemRow),
    entities: entities.map(normalizeEntityRow),
    checks: checks.map(normalizeCheckRow),
    workspace,
    now,
    extra,
  });
}
