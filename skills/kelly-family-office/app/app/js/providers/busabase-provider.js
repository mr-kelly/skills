import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildSnapshot, computeInsights } from "../office-model.js?v=0.1.0";

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
    const [entityRows, accountRows, holdingRows, settings] = await Promise.all([
      readAllRecords("entities"),
      readAllRecords("accounts"),
      readAllRecords("holdings"),
      readSettingsRows(),
    ]);

    const entities = entityRows.map((row) => ({
      entity_id: row.entity_id || "",
      name: row.name || row.entity_id || "",
      type: row.type || "INDIVIDUAL",
      member: row.member || "",
    }));
    const accounts = accountRows.map((row) => ({
      account_id: row.account_id || "",
      entity_id: row.entity_id || "",
      institution: row.institution || "Unassigned",
      account_type: row.account_type || "",
      currency: row.currency || "USD",
      display_name: row.display_name || "",
      as_of: row.as_of || "",
    }));
    const holdings = holdingRows.map((row) => ({
      holding_id: row.holding_id || "",
      entity_id: row.entity_id || "",
      account_id: row.account_id || "",
      symbol: row.symbol || "",
      name: row.name || row.symbol || row.holding_id || "",
      asset_class: row.asset_class || "CASH",
      quantity: Number(row.quantity) || 0,
      cost_basis: Number(row.cost_basis) || 0,
      market_value: Number(row.market_value) || 0,
      currency: row.currency || "USD",
      as_of: row.as_of || "",
    }));

    const metaRow = settings.get("office-meta") || {};
    const meta = parsePayload(metaRow.payload);
    const base_currency = meta.base_currency || "USD";
    const fx_rates = meta.fx_rates && typeof meta.fx_rates === "object" ? meta.fx_rates : { USD: 1 };
    const target_allocation =
      meta.target_allocation && typeof meta.target_allocation === "object" ? meta.target_allocation : undefined;

    const onboardingRow = settings.get("onboarding") || {};
    const onboarding = parsePayload(onboardingRow.payload);

    const snapshot = buildSnapshot({
      snapshot_id: `fo-${Date.now()}`,
      generated_at: new Date().toISOString(),
      base_currency,
      fx_rates,
      entities,
      accounts,
      holdings,
      source: "kelly-family-office",
    });
    snapshot.insights = computeInsights(snapshot, target_allocation);

    return {
      app: "kelly-family-office",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(onboarding.completed), ...onboarding },
      config_summary: {
        config_path: "busabase:base/kelly-family-office-settings-v1",
        is_example: false,
        base_currency,
        fx_rates,
        entities: entities.map((entity) => ({
          entity_id: entity.entity_id,
          name: entity.name,
          type: entity.type,
          member: entity.member,
        })),
        institutions: [...new Set(accounts.map((account) => account.institution))],
      },
      lock: null,
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
