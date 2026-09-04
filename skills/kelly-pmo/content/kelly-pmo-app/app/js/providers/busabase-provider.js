import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  buildProject,
  buildState,
  decisionToFields,
  milestoneToFields,
  normalizeDecisionRow,
  normalizeMilestoneRow,
  normalizeProjectRow,
  normalizeReportRow,
  normalizeRiskRow,
  normalizeSettingsRow,
  projectToFields,
} from "../pmo-model.js?v=0.1.0";
import { isStandaloneLocalRuntime } from "../runtime.js";

export { isStandaloneLocalRuntime };

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key.replaceAll("_", "-"), value]));

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";
const initialPageCursors = {};
const initialTotalCounts = {};

async function ensureResources() {
  runtimeClient = runtimeClient || createRuntimeClient();
  if (!allowedReads.has("nodes.list") || !allowedReads.has("nodes.get"))
    throw new Error("PROCEDURE_DENIED: nodes.list/nodes.get");
  let resources = await inspectProvisionedResources(runtimeClient, appConfig);
  if (resources.folder && resources.missing.length === 0 && resources.repairs.length) {
    if (!allowedReads.has("bases.get") || !allowedSetup.has("nodes.updateMetadata"))
      throw new Error("PROCEDURE_DENIED: bases.get/nodes.updateMetadata");
    resources = await provisionDeclaredResources(runtimeClient, appConfig);
  }
  if (!resources.folder || resources.missing.length) {
    if (pendingSetupError) throw new Error(pendingSetupError);
    throw new Error(
      `SETUP_REQUIRED: ${resources.missing.map((item) => item.name).join(", ") || appConfig.folder.name}`,
    );
  }
  runtimeBases = new Map(resources.bases.map((item) => [item.key, item]));
  pendingSetupError = "";
  return resources;
}

function base(key) {
  const value = runtimeBases.get(key);
  if (!value) throw new Error(`SETUP_REQUIRED: ${key}`);
  return value;
}

async function countRecords(key) {
  if (!allowedReads.has("records.count")) return null;
  try {
    return (await runtimeClient.records.count({ baseId: base(key).baseId })).total;
  } catch {
    return null;
  }
}

async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: declared.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  return {
    rows: records.map((record) => ({
      ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
      __recordId: record.id,
      __headCommitId: record.headCommitId || record.headCommit?.id,
    })),
    nextCursor: Array.isArray(result) ? null : result.nextCursor || null,
  };
}

async function readFirstPage(key) {
  const [page, total] = await Promise.all([readPage(key), countRecords(key)]);
  initialPageCursors[key] = page.nextCursor;
  initialTotalCounts[key] = total;
  return page.rows;
}

const normalizers = {
  projects: normalizeProjectRow,
  milestones: normalizeMilestoneRow,
  risks: normalizeRiskRow,
  reports: normalizeReportRow,
  decisions: normalizeDecisionRow,
  settings: normalizeSettingsRow,
};

async function findRecord(key, idFieldSlug, idValue) {
  try {
    return await runtimeClient.records.get({ baseId: base(key).baseId, fieldSlug: idFieldSlug, valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

async function createRecord(key, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest")) throw new Error("PROCEDURE_DENIED: bases.createChangeRequest");
  return runtimeClient.bases.createChangeRequest({
    baseId: base(key).baseId,
    fields: toBusabaseFields(fields),
    message,
    submittedBy: appConfig.appId,
    autoMerge: isStandaloneLocalRuntime(),
  });
}

async function updateRecord(existing, fields, message) {
  if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
    autoMerge: isStandaloneLocalRuntime(),
  });
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    for (const key of Object.keys(initialPageCursors)) delete initialPageCursors[key];
    for (const key of Object.keys(initialTotalCounts)) delete initialTotalCounts[key];
    await ensureResources();
    const [projectRows, milestoneRows, riskRows, reportRows, decisionRows, settingsRows] = await Promise.all(
      ["projects", "milestones", "risks", "reports", "decisions", "settings"].map(readFirstPage),
    );
    const auxiliaryKeys = appConfig.bases
      .map((item) => item.key)
      .filter((key) => !["projects", "milestones", "risks", "reports", "decisions", "settings"].includes(key));
    const auxiliaryCounts = Object.fromEntries(
      await Promise.all(auxiliaryKeys.map(async (key) => [key, await countRecords(key)])),
    );
    const projects = projectRows.map(normalizeProjectRow);
    const milestones = milestoneRows.map(normalizeMilestoneRow);
    const risks = riskRows.map(normalizeRiskRow);
    const reports = reportRows.map(normalizeReportRow);
    const decisions = decisionRows.map(normalizeDecisionRow);
    const settings = settingsRows.map(normalizeSettingsRow).find((item) => item.record_id === "portfolio") || {};
    const onboarded =
      settings.onboarding_version === appConfig.onboarding.version && settings.onboarding_status === "complete";
    return {
      ...buildState(projects, milestones, risks, reports, decisions, settings, { app: appConfig.appId, demo: false }),
      data_provider: "busabase",
      pagination: { ...initialPageCursors },
      totals: { ...initialTotalCounts, ...auxiliaryCounts },
      onboarding: {
        version: appConfig.onboarding.version,
        status: onboarded ? "complete" : settings.onboarding_version ? "needs_review" : "not_started",
        completed: onboarded,
        completed_at: settings.completed_at || "",
      },
    };
  },

  async createProject(input) {
    await ensureResources();
    const project = buildProject(input);
    await createRecord("projects", projectToFields(project), `Create project ${project.name || project.id}`);
    return project;
  },

  async updateProject(id, input) {
    if (!id) throw new Error("id is required");
    await ensureResources();
    const existing = await findRecord("projects", "project-id", id);
    if (!existing) throw new Error(`Unknown project id: ${id}`);
    const current = normalizeProjectRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const next = buildProject({ ...current, ...input, id, created_at: current.created_at });
    await updateRecord(existing, projectToFields(next), `Update project ${next.name || next.id}`);
    return next;
  },

  async markMilestoneDone(id, done = true) {
    if (!id) throw new Error("id is required");
    await ensureResources();
    const existing = await findRecord("milestones", "milestone-id", id);
    if (!existing) throw new Error(`Unknown milestone id: ${id}`);
    const current = normalizeMilestoneRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const next = {
      ...current,
      status: done ? "done" : "in_progress",
      progress: done ? 100 : Math.min(current.progress, 95),
      updated_at: new Date().toISOString(),
    };
    await updateRecord(
      existing,
      milestoneToFields(next),
      `${done ? "Complete" : "Reopen"} milestone ${next.title || next.id}`,
    );
    return next;
  },

  async saveDecision(id, action, note = "") {
    if (!id) throw new Error("id is required");
    await ensureResources();
    const existing = await findRecord("decisions", "decision-id", id);
    if (!existing) throw new Error(`Unknown decision id: ${id}`);
    const current = normalizeDecisionRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const status = { approve: "approved", changes: "changes_requested", block: "blocked" }[action] || action;
    const next = {
      ...current,
      status,
      decision_note: note,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await updateRecord(existing, decisionToFields(next), `Record Decision #${next.ref || next.id}`);
    return next;
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    const normalize = normalizers[key];
    return { ...page, rows: normalize ? page.rows.map(normalize) : page.rows };
  },

  async provisionResources() {
    if (!allowedSetup.has("nodes.createChangeRequest") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: nodes.createChangeRequest/nodes.updateMetadata");
    }
    try {
      return await provisionDeclaredResources(runtimeClient || createRuntimeClient(), appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) pendingSetupError = String(error.message);
      throw error;
    }
  },
};
