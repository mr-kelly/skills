import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildSnapshot } from "../ideas-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const ANSWER_ACTIONS = new Set(["answer", "skip", "park", "advance"]);

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
// shape. ideas and questions surface the returned nextCursor through a
// numbered pager in the UI (see app.js#goToPage). documents and settings are
// read once on boot: documents are looked up by idea rather than browsed as
// their own list (at most three per idea), and settings is a handful of rows.
// If either genuinely outgrows one page in practice, it needs the same pager
// treatment ideas/questions already got, not a bigger cap.
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
    config_path: "busabase:base/kelly-ideas-settings",
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
    const [ideasPage, documentsPage, questionsPage, settings, ideaCount] = await Promise.all([
      readPage("ideas"),
      readPage("documents"),
      readPage("questions"),
      readSettingsRows(),
      countRecords("ideas"),
    ]);
    const snapshot = buildSnapshot({
      ideas: ideasPage.rows,
      documents: documentsPage.rows,
      questions: questionsPage.rows,
    });
    // buildSnapshot only ever sees the first loaded page, so counts.total
    // undercounts once there is more than one page. Overwrite with the real
    // total from records.count; a null (permission denied, or the call failed)
    // falls back to what is loaded rather than showing nothing.
    if (ideaCount !== null) snapshot.counts.total = ideaCount;
    const operatorRow = settings.get("kelly-ideas-operator") || {};
    const lockRow = settings.get("kelly-ideas-lock") || {};
    const operatorPayload = parsePayload(operatorRow.payload);
    const summary = configSummary(operatorPayload, {});
    return {
      app: "kelly-ideas",
      data_provider: "busabase",
      onboarding: { completed: Boolean(operatorRow.record_id), config_version: "1" },
      lock: lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null,
      config_summary: summary,
      agent_tasks: { updated_at: "", tasks: [] },
      execution_report: null,
      snapshot,
      // Seeds app.js's page-cursor cache: the cursor needed to fetch page 2 of
      // each Base that has its own browsed list view (page 1 was just fetched
      // above). Settings is read once; see the comment on readPage.
      pagination: { ideas: ideasPage.nextCursor, questions: questionsPage.nextCursor },
    };
  },

  // Fetches exactly one page for a paginated Base and returns it for the
  // caller to display -- this function never loops or fetches more than one
  // page itself, so a mistaken call site can't silently reintroduce the
  // eager multi-page shape this replaced.
  async fetchPage(key, cursor) {
    await ensureResources();
    return readPage(key, cursor);
  },

  async readLock() {
    const settings = await readSettingsRows();
    const lockRow = settings.get("kelly-ideas-lock") || {};
    return lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null;
  },

  // The operator's only write from the UI: answering (or skipping) a
  // consultant question, parking an idea, or advancing a rung. Advancing is
  // gated on the model's own advanceCheck rather than the caller's say-so, so
  // the ladder cannot be skipped by a crafted request.
  async applyDecision(payload = {}) {
    const action = String(payload.action || "");
    if (!ANSWER_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
    const lock = await this.readLock();
    if (lock) throw new Error(lock.message || "Agent lock is active; the vault is read-only right now.");
    await ensureResources();
    const now = new Date().toISOString();

    if (action === "answer" || action === "skip") {
      const questionId = String(payload.question_id || "");
      if (!questionId) throw new Error("question_id is required");
      const answer = action === "answer" ? String(payload.answer || "") : "";
      if (action === "answer" && !answer.trim()) throw new Error("An answer cannot be empty");
      await upsert(
        "questions",
        "record-id",
        questionId,
        {
          record_id: questionId,
          answer,
          status: action === "answer" ? "answered" : "skipped",
          answered_at: now,
        },
        `${action === "answer" ? "Answered" : "Skipped"} question ${questionId}`,
      );
      return { updated_at: now };
    }

    const ideaId = String(payload.idea_id || "");
    if (!ideaId) throw new Error("idea_id is required");

    if (action === "park") {
      await upsert(
        "ideas",
        "record-id",
        ideaId,
        { record_id: ideaId, status: "已搁置", notes: String(payload.comment || ""), updated_at: now },
        `Parked idea ${ideaId}`,
      );
      return { updated_at: now };
    }

    // action === "advance": re-derive the gate from stored state instead of
    // trusting the client. A UI that offers the button on a blocked idea, or a
    // hand-made request, both get the same refusal here.
    const [ideasPage, questionsPage] = await Promise.all([readPage("ideas"), readPage("questions")]);
    const snapshot = buildSnapshot({ ideas: ideasPage.rows, questions: questionsPage.rows });
    const idea = snapshot.ideas.find((row) => row.record_id === ideaId);
    if (!idea) throw new Error(`Unknown idea: ${ideaId}`);
    if (!idea.advance.canAdvance) {
      const blocked = idea.advance.missingFields.length
        ? `missing ${idea.advance.missingFields.join(", ")}`
        : `${idea.advance.openQuestions.length} unanswered question(s)`;
      throw new Error(`This idea cannot advance yet: ${blocked}`);
    }
    await upsert(
      "ideas",
      "record-id",
      ideaId,
      { record_id: ideaId, stage: idea.advance.target, updated_at: now },
      `Advanced idea ${ideaId} to ${idea.advance.target}`,
    );
    return { updated_at: now, stage: idea.advance.target };
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
