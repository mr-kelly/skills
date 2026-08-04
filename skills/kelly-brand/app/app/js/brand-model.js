// Pure domain logic for kelly-brand: turn normalized Busabase records into
// the brand-narrative snapshot shape the UI renders — the message house
// (positioning + pillars), the story bank, proof points, vocabulary/
// guardrails, drift alerts, and the aggregate Narrative Quality Score (NQS).
//
// Ported verbatim (same variable names, same order of operations) from the
// retired app/server/demo.ts's demoSnapshot() aggregation logic, which is
// the one place the original local-file skill computed these rollups.

export const TYPES = ["positioning", "message_pillar", "story", "proof_point", "vocabulary", "guardrail"];

export const PHASES = ["trace", "architect", "land", "evaluate"];

export const DECISION_ACTIONS = ["approve", "request_changes", "block", "revise"];

export const DRIFT_ACTIONS = ["resolve_drift", "dismiss_drift"];

const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};

const DRIFT_DECISION_STATUS = {
  resolve_drift: "resolved",
  dismiss_drift: "dismissed",
};

export function statusForAction(action) {
  return DECISION_STATUS[action] || null;
}

export function driftStatusForAction(action) {
  return DRIFT_DECISION_STATUS[action] || null;
}

// The overview's overall gate is the one place the NQS threshold rule from
// SKILL.md is a pure numeric function: >=80 SHIP, >=55 FIX, else BLOCK. A
// per-item nqs.gate is the narrative-quality-auditor's own judgment and is
// stored/echoed as-is, not recomputed here.
export function overallGate(score = 0) {
  const value = Number(score || 0);
  if (value >= 80) return "SHIP";
  if (value >= 55) return "FIX";
  return "BLOCK";
}

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

function normalizeItem(row = {}) {
  const hasNqs = row.nqs_score !== undefined && row.nqs_score !== null && row.nqs_score !== "";
  const evidenceSource = row.evidence_source || "";
  return {
    item_id: row.item_id || "",
    ref: Number(row.ref || 0),
    type: row.type || "positioning",
    phase: row.phase || "trace",
    sub_skill: row.sub_skill || "",
    title: row.title || "",
    draft: row.draft || "",
    reason: row.reason || "",
    nqs: hasNqs ? { score: Number(row.nqs_score || 0), gate: row.nqs_gate || "" } : null,
    evidence: evidenceSource
      ? { source: evidenceSource, stat: row.evidence_stat || "", url: row.evidence_url || "" }
      : null,
    risk: parseJsonList(row.risk),
    status: row.status || "needs_review",
    created_at: row.created_at || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
  };
}

function normalizeDriftAlert(row = {}) {
  return {
    alert_id: row.alert_id || "",
    channel_id: row.channel_id || "",
    title: row.title || "",
    offending_usage: row.offending_usage || "",
    guardrail_item_id: row.guardrail_item_id || "",
    canonical_guidance: row.canonical_guidance || "",
    status: row.status || "open",
    severity: row.severity || "medium",
    detected_at: row.detected_at || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
  };
}

export function buildSnapshot({ items = [], driftAlerts = [] } = {}) {
  const normalizedItems = items.map(normalizeItem);
  const normalizedDrift = driftAlerts.map(normalizeDriftAlert);

  const positioningItem = normalizedItems.find((entry) => entry.type === "positioning") || null;
  const canonical = normalizedItems.filter((entry) => entry.status === "approved");
  const pillars = normalizedItems.filter((entry) => entry.type === "message_pillar");
  const stories = normalizedItems.filter((entry) => entry.type === "story");
  const proofPoints = normalizedItems.filter((entry) => entry.type === "proof_point");
  // overall_nqs is the mean NQS across scored items (the same aggregation the
  // retired demo.ts performed for its metrics.overall_nqs).
  const scored = normalizedItems.filter((entry) => typeof entry.nqs?.score === "number");
  const overallNqs = scored.length
    ? Math.round(scored.reduce((sum, entry) => sum + Number(entry.nqs.score || 0), 0) / scored.length)
    : 0;

  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-brand",
    brand_name: "",
    framework: "TALE",
    positioning: {
      statement: positioningItem?.draft || "",
      status: positioningItem?.status || "needs_review",
      item_id: positioningItem?.item_id || "",
    },
    metrics: {
      item_count: normalizedItems.length,
      canonical_count: canonical.length,
      needs_review_count: normalizedItems.filter((entry) => entry.status === "needs_review").length,
      pillar_count: pillars.length,
      story_count: stories.length,
      proof_point_count: proofPoints.length,
      overall_nqs: overallNqs,
      drift_open_count: normalizedDrift.filter((entry) => entry.status === "open").length,
    },
    items: normalizedItems,
    drift_alerts: normalizedDrift,
    warnings: [],
  };
}
