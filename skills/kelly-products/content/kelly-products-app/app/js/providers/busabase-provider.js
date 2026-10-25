import {
  inspectProvisionedResources,
  provisionDeclaredResources,
  createAirAppRecords,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  DECISION_ACTIONS,
  buildConfigSummary,
  buildSnapshot,
  normalizeChannelRow,
  normalizeInventoryRow,
  normalizeProductRow,
  normalizeReviewRow,
  reviewToFields,
  statusForVerdict,
} from "../products-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const BROWSED_KEYS = ["products", "channels", "inventory", "review"];
// Business id field (Busabase slug, already hyphenated) per peekable view --
// only products/review ever open a detail (see config.js's ui.detail_modes).
const ID_FIELD_SLUG = { products: "product-id", review: "item-id" };
const NORMALIZE_BY_KEY = {
  products: normalizeProductRow,
  channels: normalizeChannelRow,
  inventory: normalizeInventoryRow,
  review: normalizeReviewRow,
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

const initialCursors = new Map();

// Record reads go through the SDK's helper, bound to this app's client.
const sdkRecords = () => createAirAppRecords(runtimeClient, { appId: appConfig.appId });

async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const page = await sdkRecords().readPage({
    baseId: declared.baseId,
    limit: declared.readLimit,
    cursor,
  });
  const rows = page.records.map((record) => ({
    ...normalizeFields(record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: page.nextCursor };
}

async function readPageRows(key) {
  const page = await readPage(key);
  initialCursors.set(key, page.nextCursor);
  return page.rows;
}

async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  try {
    const { total } = await runtimeClient.records.count({
      baseId: base(key).baseId,
      ...(filters ? { filters } : {}),
    });
    return total;
  } catch {
    return null;
  }
}

async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  return sdkRecords().findRecord({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
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
  });
}

async function readSettingsRow() {
  const rows = await readPageRows("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    initialCursors.clear();
    const recordCountsPromise = Promise.all(BROWSED_KEYS.map((key) => countRecords(key)));
    const [products, channels, inventory, reviewItems, settings] = await Promise.all([
      readPageRows("products"),
      readPageRows("channels"),
      readPageRows("inventory"),
      readPageRows("review"),
      readSettingsRow(),
    ]);
    const snapshot = buildSnapshot({ products, channels, inventory, reviewItems, settings });
    const recordCounts = await recordCountsPromise;
    return {
      app: "kelly-products",
      demo: false,
      data_provider: "busabase",
      pagination: Object.fromEntries(BROWSED_KEYS.map((key) => [key, initialCursors.get(key) || null])),
      totals: Object.fromEntries(BROWSED_KEYS.map((key, index) => [key, recordCounts[index]])),
      onboarding: { completed: products.length > 0, config_version: "1" },
      lock: null,
      config_summary: buildConfigSummary({ settings }),
      snapshot,
    };
  },

  // Human verdict on a review item, written directly onto the item's own
  // Busabase record -- replaces the retired app/server/store.ts's separate
  // app/.data/decisions.json handoff bucket (readDecisions/applyDecision)
  // with a direct field write, matching the kelly-legal-contracts/kelly-crm
  // precedent. Only the three actions the retired review queue actually
  // exposed as buttons are supported (see products-model.js's DECISION_ACTIONS
  // comment for why "revise" was dropped).
  async decideReview(itemId, action, note = "") {
    if (!itemId) throw new Error("itemId is required");
    if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
    await ensureResources();
    const existing = await findRecord("review", "item-id", itemId);
    if (!existing) throw new Error(`Unknown review item: ${itemId}`);
    const current = normalizeReviewRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const now = new Date().toISOString();
    const next = {
      ...current,
      status: statusForVerdict(action, current.status),
      decision_note: String(note || ""),
      decided_at: now,
      updated_at: now,
    };
    await updateRecord(existing, reviewToFields(next), `Decision on review item ${itemId}: ${action}`);
    return next;
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    const normalize = NORMALIZE_BY_KEY[key];
    return { ...page, rows: normalize ? page.rows.map(normalize) : page.rows };
  },

  // A record named by the URL (`/products/<id>` or `?peek=<id>`) that is not
  // on the currently loaded page -- read on its own by business id
  // (records.get) instead of loading more pages to find it. Only products
  // and review ever peek (config.js's ui.detail_modes); null for anything
  // else so app.js's ensureSelectedRecord() can fall back gracefully.
  async getRecord(key, id) {
    const idFieldSlug = ID_FIELD_SLUG[key];
    const normalize = NORMALIZE_BY_KEY[key];
    if (!idFieldSlug || !normalize) return null;
    if (!allowedReads.has("records.get")) return null;
    await ensureResources();
    const record = await findRecord(key, idFieldSlug, id);
    if (!record) return null;
    return normalize(normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields));
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
