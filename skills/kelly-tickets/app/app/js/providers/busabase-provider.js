import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";
import {
  INTAKE_DECISION_ACTIONS,
  PROPOSAL_DECISION_ACTIONS,
  buildConfigSummary,
  buildSnapshot,
  statusForProposalVerdict,
  triageStateForIntakeVerdict,
} from "../tickets-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

export const isStandaloneLocalRuntime = () => {
  const host = window.location.hostname;
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".localhost");
  const busabaseHosted = window.self !== window.top || window.location.pathname.startsWith("/api/airapp-preview/");
  return loopback && !busabaseHosted;
};

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";

async function ensureResources() {
  runtimeClient = runtimeClient || createRuntimeClient();
  if (!allowedReads.has("nodes.list") || !allowedReads.has("nodes.get")) {
    throw new Error("PROCEDURE_DENIED: nodes.list/nodes.get");
  }
  let resources = await inspectProvisionedResources(runtimeClient, appConfig);
  if (resources.folder && resources.missing.length === 0 && resources.repairs.length) {
    if (!allowedReads.has("bases.get") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: bases.get/nodes.updateMetadata");
    }
    resources = await provisionDeclaredResources(runtimeClient, appConfig);
  }
  if (!resources.folder || resources.missing.length) {
    if (pendingSetupError) throw new Error(pendingSetupError);
    const names = resources.missing.map((base) => base.name).join(", ");
    throw new Error(`SETUP_REQUIRED: ${names || appConfig.folder.name}`);
  }
  pendingSetupError = "";
  runtimeBases = new Map(resources.bases.map((base) => [base.key, base]));
  return resources;
}

function base(key) {
  const declared = runtimeBases.get(key);
  if (!declared) throw new Error(`SETUP_REQUIRED: ${key}`);
  return declared;
}

async function readAllRecords(key, { maxPages = 20 } = {}) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const rows = [];
  let cursor;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await runtimeClient.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  try {
    return await runtimeClient.records.get({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

async function upsert(key, idFieldSlug, idValue, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest") || !allowedWrites.has("records.changeRequest")) {
    throw new Error("PROCEDURE_DENIED: records.changeRequest");
  }
  const declared = base(key);
  const existing = await findRecord(key, idFieldSlug, idValue);
  const normalized = toBusabaseFields(fields);
  const autoMerge = isStandaloneLocalRuntime();
  if (!existing) {
    return runtimeClient.bases.createChangeRequest({
      baseId: declared.baseId,
      fields: normalized,
      message,
      submittedBy: appConfig.appId,
      autoMerge,
    });
  }
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: normalized,
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
    autoMerge,
  });
}

async function readSettingsRow() {
  const rows = await readAllRecords("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

// Only known field slugs are ever written back for a decision — never spread
// a raw row (it also carries __recordId/__headCommitId bookkeeping keys that
// must not be sent as Busabase fields).
function baseProposalFields(row) {
  return {
    proposal_id: row.proposal_id,
    ref: row.ref,
    ticket_id: row.ticket_id,
    title: row.title,
    summary: row.summary || "",
    proposed_crew_id: row.proposed_crew_id || "",
    proposed_assignee: row.proposed_assignee || "",
    priority: row.priority || "P3",
    sla_due_at: row.sla_due_at || "",
    sla_hours: row.sla_hours,
    reason: row.reason || "",
    note_to_crew: row.note_to_crew || "",
    status: row.status,
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decision_draft: row.decision_draft || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_operations: row.execution_operations || "",
    execution_detail: row.execution_detail || "",
    executed_at: row.executed_at || "",
    created_at: row.created_at || "",
  };
}

function baseIntakeFields(row) {
  return {
    intake_id: row.intake_id,
    channel: row.channel,
    external_id: row.external_id || "",
    content_hash: row.content_hash || "",
    reporter: row.reporter || "",
    contact_masked: row.contact_masked || "",
    unit: row.unit || "",
    location: row.location || "",
    text: row.text || "",
    received_at: row.received_at || "",
    urgency_guess: row.urgency_guess || "normal",
    category_guess: row.category_guess || "other",
    triage_state: row.triage_state,
    ticket_id: row.ticket_id || "",
    attachments_note: row.attachments_note || "",
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decision_fields: row.decision_fields || "",
    decided_at: row.decided_at || "",
  };
}

function baseTicketFields(row) {
  return {
    ticket_id: row.ticket_id,
    title: row.title,
    category: row.category,
    urgency: row.urgency,
    unit: row.unit || "",
    location: row.location || "",
    reporter: row.reporter || "",
    contact_masked: row.contact_masked || "",
    status: row.status,
    crew_id: row.crew_id || "",
    assignee: row.assignee || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    resolved_at: row.resolved_at || "",
    sla_due_at: row.sla_due_at || "",
    intake_ids: row.intake_ids || "",
    resolution_note: row.resolution_note || "",
    history: row.history || "",
  };
}

function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [intake, tickets, proposals, crews, sync_log, settings] = await Promise.all([
      readAllRecords("intake"),
      readAllRecords("tickets"),
      readAllRecords("proposals"),
      readAllRecords("crews"),
      readAllRecords("sync_log"),
      readSettingsRow(),
    ]);
    const snapshot = buildSnapshot({ intake, tickets, proposals, crews, sync_log, settings });
    const config_summary = buildConfigSummary({ settings, crews });
    return {
      app: "kelly-tickets",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: intake.length > 0 || tickets.length > 0, config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
    };
  },

  // Human verdict on a dispatch proposal, written directly onto the proposal
  // record. Ported from the retired local-file DataProvider's applyDecision()
  // + mergeSnapshot(): "revise" only edits note_to_crew (the draft), every
  // other action moves the workflow status per statusForProposalVerdict()'s
  // table.
  async decideProposal({ proposal_id, action, note = "", draft } = {}) {
    if (!proposal_id || typeof proposal_id !== "string") throw new Error("proposal_id is required");
    if (!action || !PROPOSAL_DECISION_ACTIONS.has(action)) {
      throw new Error(`action must be one of: ${[...PROPOSAL_DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("proposals", "proposal-id", proposal_id);
    if (!existing) throw new Error(`Unknown dispatch proposal: ${proposal_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...baseProposalFields(current),
      proposal_id,
      status: statusForProposalVerdict(action, current.status || "needs_review"),
      note_to_crew: typeof draft === "string" ? draft : current.note_to_crew || "",
      decision_action: action,
      decision_note: String(note || ""),
      decision_draft: typeof draft === "string" ? draft : "",
      decided_at: now,
    };
    await upsert("proposals", "proposal-id", proposal_id, fields, `Decision on dispatch ${proposal_id}: ${action}`);
    return { ok: true };
  },

  // Human verdict on an intake item (convert to ticket / ignore), written
  // directly onto the intake record. Ported from the retired mergeSnapshot():
  // only "ignore" changes triage_state; "convert_to_ticket" leaves it as-is
  // and the agent's scripts/apply_triage.mjs picks up the decision fields to
  // classify and create the ticket (the Busabase-only equivalent of the
  // retired agent_tasks.json "convert_intake" queue).
  async decideIntake({ intake_id, action, note = "", fields: decisionFields } = {}) {
    if (!intake_id || typeof intake_id !== "string") throw new Error("intake_id is required");
    if (!action || !INTAKE_DECISION_ACTIONS.has(action)) {
      throw new Error(`action must be one of: ${[...INTAKE_DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("intake", "intake-id", intake_id);
    if (!existing) throw new Error(`Unknown intake item: ${intake_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...baseIntakeFields(current),
      intake_id,
      triage_state: triageStateForIntakeVerdict(action, current.triage_state || "new"),
      decision_action: action,
      decision_note: String(note || ""),
      decision_fields: decisionFields && typeof decisionFields === "object" ? JSON.stringify(decisionFields) : "",
      decided_at: now,
    };
    await upsert("intake", "intake-id", intake_id, fields, `Decision on intake ${intake_id}: ${action}`);
    return { ok: true };
  },

  // Ticket-detail "Save note" action: writes the resolution note directly and
  // appends a history event. Ported from the retired mergeSnapshot()'s ticket
  // branch, which only ever set resolution_note on a "revise" decision.
  async reviseTicket({ ticket_id, note = "" } = {}) {
    if (!ticket_id || typeof ticket_id !== "string") throw new Error("ticket_id is required");
    await ensureResources();
    const existing = await findRecord("tickets", "ticket-id", ticket_id);
    if (!existing) throw new Error(`Unknown ticket: ${ticket_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const history = parseJsonValue(current.history, []) || [];
    history.push({ event: "resolution_note", actor: "operator", at: now, note: String(note || "") });
    const fields = {
      ...baseTicketFields(current),
      ticket_id,
      resolution_note: String(note || ""),
      updated_at: now,
      history: JSON.stringify(history),
    };
    await upsert("tickets", "ticket-id", ticket_id, fields, `Resolution note saved on ${ticket_id}`);
    return { ok: true };
  },

  async provisionResources() {
    if (!allowedSetup.has("nodes.createChangeRequest") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: nodes.createChangeRequest/nodes.updateMetadata");
    }
    const client = runtimeClient || createRuntimeClient();
    try {
      return await provisionDeclaredResources(client, appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) {
        pendingSetupError = String(error.message);
      }
      throw error;
    }
  },
};
