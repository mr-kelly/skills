// Pure domain logic for kelly-creators: turn normalized Busabase records into
// the creator-engagement snapshot shape the UI renders — the pipeline funnel,
// budget/reach rollups, the C³ ACE fit breakdown, and the content-reviewer
// quality gate. A "creator" row is either an `item_type: "engagement"` (a
// creator candidate/engagement) or an `item_type: "quality_gate"` (a
// pre-publication SHIP/FIX/BLOCK check on a live creator's draft post) — the
// same shape, per references/creators-schema.md.
//
// Ported verbatim (same variable names, same order of operations) from the
// retired app/server/demo.ts's creator()/demoSnapshot() aggregation and
// app/app.js's effectiveStatus()/DECISION_STATUS, the two places the
// original local-file skill computed these rollups.

export const PIPELINE_STAGES = ["discovery", "outreach", "negotiating", "live", "measured"];

export const DECISION_ACTIONS = ["approve", "request_changes", "block", "revise"];

const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};

export function statusForAction(action = "") {
  return DECISION_STATUS[action] || null;
}

// Aaron's four phases map onto the pipeline stages (STAGE_PHASE in the
// retired app/server/demo.ts).
const STAGE_PHASE = {
  discovery: "discover",
  outreach: "activate",
  negotiating: "plan",
  live: "activate",
  measured: "measure",
};

export function phaseForStage(stage = "discovery") {
  return STAGE_PHASE[stage] || "discover";
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

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Same cpm formula as the retired demo.ts's creator() helper.
function computeCpm(followers = 0, est_rate = 0) {
  return followers ? Math.round((est_rate / followers) * 1000 * 100) / 100 : 0;
}

// Same ROI formula as the retired creator-views.js renderRoi() inline calc;
// returns a number (or null when spend is 0) so the view formats it.
export function calcRoi(spend = 0, est_value = 0) {
  return spend > 0 ? (Number(est_value || 0) / Number(spend || 0) - 1) * 100 : null;
}

function normalizeCreator(row = {}) {
  const stage = row.stage || "discovery";
  const followers = Number(row.followers || 0);
  const est_rate = Number(row.est_rate || 0);
  return {
    item_type: row.item_type || "engagement",
    creator_id: row.creator_id || "",
    ref: Number(row.ref || 0),
    handle: row.handle || "",
    name: row.name || "",
    platform: row.platform || "",
    niche: row.niche || "",
    followers,
    engagement_rate: Number(row.engagement_rate || 0),
    fit_score: Number(row.fit_score || 0),
    fit_breakdown: parseJsonObject(row.fit_breakdown),
    stage,
    phase: phaseForStage(stage),
    status: row.status || "needs_review",
    proposed_action: row.proposed_action || "no_action",
    est_rate,
    risk: parseJsonList(row.risk),
    channel: row.channel || "",
    reason: row.reason || "",
    audience_note: row.audience_note || "",
    suggested_reply: row.suggested_reply || "",
    est_value: Number(row.est_value || 0),
    spend: Number(row.spend || 0),
    cpm: computeCpm(followers, est_rate),
    gate_verdict: row.gate_verdict || "",
    gate_checks: parseJsonList(row.gate_checks),
    created_at: row.created_at || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
  };
}

// Same metrics aggregation as the retired demo.ts's demoSnapshot(): the
// needs_review/approved/done/blocked counts run over every row (engagements
// AND quality-gate items both carry a workflow `status`); creator_count,
// total_reach, budget_allocated, and est_value are engagement-only (quality
// gates are informational and excluded from those rollups per
// references/creators-schema.md).
export function buildSnapshot({ creators = [] } = {}) {
  const normalized = creators.map(normalizeCreator);
  const doneStatuses = new Set(["approved", "done", "live"]);
  const engagements = normalized.filter((item) => item.item_type !== "quality_gate");

  const metrics = {
    creator_count: engagements.length,
    needs_review: normalized.filter((item) => item.status === "needs_review").length,
    approved: normalized.filter((item) => item.status === "approved").length,
    done: normalized.filter((item) => item.status === "done").length,
    blocked: normalized.filter((item) => item.status === "blocked").length,
    total_reach: engagements
      .filter((item) => item.status !== "blocked")
      .reduce((sum, item) => sum + Number(item.followers || 0), 0),
    budget_total: 0,
    budget_allocated: engagements
      .filter((item) => doneStatuses.has(item.status))
      .reduce((sum, item) => sum + Number(item.est_rate || 0), 0),
    est_value: engagements.reduce((sum, item) => sum + Number(item.est_value || 0), 0),
  };

  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-creators",
    base_currency: "USD",
    pipeline_stages: PIPELINE_STAGES,
    metrics,
    creators: normalized,
    warnings: [],
  };
}
