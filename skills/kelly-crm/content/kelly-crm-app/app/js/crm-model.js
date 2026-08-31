// Pure domain logic for kelly-crm: turn normalized Busabase records (one array
// per Base, snake_case field keys) into the snapshot shape the UI renders, and
// turn a human verdict into the record write the provider needs to make.
//
// This replaces the old local-file-provider's in-memory snapshot: instead of a
// generated_at-stamped JSON blob compared against a separate decisions.json,
// every followup record carries its own live status/decision fields, so the
// snapshot built here is always the current truth — no staleness comparison.

export const PIPELINE_STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"];
export const DECISION_ACTIONS = ["approve", "request_changes", "block", "revise"];

const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

// One normalizer per Base, each exported so a page fetched later --
// "load more" appending to an already-normalized snapshot, not rebuilding it
// -- runs the exact same shape coercion the first page went through inside
// buildSnapshot below. A second, hand-copied normalizer for incremental pages
// is exactly how this kind of bug happens: it silently diverges the moment
// either one gains a field the other doesn't, and the failure mode is a type
// error deep in a render function for whichever row is unlucky enough to
// still carry a raw, un-normalized field (found for real: tags arrives as
// the JSON string "[]", not an array, until parseJsonList runs on it -- a
// page appended without going through this normalizer keeps that string).
export function normalizeCompanyRow(row) {
  return {
    company_id: row.company_id || "",
    name: row.name || "",
    domain: row.domain || "",
    industry: row.industry || "",
    size: row.size || "",
    location: row.location || "",
    notes: row.notes || "",
  };
}

export function normalizeContactRow(row) {
  return {
    contact_id: row.contact_id || "",
    name: row.name || "",
    company_id: row.company_id || "",
    role: row.role || "",
    email: row.email || "",
    relationship: row.relationship || "new",
    tags: parseJsonList(row.tags),
    last_touch_at: row.last_touch_at || "",
    next_followup_at: row.next_followup_at || "",
    agent_notes: row.agent_notes || "",
    channels: parseJsonList(row.channels),
  };
}

export function normalizeDealRow(row) {
  return {
    deal_id: row.deal_id || "",
    name: row.name || "",
    company_id: row.company_id || "",
    primary_contact_id: row.primary_contact_id || "",
    contact_ids: parseJsonList(row.contact_ids).length
      ? parseJsonList(row.contact_ids)
      : [row.primary_contact_id].filter(Boolean),
    stage: row.stage || "lead",
    amount: Number(row.amount || 0),
    currency: row.currency || "USD",
    probability: Number(row.probability || 0),
    next_step: row.next_step || "",
    owner: row.owner || "",
    opened_at: row.opened_at || "",
    expected_close: row.expected_close || "",
    last_activity_at: row.last_activity_at || "",
    status: row.status || "open",
    agent_next_action: row.agent_next_action || "",
    notes: row.notes || "",
  };
}

export function normalizeInteractionRow(row) {
  return {
    interaction_id: row.interaction_id || "",
    contact_id: row.contact_id || "",
    company_id: row.company_id || "",
    deal_id: row.deal_id || "",
    type: row.type || "note",
    occurred_at: row.occurred_at || "",
    direction: row.direction || "internal",
    summary: row.summary || "",
    source: row.source || "note",
  };
}

export function normalizeFollowupRow(row) {
  return {
    followup_id: row.followup_id || "",
    ref: Number(row.ref || 0),
    contact_id: row.contact_id || "",
    deal_id: row.deal_id || "",
    channel_id: row.channel_id || "",
    channel_type: row.channel_type || "email",
    subject: row.subject || "",
    reason: row.reason || "",
    risk: parseJsonList(row.risk),
    due_at: row.due_at || "",
    status: row.status || "needs_review",
    suggested_reply: row.suggested_reply || "",
    decision_comment: row.decision_comment || "",
    decided_at: row.decided_at || "",
    decided_by: row.decided_by || "",
    created_at: row.created_at || "",
  };
}

// Dispatches by the same Base key the provider and app.js's pagination state
// already use, so a page fetched by key alone -- "load more" doesn't know or
// care which fields a Base has -- normalizes correctly without a switch
// statement at every call site.
export const NORMALIZE_ROW_BY_KEY = {
  companies: normalizeCompanyRow,
  contacts: normalizeContactRow,
  deals: normalizeDealRow,
  interactions: normalizeInteractionRow,
  followups: normalizeFollowupRow,
};

export function buildSnapshot({ companies = [], contacts = [], deals = [], interactions = [], followups = [] } = {}) {
  const normalizedCompanies = companies.map(normalizeCompanyRow);
  const normalizedContacts = contacts.map(normalizeContactRow);
  const normalizedDeals = deals.map(normalizeDealRow);
  const normalizedInteractions = interactions.map(normalizeInteractionRow);
  const normalizedFollowups = followups.map(normalizeFollowupRow);

  const openDeals = normalizedDeals.filter((item) => item.status === "open");
  const metrics = {
    contact_count: normalizedContacts.length,
    company_count: normalizedCompanies.length,
    deal_count: normalizedDeals.length,
    open_deal_count: openDeals.length,
    pipeline_value: openDeals.reduce((sum, item) => sum + item.amount, 0),
    weighted_pipeline_value: Math.round(openDeals.reduce((sum, item) => sum + item.amount * item.probability, 0)),
    followups_needs_review: normalizedFollowups.filter((item) => item.status === "needs_review").length,
    followups_due: normalizedFollowups.filter((item) =>
      ["needs_review", "changes_requested", "approved"].includes(item.status),
    ).length,
  };

  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "busabase",
    base_currency: "USD",
    pipeline_stages: PIPELINE_STAGES,
    metrics,
    companies: normalizedCompanies,
    contacts: normalizedContacts,
    deals: normalizedDeals,
    interactions: normalizedInteractions,
    followups: normalizedFollowups,
    warnings: [],
  };
}

// Synthesizes the followups[].decision_* fields into the {followup_id: {action,
// comment, decided_at}} shape the UI's decisionFor()/queue-decision badge use,
// so a human verdict already written back to the record still renders the same
// way it did when decisions lived in a separate decisions.json.
export function decisionsFromSnapshot(snapshot) {
  const decisions = {};
  for (const followup of snapshot?.followups || []) {
    const action = Object.entries(DECISION_STATUS).find(([, status]) => status === followup.status)?.[0];
    if (!action || !followup.decided_at) continue;
    decisions[followup.followup_id] = {
      action,
      comment: followup.decision_comment || "",
      draft: followup.suggested_reply || "",
      decided_at: followup.decided_at,
    };
  }
  return { updated_at: snapshot?.generated_at || "", decisions };
}

export function statusForAction(action) {
  return DECISION_STATUS[action] || null;
}
