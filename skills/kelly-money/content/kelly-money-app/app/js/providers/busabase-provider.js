import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildSnapshot } from "../money-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

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
      rows.push(normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields));
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function readSettingsRows() {
  const rows = await readAllRecords("settings");
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

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [accounts, transactions, invoices, invoiceMatches, settings] = await Promise.all([
      readAllRecords("accounts"),
      readAllRecords("transactions"),
      readAllRecords("invoices"),
      readAllRecords("invoice-matches"),
      readSettingsRows(),
    ]);
    const snapshot = buildSnapshot({ accounts, transactions, invoices, invoiceMatches });
    const configRow = settings.get("kelly-money-accounts") || {};
    const lockRow = settings.get("kelly-money-lock") || {};
    const configuredAccounts = parsePayload(configRow.payload).accounts || [];
    return {
      app: "kelly-money",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(configRow.record_id), config_version: "1" },
      config_summary: {
        config_path: "busabase:base/kelly-money-settings",
        is_example: false,
        accounts: configuredAccounts,
      },
      locked: Boolean(lockRow.locked),
      lock: lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null,
      snapshot,
    };
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
