import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { DEFAULT_TARGET_ALLOCATION, assembleSnapshot, computeInsights } from "../webull-model.js?v=0.1.0";

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
    const [accountRows, positionRows, settings] = await Promise.all([
      readAllRecords("accounts"),
      readAllRecords("positions"),
      readSettingsRows(),
    ]);

    const accounts = accountRows.map((row) => ({
      account_id: row.account_id || "",
      account_type: row.account_type === "MARGIN" ? "MARGIN" : "CASH",
      display_name: row.display_name || row.account_id || "Webull",
      currency: row.currency || "USD",
      net_liquidation: Number(row.net_liquidation) || 0,
      total_cash: Number(row.total_cash) || 0,
      buying_power: Number(row.buying_power) || 0,
    }));
    const positions = positionRows.map((row) => ({
      symbol: row.symbol || "",
      name: row.name || "",
      asset_type: row.asset_type || "OTHER",
      account_id: row.account_id || "",
      quantity: Number(row.quantity) || 0,
      avg_cost: Number(row.avg_cost) || 0,
      last_price: Number(row.last_price) || 0,
      market_value: Number(row.market_value) || 0,
      cost_basis: Number(row.cost_basis) || 0,
      unrealized_pnl: Number(row.unrealized_pnl) || 0,
      unrealized_pnl_pct: Number(row.unrealized_pnl_pct) || 0,
      day_change: Number(row.day_change) || 0,
      day_change_pct: Number(row.day_change_pct) || 0,
      currency: row.currency || "USD",
      weight_pct: 0,
    }));

    const configRow = settings.get("config") || {};
    const configPayload = parsePayload(configRow.payload);
    const base_currency = configPayload.base_currency || "USD";
    const target_allocation = configPayload.target_allocation || DEFAULT_TARGET_ALLOCATION;
    const webull = configPayload.webull || {};
    const warnings = Array.isArray(configPayload.warnings) ? configPayload.warnings : [];

    const onboardingRow = settings.get("onboarding") || {};
    const onboarding = parsePayload(onboardingRow.payload);

    const snapshot = assembleSnapshot(accounts, positions, {
      snapshot_id: configPayload.snapshot_id || "",
      generated_at: configPayload.generated_at || "",
      source: configPayload.source || "kelly-invest-webull",
      base_currency,
      warnings,
    });
    snapshot.insights = computeInsights(snapshot, target_allocation);

    return {
      app: "kelly-invest-webull",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(onboarding.completed), ...onboarding },
      config_summary: {
        config_path: "busabase:base/kelly-invest-webull-settings-v1",
        is_example: false,
        base_currency,
        webull: {
          region: webull.region || "",
          base_url: webull.base_url || "",
          account_allowlist: Array.isArray(webull.account_allowlist) ? webull.account_allowlist : [],
          secret_envs: ["KELLY_INVEST_WEBULL_APP_KEY", "KELLY_INVEST_WEBULL_APP_SECRET"],
          secrets_ready: Boolean(webull.secrets_ready),
        },
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
