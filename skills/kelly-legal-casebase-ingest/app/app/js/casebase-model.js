// Pure domain logic for kelly-legal-casebase-ingest, ported verbatim (same
// field names, same order of operations, only TS types stripped) from the
// retired lib/common.ts (emptyMetrics/recomputeMetrics/statusFromDecision)
// and lib/data-provider/local-file-provider.ts (summarizeConfig's shape,
// applyDecision's allowed-action set). Identity fields are renamed only
// where the retired schema used a bare `id`/`fields` that now needs a
// Busabase-safe column name: `item.id` -> Busabase field `item-id`
// (normalized to `item_id`), `entity.id` -> `entity-id` (`entity_id`),
// `check.id` -> `check-id` (`check_id`). Every other field name is
// unchanged from lib/types.ts's ReviewItem/EntityCard/CheckItem/MetricSet
// shapes so review-views.js ports with minimal risk of transcription error.
//
// Reviewer decisions are no longer a separate decisions.json bucket: the
// verdict (`decision_action`/`decision_note`/`decided_at`) is written
// directly onto the item's own Busabase row, mirroring kelly-legal-contracts'
// issues Base. `agent_tasks.json` (queued "revise_review_item" work created
// by a `request_changes` decision) is dropped entirely — nothing in the UI
// ever read it, so there is no Busabase equivalent to preserve.

export const APP_ID = "kelly-legal-casebase-ingest";
export const APP_TITLE = "Legal Casebase Ingest";
export const APP_TITLE_ZH = "案例入库质检台";
export const APP_SUBTITLE = "Case intake and anonymization QA";
export const APP_SUBTITLE_ZH = "裁判文书入库与脱敏质检";
export const ITEM_LABEL_EN = "Intake";
export const ITEM_LABEL_ZH = "入库项";

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
// lib/common.ts's statusFromDecision(). Unlike kelly-legal-contracts'
// statusForVerdict, "revise" here maps back to "needs_review" (saving an
// edited draft/note returns the record to the review queue) rather than
// leaving status unchanged — this is the retired app's actual behavior
// (app/app.js's effectiveItem() used the identical statusByAction table). ----

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
  cause = "",
  court = "",
  procedure = "",
  outcome = "",
  paragraphs = "",
  extraction_confidence = "",
  duplicate_score = "",
  ingest_bucket = "",
  pii_cleared = "",
  parties_redacted = "",
  contacts_redacted = "",
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
      cause,
      court,
      procedure,
      outcome,
      paragraphs: parseJsonValue(paragraphs, []) || [],
      extraction_confidence: extraction_confidence === "" ? undefined : Number(extraction_confidence),
      duplicate_score: duplicate_score === "" ? undefined : Number(duplicate_score),
      ingest_bucket,
      pii_cleared: boolField(pii_cleared, undefined),
      parties_redacted: boolField(parties_redacted, undefined),
      contacts_redacted: boolField(contacts_redacted, undefined),
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
// (firm_profile/ingestion/anonymization/taxonomy/export).
/**
 * @param {{ settings?: Record<string, any> }} [args]
 */
export function buildConfigSummary({ settings = {} } = {}) {
  const defaultJurisdictions = parseJsonValue(settings.default_jurisdictions, []) || [];
  const allowedDocumentTypes = parseJsonValue(settings.allowed_document_types, []) || [];
  const requiredTaxonomyFields = parseJsonValue(settings.required_taxonomy_fields, []) || [];
  return {
    config_path: "busabase",
    is_example: false,
    firm_profile: {
      firm_name: settings.firm_name || "",
      branch: settings.branch || "",
      reviewer_role: settings.reviewer_role || "",
      default_jurisdictions: defaultJurisdictions,
    },
    ingestion: {
      allowed_document_types: allowedDocumentTypes,
    },
    anonymization: {
      standard: settings.anonymization_standard || "",
      require_party_redaction: boolField(settings.require_party_redaction, true),
      require_business_secret_review: boolField(settings.require_business_secret_review, true),
      sample_rate: settings.sample_rate === undefined || settings.sample_rate === "" ? 0 : Number(settings.sample_rate),
    },
    taxonomy: {
      required_fields: requiredTaxonomyFields,
    },
    export: {
      format: settings.export_format || "markdown+json+csv",
      out_dir: settings.export_out_dir || "exports",
    },
  };
}

// ---- Metrics, ported verbatim from the retired lib/common.ts. Only the
// metric keys that are actually stored fields are recomputed here
// (items_total/needs_review/changes_requested/approved/done/blocked/
// checks_failed) — source_docs/pii_warnings/duplicate_candidates have no
// Busabase column (nothing writes them outside the retired demo dataset)
// and the UI (review-views.js's businessMetricsHtml) already falls back
// sensibly when they are absent. ----

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
// kelly-legal-contracts' deriveActivityLog.
export function deriveActivityLog(items = [], { limit = 50 } = {}) {
  const entries = [];
  for (const item of items) {
    if (item.created_at) {
      entries.push({
        at: item.created_at,
        actor: "agent",
        action: "ingest",
        detail: `Prepared case record "${item.title}" for review.`,
        count: 1,
      });
    }
    if (item.updated_at && item.updated_at !== item.created_at) {
      entries.push({
        at: item.updated_at,
        actor: "agent",
        action: "update",
        detail: `Updated case record "${item.title}".`,
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
// kelly-legal-contracts' more conservative precedent instead — it never
// flips workflow status itself, only records an execution marker directly
// on the item record (execution_status/operation/target/detail/executed_at).
export function itemExecution(item, action, { apply = false } = {}) {
  if (action === "approve") {
    const target = `exports/case-records/${slugify(item.title || item.id)}.md`;
    return {
      operation: "export_case_record",
      target,
      status: apply ? "ready_for_agent" : "planned",
      detail: `Run scripts/export_case_records.mjs to write ${target}. Downstream visibility (precedent desk, firm radar) is a separate approved consumer, never this script.`,
    };
  }
  if (action === "request_changes") {
    return {
      operation: "request_revision",
      target: item.id,
      status: apply ? "ready_for_agent" : "planned",
      detail: "Redraft the case record per the review note, then re-ingest with scripts/ingest_documents.mjs.",
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
 * }} [args]
 */
export function assembleSnapshot({
  items = [],
  entities = [],
  checks = [],
  workspace = {},
  now = new Date().toISOString(),
} = {}) {
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-legal-casebase-ingest",
    workspace,
    metrics: {},
    entities,
    items,
    checks,
    activity_log: deriveActivityLog(items),
  };
  snapshot.metrics = recomputeMetrics(items, checks);
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
} = {}) {
  return assembleSnapshot({
    items: items.map(normalizeItemRow),
    entities: entities.map(normalizeEntityRow),
    checks: checks.map(normalizeCheckRow),
    workspace,
    now,
  });
}
