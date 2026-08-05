import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  DECISION_ACTIONS,
  assembleSnapshot,
  baseMistakeFields,
  basePaperFields,
  baseQuestionFields,
  baseReviewFields,
  buildConfigSummary,
  computeMistakeFromRow,
  computePaperFromRow,
  computeQuestionFromRow,
  computeReviewFromRow,
  statusForAction,
} from "../homework-model.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";

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
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

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

async function updateRecord(key, existing, fields, message) {
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

function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

function parseSettingsPayload(row) {
  if (!row?.payload) return {};
  try {
    return JSON.parse(row.payload);
  } catch {
    return {};
  }
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [questionRows, mistakeRows, paperRows, reviewRows, settingsRows] = await Promise.all([
      readAllRecords("questions"),
      readAllRecords("mistakes"),
      readAllRecords("papers"),
      readAllRecords("reviews"),
      readAllRecords("settings"),
    ]);
    const configRow = findSettingsRow(settingsRows, "config");
    const configPayload = parseSettingsPayload(configRow);
    const config_summary = buildConfigSummary(configPayload);
    const questions = questionRows.map(computeQuestionFromRow);
    const mistakes = mistakeRows.map(computeMistakeFromRow);
    const papers = paperRows.map(computePaperFromRow);
    const reviews = reviewRows.map(computeReviewFromRow);
    const snapshot = assembleSnapshot({
      profile: configPayload.student_profile || { display_name: "", grade: "", language: "Auto" },
      questions,
      mistakes,
      papers,
      reviews,
      mastery_score: configPayload.metrics?.mastery_score,
      questions_analyzed: configPayload.metrics?.questions_analyzed,
    });
    return {
      app: "kelly-homework-coach",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(configRow), config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
    };
  },

  // Human verdict (approve / request_changes / block / revise), written
  // directly onto the review record, and mirrored onto the target
  // question/mistake/paper's own `status` field. Ported from the retired
  // local-file DataProvider's submitReview()+updateTargetStatus(): the
  // review's decision action/comment/decided_at live on the review row,
  // while the target's status is kept in sync on its own row — there is no
  // separate decisions.json bucket.
  async submitReview({ review_id, action, comment = "" } = {}) {
    if (!review_id || typeof review_id !== "string") throw new Error("submitReview requires a review_id");
    if (!action || !DECISION_ACTIONS.has(action)) {
      throw new Error(`Unsupported action: ${action}. Must be one of: ${[...DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("reviews", "review-id", review_id);
    if (!existing) throw new Error(`Review not found: ${review_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const nextStatus = statusForAction(action);

    await updateRecord(
      "reviews",
      existing,
      baseReviewFields({
        ...computeReviewFromRow(current),
        review_id,
        status: nextStatus,
        decision_action: action,
        decision_comment: String(comment || ""),
        decided_at: now,
      }),
      `Decision on review ${review_id}: ${action}`,
    );

    const targetType = current.target_type;
    const targetId = current.target_id;
    const targetBase = { question: "questions", mistake: "mistakes", paper: "papers" }[targetType];
    const targetIdField = { question: "question-id", mistake: "mistake-id", paper: "paper-id" }[targetType];
    if (targetBase && targetId) {
      const targetExisting = await findRecord(targetBase, targetIdField, targetId);
      if (targetExisting) {
        const targetCurrent = normalizeFields(targetExisting.headCommit?.fields || targetExisting.fields);
        const fieldsBuilder = { questions: baseQuestionFields, mistakes: baseMistakeFields, papers: basePaperFields }[
          targetBase
        ];
        const normalizer = {
          questions: computeQuestionFromRow,
          mistakes: computeMistakeFromRow,
          papers: computePaperFromRow,
        }[targetBase];
        await updateRecord(
          targetBase,
          targetExisting,
          fieldsBuilder({ ...normalizer(targetCurrent), status: nextStatus }),
          `Decision on review ${review_id} updates ${targetType} ${targetId}: ${nextStatus}`,
        );
      }
    }

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
