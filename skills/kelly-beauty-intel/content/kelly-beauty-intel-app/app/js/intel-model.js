// Pure domain logic for kelly-beauty-intel: turn normalized Busabase records
// (one array per Base, snake_case field keys) into the batch shape the UI
// renders. Every signal/action/draft record carries its own live
// status/decision fields, so the batch built here is always the current
// truth — no separate decisions file to reconcile against a stale snapshot.

export const DECISION_ACTIONS = ["approve", "request_changes", "revise", "block"];

const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function statusForAction(action) {
  return DECISION_STATUS[action] || null;
}

export function buildBatch({ signals = [], actions = [], drafts = [], sources = [] } = {}) {
  const normalizedSignals = signals.map((row) => ({
    id: row.signal_id || "",
    ref: Number(row.ref || 0),
    title: row.title || "",
    summary: row.summary || "",
    why_it_matters: row.why_it_matters || "",
    buyer_intent: row.buyer_intent || "",
    confidence: Number(row.confidence || 0),
    detected_at: row.detected_at || "",
    status: row.status || "needs_review",
    risk: parseJsonList(row.risk),
    source: { name: row.source_name || "", url: row.source_url || "" },
    suggested_action_id: row.suggested_action_id || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
  }));

  const normalizedActions = actions.map((row) => ({
    id: row.action_id || "",
    ref: Number(row.ref || 0),
    title: row.title || "",
    summary: row.summary || "",
    status: row.status || "needs_review",
    priority: row.priority || "medium",
    owner: row.owner || "",
    reason: row.reason || "",
    linked_signal_ids: parseJsonList(row.linked_signal_ids),
    next_step: row.next_step || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
  }));

  const normalizedDrafts = drafts.map((row) => ({
    id: row.draft_id || "",
    ref: Number(row.ref || 0),
    channel: row.channel || "",
    title: row.title || "",
    body: row.body || "",
    status: row.status || "needs_review",
    risk: parseJsonList(row.risk),
    linked_action_id: row.linked_action_id || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
  }));

  const normalizedSources = sources.map((row) => ({
    id: row.source_id || "",
    label: row.label || "",
    status: row.status || "needs_config",
    freshness: row.freshness || "",
    coverage: row.coverage || "",
  }));

  const needsReview = (list) => list.filter((item) => item.status === "needs_review").length;
  const isBlocked = (item) => item.status === "blocked";
  const isApproved = (item) => item.status === "approved";

  return {
    schema_version: "1",
    batch_id: `kelly-beauty-intel-${new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14)}`,
    generated_at: new Date().toISOString(),
    source: "kelly-beauty-intel",
    vertical: "beauty, wellness, and medical aesthetics",
    buyer: "beauty salon owners, medical-aesthetics clinics, wellness operators, and consultants",
    offer: "daily beauty intelligence that becomes safe treatment angles, consultation scripts, and social drafts",
    metrics: {
      signals_needs_review: needsReview(normalizedSignals),
      actions_needs_review: needsReview(normalizedActions),
      drafts_needs_review: needsReview(normalizedDrafts),
      approved: [...normalizedSignals, ...normalizedActions, ...normalizedDrafts].filter(isApproved).length,
      blocked: [...normalizedSignals, ...normalizedActions, ...normalizedDrafts].filter(isBlocked).length,
    },
    signals: normalizedSignals,
    actions: normalizedActions,
    drafts: normalizedDrafts,
    sources: normalizedSources,
  };
}
