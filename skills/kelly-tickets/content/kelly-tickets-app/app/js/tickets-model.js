// Pure domain logic for kelly-tickets, ported verbatim (same variable names,
// same order of operations, only TS types stripped) from the retired
// lib/common.ts's computeSlaState/computeMetrics/maskContact/slaHoursFor and
// lib/data-provider/local-file-provider.ts's mergeSnapshot() status-transition
// rules. The write target moved from a single app/.data/tickets_snapshot.json
// file to six Busabase Bases (crews/intake/tickets/proposals/sync_log/
// settings) read fresh on every getState(), so buildSnapshot() below takes
// those rows directly instead of mutating a persisted snapshot object; crew
// open-ticket load is computed at read time from tickets(), exactly like the
// retired app/js/ticket-views.js's crewLoadPanel() already did, instead of
// being persisted on the crew record.

// ---- SLA / metrics / masking, ported verbatim from the retired lib/common.ts ----

const OPEN_TICKET_STATUSES = new Set(["open", "assigned", "in_progress", "waiting"]);

export function computeSlaState(ticket = {}, nowIso = "") {
  if (ticket.status === "resolved") {
    if (!ticket.sla_due_at) return "met";
    return ticket.resolved_at && ticket.resolved_at > ticket.sla_due_at ? "breached" : "met";
  }
  if (!ticket.sla_due_at) return "ok";
  const now = Date.parse(nowIso || new Date().toISOString());
  const due = Date.parse(ticket.sla_due_at);
  const created = Date.parse(ticket.created_at || nowIso);
  if (Number.isNaN(due)) return "ok";
  if (now >= due) return "breached";
  const total = due - created;
  if (total > 0 && (due - now) / total <= 0.25) return "at_risk";
  return "ok";
}

export function computeMetrics(snapshot = {}) {
  const intake = snapshot.intake || [];
  const tickets = snapshot.tickets || [];
  const proposals = snapshot.dispatch_proposals || [];
  const resolved = tickets.filter((ticket) => ticket.status === "resolved");
  const resolutionHours = resolved
    .filter((ticket) => ticket.created_at && ticket.resolved_at)
    .map((ticket) => (Date.parse(ticket.resolved_at) - Date.parse(ticket.created_at)) / 3600000)
    .filter((hours) => Number.isFinite(hours) && hours >= 0);
  const byChannel = {};
  for (const item of intake) {
    byChannel[item.channel] = (byChannel[item.channel] || 0) + 1;
  }
  return {
    intake_count: intake.length,
    unclassified_intake: intake.filter((item) => item.triage_state === "new").length,
    ticket_count: tickets.length,
    open_tickets: tickets.filter((ticket) => OPEN_TICKET_STATUSES.has(ticket.status)).length,
    resolved_tickets: resolved.length,
    avg_resolution_hours: resolutionHours.length
      ? Math.round((resolutionHours.reduce((sum, hours) => sum + hours, 0) / resolutionHours.length) * 10) / 10
      : 0,
    sla_at_risk: tickets.filter(
      (ticket) => OPEN_TICKET_STATUSES.has(ticket.status) && ["at_risk", "breached"].includes(ticket.sla_state),
    ).length,
    proposal_count: proposals.length,
    needs_review: proposals.filter((proposal) => proposal.status === "needs_review").length,
    intake_by_channel: byChannel,
  };
}

export function maskContact(value = "") {
  return String(value || "").replace(
    /\d{5,}/g,
    (run) => `${run.slice(0, 3)}${"*".repeat(Math.max(run.length - 5, 2))}${run.slice(-2)}`,
  );
}

// settings is the live Settings row (already parsed: sla_rules is an array).
export function slaHoursFor(settings = {}, category = "", urgency = "") {
  const rules = Array.isArray(settings?.sla_rules) ? settings.sla_rules : [];
  const exact = rules.find((rule) => rule.category === category && rule.urgency === urgency);
  if (exact) return Number(exact.hours) || 0;
  const wildcard = rules.find((rule) => rule.category === "*" && rule.urgency === urgency);
  if (wildcard) return Number(wildcard.hours) || 0;
  return Number(settings?.sla_default_hours) || 72;
}

// ---- Decision/status transitions, ported verbatim from the retired
// lib/data-provider/local-file-provider.ts's mergeSnapshot() rules ----

export const PROPOSAL_DECISION_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);
export const INTAKE_DECISION_ACTIONS = new Set(["convert_to_ticket", "ignore"]);

export function statusForProposalVerdict(action, currentStatus = "needs_review") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return currentStatus; // "revise" only edits note_to_crew/draft, status is unchanged
}

export function triageStateForIntakeVerdict(action, currentTriageState = "new") {
  if (action === "ignore") return "ignored";
  return currentTriageState; // "convert_to_ticket" leaves triage_state; apply_triage.mjs creates the ticket
}

// ---- Normalization: Busabase rows (already snake_cased by the provider) -> item shapes ----

function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeCrewRow({
  crew_id = "",
  name = "",
  skills = "",
  members = "",
  contact_env = "",
  active = "true",
} = {}) {
  return {
    crew_id,
    name: name || crew_id,
    skills: parseJsonValue(skills, []) || [],
    members,
    contact_env,
    active: active !== "false",
  };
}

export function normalizeIntakeRow({
  intake_id = "",
  channel = "",
  external_id = "",
  content_hash = "",
  reporter = "",
  contact_masked = "",
  unit = "",
  location = "",
  text = "",
  received_at = "",
  urgency_guess = "normal",
  category_guess = "other",
  triage_state = "new",
  ticket_id = "",
  attachments_note = "",
  decision_action = "",
  decision_note = "",
  decision_fields = "",
  decided_at = "",
} = {}) {
  return {
    id: intake_id,
    channel,
    external_id,
    content_hash,
    reporter,
    contact_masked,
    unit,
    location,
    text,
    received_at,
    urgency_guess,
    category_guess,
    triage_state,
    ticket_id,
    attachments_note,
    decision: decision_action
      ? {
          action: decision_action,
          note: decision_note,
          fields: parseJsonValue(decision_fields, null),
          decided_at,
        }
      : null,
  };
}

export function normalizeTicketRow({
  ticket_id = "",
  title = "",
  category = "other",
  urgency = "normal",
  unit = "",
  location = "",
  reporter = "",
  contact_masked = "",
  status = "open",
  crew_id = "",
  assignee = "",
  created_at = "",
  updated_at = "",
  resolved_at = "",
  sla_due_at = "",
  intake_ids = "",
  resolution_note = "",
  history = "",
} = {}) {
  return {
    id: ticket_id,
    title: title || "(untitled ticket)",
    category,
    urgency,
    unit,
    location,
    reporter,
    contact_masked,
    status,
    crew_id,
    assignee,
    created_at,
    updated_at,
    resolved_at,
    sla_due_at,
    sla_state: "ok",
    intake_ids: parseJsonValue(intake_ids, []) || [],
    resolution_note,
    history: parseJsonValue(history, []) || [],
  };
}

export function normalizeProposalRow({
  proposal_id = "",
  ref = 0,
  ticket_id = "",
  title = "",
  summary = "",
  proposed_crew_id = "",
  proposed_assignee = "",
  priority = "P3",
  sla_due_at = "",
  sla_hours = 0,
  reason = "",
  note_to_crew = "",
  status = "needs_review",
  decision_action = "",
  decision_note = "",
  decision_draft = "",
  decided_at = "",
  execution_status = "",
  execution_operations = "",
  execution_detail = "",
  executed_at = "",
  created_at = "",
} = {}) {
  return {
    id: proposal_id,
    ref: Number(ref) || 0,
    ticket_id,
    title: title || "(untitled dispatch)",
    summary,
    proposed_crew_id,
    proposed_assignee,
    priority,
    sla_due_at,
    sla_hours: Number(sla_hours) || 0,
    reason,
    note_to_crew,
    status,
    decision: decision_action
      ? { action: decision_action, note: decision_note, draft: decision_draft || null, decided_at }
      : null,
    execution: execution_status
      ? {
          status: execution_status,
          operations: parseJsonValue(execution_operations, []) || [],
          detail: execution_detail,
          executed_at,
        }
      : null,
    created_at,
  };
}

export function normalizeSyncLogRow({ log_id = "", at = "", source = "", action = "", detail = "", count = 0 } = {}) {
  return { id: log_id, at, source, action, detail, count: Number(count) || 0 };
}

// ---- Snapshot assembly: new orchestration (not a port), since the retired
// app/server/hono.ts read one persisted snapshot file instead of six live
// Bases. Crew load is computed here exactly like the retired
// app/js/ticket-views.js's crewLoadPanel() computed it client-side. ----

/**
 * @param {{
 *   intake?: Array<Record<string, any>>,
 *   tickets?: Array<Record<string, any>>,
 *   proposals?: Array<Record<string, any>>,
 *   crews?: Array<Record<string, any>>,
 *   sync_log?: Array<Record<string, any>>,
 *   settings?: Record<string, any>,
 *   now?: string,
 * }} [args]
 */
export function buildSnapshot({
  intake = [],
  tickets = [],
  proposals = [],
  crews = [],
  sync_log = [],
  settings = {},
  now = new Date().toISOString(),
} = {}) {
  const normalizedTickets = tickets.map(normalizeTicketRow);
  for (const ticket of normalizedTickets) {
    ticket.sla_state = computeSlaState(ticket, now);
  }
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-tickets",
    property: { name: settings.property_name || "", buildings: Number(settings.buildings) || 0 },
    range: { start: "", end: "" },
    metrics: {},
    intake: intake.map(normalizeIntakeRow),
    tickets: normalizedTickets,
    dispatch_proposals: proposals.map(normalizeProposalRow),
    crews: crews.map(normalizeCrewRow),
    sync_log: sync_log.map(normalizeSyncLogRow).sort((a, b) => String(a.at).localeCompare(String(b.at))),
    warnings:
      !intake.length && !tickets.length
        ? [
            {
              id: "no-snapshot",
              severity: "info",
              message: "No tickets snapshot yet. Ingest intake payloads, then run triage.",
            },
          ]
        : [],
  };
  snapshot.metrics = computeMetrics(snapshot);
  return snapshot;
}

// Sanitized config summary for #/settings — no separate config store in the
// Busabase-only shape, so this reads straight off the live Settings row and
// the live Crews Base. Unlike the retired summarizeConfig(), it cannot check
// whether a crew's contact_env is actually set in the agent's environment —
// the browser has no access to that process's env vars — so it surfaces the
// env var name only, not a readiness boolean.
/**
 * @param {{ settings?: Record<string, any>, crews?: Array<Record<string, any>> }} [args]
 */
export function buildConfigSummary({ settings = {}, crews = [] } = {}) {
  return {
    config_path: "busabase",
    is_example: false,
    property: {
      name: settings.property_name || "",
      buildings: Number(settings.buildings) || 0,
      timezone: settings.timezone || "",
    },
    channels: parseJsonValue(settings.channels, []) || [],
    categories: parseJsonValue(settings.categories, []) || [],
    crews: crews.map(normalizeCrewRow).map((crew) => ({
      crew_id: crew.crew_id,
      name: crew.name,
      skills: crew.skills,
      contact_env: crew.contact_env,
    })),
    sla_rules: parseJsonValue(settings.sla_rules, []) || [],
    sla_default_hours: Number(settings.sla_default_hours) || 72,
  };
}
