import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { DECISION_ACTIONS, buildSnapshot, statusForAction } from "../pr-review-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const DECISION_ACTION_SET = new Set(DECISION_ACTIONS);

// Only a standalone run may merge its own writes; a deployed AirApp is inside
// the Busabase review boundary. Too consequential to infer from the URL.
import { isStandaloneLocalRuntime } from "../runtime.js";

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function parsePayload(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

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
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
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

async function readSettingsRows() {
  const rows = await readAllRecords("settings");
  return new Map(rows.map((row) => [row.record_id || row.kind, row]));
}

function defaultReviewPolicy() {
  return {
    default_action: "comment",
    include_patch_excerpt: false,
    max_patch_chars: 12000,
    large_diff_changed_files: 25,
    large_diff_additions: 1500,
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [reviewRows, settings] = await Promise.all([readAllRecords("reviews"), readSettingsRows()]);
    const snapshot = buildSnapshot({ records: reviewRows });
    const profileRow = settings.get("kelly-pr-review-profile") || {};
    const lockRow = settings.get("kelly-pr-review-lock") || {};
    const profile = parsePayload(profileRow.payload);
    return {
      app: "kelly-pr-review",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(profileRow.record_id), config_version: "1" },
      config_summary: {
        reader: "busabase",
        configured: Boolean(profileRow.record_id),
        source: profileRow.record_id ? "busabase:base/kelly-pr-review-settings-v1" : "",
        reviewer: { handle: profile.reviewer?.handle || "@me", display_name: profile.reviewer?.display_name || "" },
        repos: profile.repos || [],
        query: profile.query || {},
        review_policy: { ...defaultReviewPolicy(), ...(profile.review_policy || {}) },
        style: profile.style || {},
      },
      lock: lockRow.record_id
        ? {
            locked: lockRow.payload ? Boolean(parsePayload(lockRow.payload).locked) : false,
            ...parsePayload(lockRow.payload),
          }
        : { locked: false },
      snapshot,
    };
  },

  // Human verdict: writes status/decision_action/decision_note/decided_at
  // (and, if edited, review_body) directly onto the review record. Ported
  // from the retired local-file provider (lib/data-provider)'s saveDecision(), minus decision.approved_for_execution
  // (isApprovedForExecution() in pr-review-model.js reads `status` directly).
  async applyDecision(itemId, payload = {}) {
    const action = String(payload.action || "");
    if (!DECISION_ACTION_SET.has(action)) throw new Error(`Unsupported decision: ${action}`);
    await ensureResources();
    const existing = await findRecord("reviews", "item-id", itemId);
    if (!existing) throw new Error("not_found");
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...current,
      item_id: itemId,
      status: statusForAction(action),
      decision_action: action,
      decision_note: String(payload.comment || ""),
      decided_at: now,
      updated_at: now,
      ...(payload.review_body !== undefined ? { review_body: String(payload.review_body) } : {}),
    };
    await upsert("reviews", "item-id", itemId, fields, `Decision on ${itemId}: ${action}`);
    return { ok: true };
  },

  // Autosave for the editable review body / review note before a decision is
  // made. Ported from the retired local-file provider (lib/data-provider)'s saveDetail() — it never
  // changes `status` or `decided_at`, only the draft text.
  async saveDraft(itemId, payload = {}) {
    await ensureResources();
    const existing = await findRecord("reviews", "item-id", itemId);
    if (!existing) throw new Error("not_found");
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const fields = {
      ...current,
      item_id: itemId,
      updated_at: new Date().toISOString(),
      ...(payload.review_body !== undefined ? { review_body: String(payload.review_body) } : {}),
      ...(payload.comment !== undefined ? { decision_note: String(payload.comment) } : {}),
    };
    await upsert("reviews", "item-id", itemId, fields, `Saved review draft for ${itemId}`);
    return { ok: true };
  },

  // Post-merge human test verification. Ported from the retired local-file provider (lib/data-provider)'s
  // setTested(): only a merged PR can enter verification, and marking it
  // tested requires a note or evidence (a link, since a Busabase text field
  // cannot hold an uploaded screenshot — see references/ui-schema.md).
  async setTested(itemId, tested, options = {}) {
    await ensureResources();
    const existing = await findRecord("reviews", "item-id", itemId);
    if (!existing) throw new Error("not_found");
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    if (current.merged !== "true" && current.status !== "merged") {
      throw new Error("Only merged pull requests can enter test verification.");
    }
    const now = new Date().toISOString();
    let fields;
    if (tested) {
      const note = String(options.note || "").trim();
      const evidence = Array.isArray(options.evidence) ? options.evidence.filter(Boolean) : [];
      const existingEvidence = (() => {
        try {
          const parsed = JSON.parse(current.test_evidence || "[]");
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      if (!note && !evidence.length && !existingEvidence.length) {
        throw new Error("Add a test note or an evidence link before marking this PR tested.");
      }
      fields = {
        ...current,
        item_id: itemId,
        tested: "true",
        tested_at: current.tested_at || now,
        test_note: note,
        test_evidence: JSON.stringify([...existingEvidence, ...evidence]),
        updated_at: now,
      };
    } else {
      fields = {
        ...current,
        item_id: itemId,
        tested: "false",
        tested_at: "",
        test_note: "",
        test_evidence: "[]",
        updated_at: now,
      };
    }
    await upsert("reviews", "item-id", itemId, fields, `Test verification for ${itemId}`);
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
