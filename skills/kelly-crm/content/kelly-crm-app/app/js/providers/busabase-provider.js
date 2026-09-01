import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildSnapshot, decisionsFromSnapshot, statusForAction } from "../crm-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

// A deployed AirApp is served through the ambient Busabase session (a Busabase
// iframe/preview host, or same-origin proxy under /api/airapp-preview/); a
// standalone local preview runs on loopback outside that host. Human verdicts
// made from a standalone local preview (the trusted operator's own machine)
// merge immediately; verdicts made from the deployed AirApp create a pending
// ChangeRequest for the trusted process to merge, per the AirApp boundary.
// Only a standalone run may merge its own writes; a deployed AirApp is inside
// the Busabase review boundary. Too consequential to infer from the URL.
import { isStandaloneLocalRuntime } from "../runtime.js";

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
    const names = resources.missing.map((base) => base.name).join("、");
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

// One page per call, cursor returned to the caller -- never several pages in
// one function call. A capped loop here (however high the cap) still hides a
// multi-page scan behind a single loading state instead of fetching a page
// per user action; the cap only bounds how bad that gets, it doesn't fix the
// shape. Base-level lists (contacts, deals) surface the returned nextCursor
// through a numbered pager in the UI (see app.js#goToPage); the others
// (companies, interactions, followups, settings) are read once on boot --
// companies and interactions are supporting/lookup data rather than their
// own browsed list, and followups is a review queue that drains via
// decisions rather than growing the way a contact or deal list does. If any
// of those three genuinely outgrows one page in practice, it needs the same
// pager treatment contacts/deals already got, not a bigger cap.
async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: declared.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  const rows = records.map((record) => ({
    ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: Array.isArray(result) ? null : result.nextCursor || null };
}

async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  const declared = base(key);
  try {
    const { total } = await runtimeClient.records.count({
      baseId: declared.baseId,
      ...(filters ? { filters } : {}),
    });
    return total;
  } catch {
    return null;
  }
}

// A real, exact server-side count of open deals -- records.count's `filters`
// push down to SQL, so this costs the same as the unfiltered total. Needed
// because open_deal_count used to be `deals().filter(...).length`, which was
// only ever correct while every deal was loaded in memory; once deals()
// holds one page at a time (see readPage/goToPage) that count silently
// shrinks to "however many open deals happen to be on the current page".
function countOpenDeals() {
  return countRecords("deals", [{ fieldSlug: "status", fieldType: "text", operator: "equals", value: "open" }]);
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

async function readSettingsRows() {
  const { rows } = await readPage("settings");
  return new Map(rows.map((row) => [row.record_id || row.kind, row]));
}

function parsePayload(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function configSummary(operatorPayload, channelsPayload) {
  const channels = Array.isArray(channelsPayload.channels) ? channelsPayload.channels : [];
  return {
    config_path: "busabase:base/kelly-crm-settings",
    is_example: false,
    operator: {
      name: operatorPayload.name || "",
      role: operatorPayload.role || "",
      company: operatorPayload.company || "",
      timezone: operatorPayload.timezone || "",
    },
    pipeline_stages: Array.isArray(operatorPayload.pipeline_stages) ? operatorPayload.pipeline_stages : undefined,
    base_currency: operatorPayload.base_currency || "USD",
    style_tone: operatorPayload.style_tone || "",
    channels: channels.map((channel) => ({
      channel_id: channel.channel_id || "",
      type: channel.type || "",
      display_name: channel.display_name || channel.channel_id || "",
      handoff_skill: channel.handoff_skill || "",
      secrets_ready: Boolean(channel.vault_ref),
    })),
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [
      companiesPage,
      contactsPage,
      dealsPage,
      interactionsPage,
      followupsPage,
      settings,
      companyCount,
      contactCount,
      dealCount,
      openDealCount,
    ] = await Promise.all([
      readPage("companies"),
      readPage("contacts"),
      readPage("deals"),
      readPage("interactions"),
      readPage("followups"),
      readSettingsRows(),
      countRecords("companies"),
      countRecords("contacts"),
      countRecords("deals"),
      countOpenDeals(),
    ]);
    const snapshot = buildSnapshot({
      companies: companiesPage.rows,
      contacts: contactsPage.rows,
      deals: dealsPage.rows,
      interactions: interactionsPage.rows,
      followups: followupsPage.rows,
    });
    // buildSnapshot only ever sees the first loaded page, so its own
    // companyCount/contactCount (page.length) undercounts once there is more
    // than one page. Overwrite with the real total from records.count; a null
    // (permission denied, or the call failed) falls back to what's loaded
    // rather than showing nothing.
    if (companyCount !== null) snapshot.metrics.company_count = companyCount;
    if (contactCount !== null) snapshot.metrics.contact_count = contactCount;
    if (dealCount !== null) snapshot.metrics.deal_count = dealCount;
    // open_deal_count is a real filtered total (see countOpenDeals), so it stays
    // correct no matter which page of deals is currently loaded. pipeline_value
    // and weighted_pipeline_value are sums, not counts -- records.count has no
    // sum-by-field equivalent, so those two stay derived from whichever page of
    // deals is actually loaded (see app.js#metricCards) until a real aggregate
    // endpoint exists.
    if (openDealCount !== null) snapshot.metrics.open_deal_count = openDealCount;
    const operatorRow = settings.get("kelly-crm-operator") || {};
    const channelsRow = settings.get("kelly-crm-channels") || {};
    const lockRow = settings.get("kelly-crm-lock") || {};
    const operatorPayload = parsePayload(operatorRow.payload);
    const channelsPayload = parsePayload(channelsRow.payload);
    const summary = configSummary(operatorPayload, channelsPayload);
    if (summary.pipeline_stages === undefined) summary.pipeline_stages = snapshot.pipeline_stages;
    return {
      app: "kelly-crm",
      data_provider: "busabase",
      onboarding: { completed: Boolean(operatorRow.record_id), config_version: "1" },
      lock: lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null,
      config_summary: summary,
      decisions: decisionsFromSnapshot(snapshot),
      agent_tasks: { updated_at: "", tasks: [] },
      execution_report: null,
      snapshot,
      // Seeds app.js's page-cursor cache: the cursor needed to fetch page 2 of
      // each Base that has its own browsed list view (page 1 was just fetched
      // above). Companies/interactions/followups/settings are read once; see
      // the comment on readPage for why.
      pagination: { contacts: contactsPage.nextCursor, deals: dealsPage.nextCursor },
    };
  },

  // Fetches exactly one page for a paginated Base and returns it for the
  // caller to display -- this function never loops or fetches more than one
  // page itself, so a mistaken call site can't silently reintroduce the
  // eager multi-page shape this replaced. The caller (app.js#goToPage) is
  // responsible for walking forward through cursors to reach an unvisited
  // page; this always does exactly the one fetch it's asked for.
  async fetchPage(key, cursor) {
    await ensureResources();
    return readPage(key, cursor);
  },

  async readLock() {
    const settings = await readSettingsRows();
    const lockRow = settings.get("kelly-crm-lock") || {};
    return lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null;
  },

  async applyDecision(payload = {}) {
    const followupId = String(payload.followup_id || "");
    const action = String(payload.action || "");
    if (!followupId) throw new Error("followup_id is required");
    if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
    const lock = await this.readLock();
    if (lock) throw new Error(lock.message || "Agent lock is active; the queue is read-only right now.");
    await ensureResources();
    const nextStatus = statusForAction(action);
    const now = new Date().toISOString();
    const fields = {
      status: nextStatus,
      decision_comment: String(payload.comment || ""),
      decided_at: now,
      decided_by: "operator",
      ...(payload.draft !== undefined ? { suggested_reply: String(payload.draft) } : {}),
    };
    await upsert(
      "followups",
      "followup-id",
      followupId,
      { followup_id: followupId, ...fields },
      `Decision on follow-up ${followupId}: ${action}`,
    );
    return { updated_at: now, decisions: { [followupId]: { action, decided_at: now } } };
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
