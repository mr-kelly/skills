// Pure, storage-agnostic domain logic for kelly-retail-intel — no
// fs, no network, safe in both the browser and the trusted skill-root script.
//
// Ported verbatim (same variable names, same order of operations, only TS
// types stripped) from the retired app/server/store.ts (readState/readBatch/
// saveDecision), app/server/demo.ts (makeDemoBatch — now demo-provider.js's
// seed data), app/app.js (effectiveStatus()/counts()), and
// scripts/execute_decisions.ts (the approve/request_changes/block/revise ->
// concrete operation mapping). The retired shape kept one polymorphic item
// list (signals+actions+drafts tagged with `kind`) inside a single
// current_batch.json; the Busabase shape splits them into three Bases
// (signals/actions/drafts) with the same per-item fields, so every
// normalize*/status/operation helper below is kind-specific instead of
// dispatching on a `kind` property read off a shared object shape.

export const DECISION_KINDS = ["signal", "action", "draft"];
// Ported from the retired scripts/validate_ui_schema.ts's ACTIONS set.
// "revise" is draft-only in the UI (saves an edited body without a verdict);
// signals/actions only ever offer approve/request_changes/block.
export const REVIEW_ACTIONS = ["approve", "request_changes", "block"];
export const DRAFT_ACTIONS = ["approve", "request_changes", "block", "revise"];
// Ported verbatim from the retired scripts/validate_ui_schema.ts's STATUSES set.
export const STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];

// Ported verbatim from the retired app/app.js's effectiveStatus(): maps a
// review verb to the workflow status stored on the item. The retired version
// left `revise` (draft-only, saves an edited body without a verdict) mapped
// to whatever the item's current status already was, since it read the verb
// through a separate decisions.json overlay; there is no overlay to "leave
// unchanged" against once the verdict is written directly onto the Busabase
// record, so `revise` resolves to needs_review here — the same status a
// freshly-drafted, not-yet-decided item already has.
export function statusForAction(action = "") {
  if (action === "approve") return "approved";
  if (action === "block") return "blocked";
  if (action === "request_changes") return "changes_requested";
  if (action === "revise") return "needs_review";
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

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ── Normalization: Busabase rows <-> item shapes ───────────────────────────
// Field sets ported field-for-field from the retired app/server/demo.ts's
// makeDemoBatch() signal/action/draft shapes and references/ui-schema.md's
// required-field lists.

export function normalizeSignal({
  signal_id = "",
  ref = 0,
  title = "",
  summary = "",
  why_it_matters = "",
  buyer_intent = "",
  confidence = 0,
  detected_at = "",
  status = "needs_review",
  risk = "",
  source_name = "",
  source_url = "",
  suggested_action_id = "",
  decision_verdict = "",
  decision_comment = "",
  decided_at = "",
  __recordId = undefined,
  __headCommitId = undefined,
} = {}) {
  return {
    id: signal_id,
    kind: "signal",
    ref: numberOrZero(ref),
    title,
    summary,
    why_it_matters,
    buyer_intent,
    confidence: numberOrZero(confidence),
    detected_at,
    status,
    risk: parseJsonValue(risk, []) || [],
    source: { name: source_name, url: source_url },
    suggested_action_id,
    ...(decision_verdict ? { decision: { action: decision_verdict, comment: decision_comment, decided_at } } : {}),
    __recordId,
    __headCommitId,
  };
}

export function baseSignalFields({
  signal_id = "",
  ref = 0,
  title = "",
  summary = "",
  why_it_matters = "",
  buyer_intent = "",
  confidence = 0,
  detected_at = "",
  status = "needs_review",
  risk = [],
  source: { name: sourceName = "", url: sourceUrl = "" } = {},
  suggested_action_id = "",
  decision_verdict = "",
  decision_comment = "",
  decided_at = "",
} = {}) {
  return {
    signal_id,
    ref: numberOrZero(ref),
    title,
    summary,
    why_it_matters,
    buyer_intent,
    confidence: numberOrZero(confidence),
    detected_at,
    status,
    risk: JSON.stringify(risk || []),
    source_name: sourceName,
    source_url: sourceUrl,
    suggested_action_id,
    decision_verdict,
    decision_comment,
    decided_at,
  };
}

export function normalizeAction({
  action_id = "",
  ref = 0,
  title = "",
  summary = "",
  status = "needs_review",
  priority = "medium",
  owner = "operator",
  reason = "",
  linked_signal_ids = "",
  next_step = "",
  decision_verdict = "",
  decision_comment = "",
  decided_at = "",
  __recordId = undefined,
  __headCommitId = undefined,
} = {}) {
  return {
    id: action_id,
    kind: "action",
    ref: numberOrZero(ref),
    title,
    summary,
    status,
    priority,
    owner,
    reason,
    linked_signal_ids: parseJsonValue(linked_signal_ids, []) || [],
    next_step,
    ...(decision_verdict ? { decision: { action: decision_verdict, comment: decision_comment, decided_at } } : {}),
    __recordId,
    __headCommitId,
  };
}

export function baseActionFields({
  action_id = "",
  ref = 0,
  title = "",
  summary = "",
  status = "needs_review",
  priority = "medium",
  owner = "operator",
  reason = "",
  linked_signal_ids = [],
  next_step = "",
  decision_verdict = "",
  decision_comment = "",
  decided_at = "",
} = {}) {
  return {
    action_id,
    ref: numberOrZero(ref),
    title,
    summary,
    status,
    priority,
    owner,
    reason,
    linked_signal_ids: JSON.stringify(linked_signal_ids || []),
    next_step,
    decision_verdict,
    decision_comment,
    decided_at,
  };
}

export function normalizeDraft({
  draft_id = "",
  ref = 0,
  channel = "",
  title = "",
  body = "",
  edited_body = "",
  status = "needs_review",
  risk = "",
  linked_action_id = "",
  decision_verdict = "",
  decision_comment = "",
  decided_at = "",
  __recordId = undefined,
  __headCommitId = undefined,
} = {}) {
  return {
    id: draft_id,
    kind: "draft",
    ref: numberOrZero(ref),
    channel,
    title,
    body,
    edited_body,
    // Ported from the retired app/app.js's detail(): the edited body (if any
    // human revision exists) always wins over the agent-drafted body.
    effective_body: edited_body || body,
    status,
    risk: parseJsonValue(risk, []) || [],
    linked_action_id,
    ...(decision_verdict ? { decision: { action: decision_verdict, comment: decision_comment, decided_at } } : {}),
    __recordId,
    __headCommitId,
  };
}

export function baseDraftFields({
  draft_id = "",
  ref = 0,
  channel = "",
  title = "",
  body = "",
  edited_body = "",
  status = "needs_review",
  risk = [],
  linked_action_id = "",
  decision_verdict = "",
  decision_comment = "",
  decided_at = "",
} = {}) {
  return {
    draft_id,
    ref: numberOrZero(ref),
    channel,
    title,
    body,
    edited_body,
    status,
    risk: JSON.stringify(risk || []),
    linked_action_id,
    decision_verdict,
    decision_comment,
    decided_at,
  };
}

export function normalizeSource({
  source_id = "",
  label = "",
  status = "needs_config",
  freshness = "",
  coverage = "",
} = {}) {
  return { id: source_id, label, status, freshness, coverage };
}

export function baseSourceFields({
  source_id = "",
  label = "",
  status = "needs_config",
  freshness = "",
  coverage = "",
} = {}) {
  return { source_id, label, status, freshness, coverage };
}

// ── Batch meta (ported from the retired current_batch.json's top-level
// schema_version/batch_id/generated_at/source/vertical/buyer/offer fields,
// held in the `settings` Base's single "batch" row as a JSON payload) ──────

export function parseBatchMeta(payload = "") {
  const meta = parseJsonValue(payload, {}) || {};
  return {
    schema_version: meta.schema_version || "1",
    batch_id: meta.batch_id || "",
    generated_at: meta.generated_at || "",
    source: meta.source || "kelly-retail-intel",
    vertical: meta.vertical || "retail stores and consumer brands",
    buyer: meta.buyer || "",
    offer: meta.offer || "",
  };
}

export function batchMetaPayload({
  schema_version = "1",
  batch_id = "",
  generated_at = "",
  source = "kelly-retail-intel",
  vertical = "retail stores and consumer brands",
  buyer = "",
  offer = "",
} = {}) {
  return JSON.stringify({ schema_version, batch_id, generated_at, source, vertical, buyer, offer });
}

// ── Snapshot assembly + metrics (ported verbatim from the retired
// app/app.js's counts()/allItems() and app/server/demo.ts's metrics block) ─

export function buildSnapshot({
  signals = [],
  actions = [],
  drafts = [],
  sources = [],
  meta: {
    schema_version = "1",
    batch_id = "",
    generated_at = "",
    source = "kelly-retail-intel",
    vertical = "retail stores and consumer brands",
    buyer = "",
    offer = "",
  } = {},
} = {}) {
  const normalizedSignals = signals.map(normalizeSignal);
  const normalizedActions = actions.map(normalizeAction);
  const normalizedDrafts = drafts.map(normalizeDraft);
  const normalizedSources = sources.map(normalizeSource);
  const batch = {
    schema_version,
    batch_id,
    generated_at,
    source,
    vertical,
    buyer,
    offer,
    signals: normalizedSignals,
    actions: normalizedActions,
    drafts: normalizedDrafts,
    sources: normalizedSources,
  };
  batch.metrics = computeMetrics(batch);
  return batch;
}

// Ported verbatim from the retired app/app.js's counts(): needs/approved/
// blocked (blocked also folds in changes_requested, same as the retired
// itemRow()/badge() treatment) computed across all three item kinds
// together, plus the retired app/server/demo.ts's per-kind *_needs_review
// counters.
export function computeMetrics({ signals = [], actions = [], drafts = [] } = {}) {
  const allItems = [...signals, ...actions, ...drafts];
  return {
    signals_needs_review: signals.filter((item) => item.status === "needs_review").length,
    actions_needs_review: actions.filter((item) => item.status === "needs_review").length,
    drafts_needs_review: drafts.filter((item) => item.status === "needs_review").length,
    needs_review: allItems.filter((item) => item.status === "needs_review").length,
    approved: allItems.filter((item) => item.status === "approved").length,
    blocked: allItems.filter((item) => item.status === "blocked" || item.status === "changes_requested").length,
  };
}

// ── Execute-decisions planning (ported verbatim from the retired
// scripts/execute_decisions.ts's per-item operation branch — the same
// channel-then-next_step-then-signal shape check picks the right operation
// name without needing a separate `kind` argument) ─────────────────────────
export function operationForDecision(item = {}, action = "") {
  if (action === "approve") {
    return {
      operation: item.channel ? "handoff_content_pack" : item.next_step ? "export_action_plan" : "mark_signal_approved",
      target: item.channel || item.title || "",
    };
  }
  if (action === "request_changes") {
    return { operation: "queue_agent_revision", target: item.title || item.channel || "" };
  }
  if (action === "block") {
    return { operation: "mark_blocked", target: item.title || item.channel || "" };
  }
  if (action === "revise") {
    return { operation: "save_human_revision", target: item.title || item.channel || "" };
  }
  return null;
}
