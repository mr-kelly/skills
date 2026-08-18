import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  assertDraftApprovable,
  assertDraftPublishable,
  assertReplySendable,
  assertReviewStatus,
  buildSnapshot,
} from "../social-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

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

async function readAll() {
  const [accounts, posts, syncLog, calendar, drafts, shorts, engagement, settings] = await Promise.all([
    readAllRecords("accounts"),
    readAllRecords("posts"),
    readAllRecords("sync_log"),
    readAllRecords("calendar"),
    readAllRecords("drafts"),
    readAllRecords("shorts"),
    readAllRecords("engagement"),
    readSettingsRows(),
  ]);
  const crisisRow = settings.get("kelly-social-crisis");
  const sovRow = settings.get("kelly-social-share-of-voice");
  const snapshot = buildSnapshot({
    accounts,
    posts,
    sync_log: syncLog,
    calendar,
    drafts,
    shorts,
    engagement,
    crisis: crisisRow ? parsePayload(crisisRow.payload) : null,
    share_of_voice: sovRow ? parsePayload(sovRow.payload) : null,
  });
  return { snapshot, settings };
}

function draftById(snapshot, draftId) {
  return (snapshot.drafts || []).find((draft) => draft.draft_id === draftId) || null;
}

function engagementById(snapshot, itemId) {
  return (snapshot.engagement || []).find((item) => item.item_id === itemId) || null;
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const { snapshot, settings } = await readAll();
    return {
      app: "kelly-social",
      demo: false,
      data_provider: "busabase",
      onboarding: {
        completed: snapshot.accounts.length > 0,
        config_version: "1",
      },
      lock: null,
      config_summary: {
        config_path: "busabase:base/kelly-social-accounts-v1",
        is_example: false,
        accounts: snapshot.accounts.map((account) => ({
          account_id: account.account_id,
          platform: account.platform,
          handle: account.handle,
          display_name: account.display_name,
          collection: account.collection,
          secret_envs: [],
          secrets_ready: true,
        })),
      },
      snapshot,
      __settings: settings,
    };
  },

  // review_draft / review_short / review_engagement: write status + review
  // note directly onto the item record. A gate BLOCK forbids approving a
  // draft (ported from the retired publishing-ops.ts).
  async reviewDraft(draftId, { status, review_note = "" } = {}) {
    assertReviewStatus(status);
    await ensureResources();
    const { snapshot } = await readAll();
    const draft = draftById(snapshot, draftId);
    if (!draft) throw new Error(`draft not found: ${draftId}`);
    if (status === "approved") assertDraftApprovable(draft);
    const now = new Date().toISOString();
    const existing = await findRecord("drafts", "draft-id", draftId);
    const current = normalizeFields(
      existing?.headCommit?.payload || existing?.headCommit?.fields || existing?.fields || {},
    );
    await upsert(
      "drafts",
      "draft-id",
      draftId,
      { ...current, draft_id: draftId, status, review_note: review_note || current.review_note || "", updated_at: now },
      `Review draft ${draftId}: ${status}`,
    );
    return this.getState();
  },

  async reviewShort(shortId, { status, review_note = "" } = {}) {
    assertReviewStatus(status);
    await ensureResources();
    const now = new Date().toISOString();
    const existing = await findRecord("shorts", "short-id", shortId);
    if (!existing) throw new Error(`short not found: ${shortId}`);
    const current = normalizeFields(
      existing.headCommit?.payload || existing.headCommit?.fields || existing.fields || {},
    );
    await upsert(
      "shorts",
      "short-id",
      shortId,
      { ...current, short_id: shortId, status, review_note: review_note || current.review_note || "", updated_at: now },
      `Review short ${shortId}: ${status}`,
    );
    return this.getState();
  },

  async reviewEngagement(itemId, { status, review_note = "" } = {}) {
    assertReviewStatus(status);
    await ensureResources();
    const existing = await findRecord("engagement", "item-id", itemId);
    if (!existing) throw new Error(`engagement item not found: ${itemId}`);
    const current = normalizeFields(
      existing.headCommit?.payload || existing.headCommit?.fields || existing.fields || {},
    );
    await upsert(
      "engagement",
      "item-id",
      itemId,
      { ...current, item_id: itemId, status, review_note: review_note || current.review_note || "" },
      `Review engagement ${itemId}: ${status}`,
    );
    return this.getState();
  },

  // publish_post: requires prior human approval and a non-BLOCK gate. Writes
  // status="done" + scheduled_for as the recorded intent — the real platform
  // action happens out of band after approval, never from the app itself.
  async publishPost(draftId, { channel = "", scheduled_for = "" } = {}) {
    await ensureResources();
    const { snapshot } = await readAll();
    const draft = draftById(snapshot, draftId);
    if (!draft) throw new Error(`draft not found: ${draftId}`);
    assertDraftPublishable(draft);
    const now = new Date().toISOString();
    const existing = await findRecord("drafts", "draft-id", draftId);
    const current = normalizeFields(
      existing?.headCommit?.payload || existing?.headCommit?.fields || existing?.fields || {},
    );
    await upsert(
      "drafts",
      "draft-id",
      draftId,
      {
        ...current,
        draft_id: draftId,
        status: "done",
        scheduled_for: scheduled_for || current.scheduled_for || now,
        review_note: channel ? `Publish intent recorded for ${channel}.` : current.review_note || "",
        updated_at: now,
      },
      `Publish draft ${draftId}`,
    );
    // Reflect on any calendar entry that links to this draft.
    const linked = (snapshot.calendar || []).find((entry) => entry.draft_id === draftId);
    if (linked) {
      const existingEntry = await findRecord("calendar", "entry-id", linked.entry_id);
      const currentEntry = normalizeFields(
        existingEntry?.headCommit?.payload || existingEntry?.headCommit?.fields || existingEntry?.fields || {},
      );
      await upsert(
        "calendar",
        "entry-id",
        linked.entry_id,
        {
          ...currentEntry,
          entry_id: linked.entry_id,
          status: "scheduled",
          scheduled_for: scheduled_for || currentEntry.scheduled_for || "",
        },
        `Schedule calendar entry ${linked.entry_id} for draft ${draftId}`,
      );
    }
    return this.getState();
  },

  // send_reply: requires prior human approval. Writes status="done" as the
  // recorded intent — the real reply send happens out of band after approval.
  async sendReply(itemId, { channel = "" } = {}) {
    await ensureResources();
    const { snapshot } = await readAll();
    const item = engagementById(snapshot, itemId);
    if (!item) throw new Error(`engagement item not found: ${itemId}`);
    assertReplySendable(item);
    const existing = await findRecord("engagement", "item-id", itemId);
    const current = normalizeFields(
      existing?.headCommit?.payload || existing?.headCommit?.fields || existing?.fields || {},
    );
    await upsert(
      "engagement",
      "item-id",
      itemId,
      {
        ...current,
        item_id: itemId,
        status: "done",
        review_note: channel ? `Reply intent recorded for ${channel}.` : "Reply sent.",
      },
      `Send reply ${itemId}`,
    );
    return this.getState();
  },

  async crisisToggle({ status, publishing_paused, step_id, done } = {}) {
    await ensureResources();
    const { snapshot } = await readAll();
    const crisis = { ...snapshot.crisis, steps: (snapshot.crisis.steps || []).map((step) => ({ ...step })) };
    if (status) crisis.status = status;
    if (typeof publishing_paused === "boolean") crisis.publishing_paused = publishing_paused;
    if (step_id) {
      crisis.steps = crisis.steps.map((step) =>
        step.step_id === step_id ? { ...step, done: typeof done === "boolean" ? done : !step.done } : step,
      );
    }
    crisis.updated_at = new Date().toISOString();
    await upsert(
      "settings",
      "record-id",
      "kelly-social-crisis",
      {
        record_id: "kelly-social-crisis",
        kind: "crisis",
        name: "Crisis playbook",
        payload: JSON.stringify(crisis),
        updated_at: crisis.updated_at,
      },
      "Update crisis playbook",
    );
    return this.getState();
  },

  // Generic dispatcher matching the retired PublishingOperation union — kept
  // so app.js's applyOperation() call site stays a single, uniform call.
  async applyOperation(op = {}) {
    switch (op.operation) {
      case "review_draft":
        return this.reviewDraft(op.draft_id, { status: op.status, review_note: op.review_note });
      case "review_short":
        return this.reviewShort(op.short_id, { status: op.status, review_note: op.review_note });
      case "review_engagement":
        return this.reviewEngagement(op.item_id, { status: op.status, review_note: op.review_note });
      case "publish_post":
        return this.publishPost(op.draft_id, { channel: op.channel, scheduled_for: op.scheduled_for });
      case "send_reply":
        return this.sendReply(op.item_id, { channel: op.channel });
      case "crisis_toggle":
        return this.crisisToggle({
          status: op.status,
          publishing_paused: op.publishing_paused,
          step_id: op.step_id,
          done: op.done,
        });
      default:
        throw new Error(`Unknown operation: ${op.operation}`);
    }
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
