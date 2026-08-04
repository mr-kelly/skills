// Pure domain logic for kelly-launch: turn normalized Busabase records into
// the launch snapshot shape the UI renders, including the RAMP
// launch-readiness gate (LQS + SHIP/FIX/BLOCK verdict).

export const PHASES = ["research", "assemble", "mobilize", "prove"];

export const DECISION_ACTIONS = ["approve", "request_changes", "block", "revise"];

const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};

export function statusForAction(action) {
  return DECISION_STATUS[action] || null;
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

function countByPhase(items) {
  return PHASES.map((phase) => {
    const inPhase = items.filter((entry) => entry.phase === phase);
    const done = inPhase.filter((entry) => entry.status === "done").length;
    return { phase, total: inPhase.length, done };
  });
}

function countByReadiness(items) {
  return {
    ship: items.filter((entry) => entry.readiness === "SHIP").length,
    fix: items.filter((entry) => entry.readiness === "FIX").length,
    block: items.filter((entry) => entry.readiness === "BLOCK").length,
  };
}

function countByStatus(items) {
  return {
    needs_review: items.filter((entry) => entry.status === "needs_review").length,
    approved: items.filter((entry) => entry.status === "approved").length,
    done: items.filter((entry) => entry.status === "done").length,
    blocked: items.filter((entry) => entry.status === "blocked").length,
  };
}

export function buildSnapshot({ items = [], channels = [], runbook = [] } = {}) {
  const normalizedItems = items.map((row) => ({
    item_id: row.item_id || "",
    ref: Number(row.ref || 0),
    phase: row.phase || "research",
    title: row.title || "",
    owner: row.owner || "",
    channel_id: row.channel_id || "",
    readiness: row.readiness || "FIX",
    proposed_action: row.proposed_action || "no_action",
    status: row.status || "needs_review",
    draft: row.draft || "",
    suggested_reply: row.draft || "",
    reason: row.reason || "",
    format: row.format || "",
    risk: parseJsonList(row.risk),
    created_at: row.created_at || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
  }));

  const normalizedChannels = channels.map((row) => ({
    channel_id: row.channel_id || "",
    type: row.type || "",
    display_name: row.display_name || "",
    submission_status: row.submission_status || "queued",
  }));

  const normalizedRunbook = runbook
    .map((row) => ({
      step_id: row.step_id || "",
      offset: row.offset || "",
      at: row.at || "",
      title: row.title || "",
      owner: row.owner || "",
      note: row.note || "",
    }))
    .sort((a, b) => a.step_id.localeCompare(b.step_id));

  const shipCounts = countByReadiness(normalizedItems);
  const statusCounts = countByStatus(normalizedItems);
  const blockers = normalizedItems
    .filter((entry) => entry.readiness === "BLOCK" || (entry.readiness === "FIX" && entry.status === "blocked"))
    .map((entry) => ({ item_id: entry.item_id, ref: entry.ref, title: entry.title, phase: entry.phase }));
  const verdict = shipCounts.block ? "BLOCK" : blockers.length ? "FIX" : "SHIP";
  // LQS (Launch Quality Score): SHIP items count full, FIX items half, BLOCK items zero.
  const lqs = normalizedItems.length
    ? Math.round(((shipCounts.ship + shipCounts.fix * 0.5) / normalizedItems.length) * 100)
    : 0;

  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-launch",
    product: { name: "", tagline: "", homepage: "", category: "" },
    launch: { target_date: "", timezone: "" },
    phases: PHASES,
    readiness: { verdict, lqs, ship: shipCounts.ship, fix: shipCounts.fix, block: shipCounts.block, blockers },
    metrics: {
      item_count: normalizedItems.length,
      needs_review: statusCounts.needs_review,
      approved: statusCounts.approved,
      done: statusCounts.done,
      blocked: statusCounts.blocked,
      ship: shipCounts.ship,
      fix: shipCounts.fix,
      block: shipCounts.block,
    },
    phase_progress: countByPhase(normalizedItems),
    channels: normalizedChannels,
    items: normalizedItems,
    runbook: normalizedRunbook,
    warnings: [],
  };
}
