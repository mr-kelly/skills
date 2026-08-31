import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildSnapshot, computeInsights } from "../fund-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const BROWSED_KEYS = ["families", "expenses"];

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

const initialCursors = new Map();

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

async function readSettingsRows() {
  const rows = await readPageRows("settings");
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

function normalizeExpenseRow(row = {}) {
  return {
    id: row.expense_id || "",
    month: row.month || "",
    date: row.date || "",
    category: row.category || "misc",
    amount: Number(row.amount) || 0,
    payee: row.payee || "",
    occasion: row.occasion || "",
    family_id: row.family_id || null,
    shared: row.shared === "true" || row.shared === true,
    note: row.note || "",
  };
}

function normalizeFamilyRow(row = {}) {
  return {
    id: row.family_id || "",
    name: row.name || row.family_id || "",
    head: row.head || "",
    members_count: Number(row.members_count) || 0,
    note: row.note || "",
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    initialCursors.clear();
    const recordCountsPromise = Promise.all(BROWSED_KEYS.map((key) => countRecords(key)));
    const [beneficiaryRows, familyRows, incomeRows, expenseRows, settings] = await Promise.all([
      readPageRows("beneficiaries"),
      readPageRows("families"),
      readPageRows("income"),
      readPageRows("expenses"),
      readSettingsRows(),
    ]);

    const beneficiaries = beneficiaryRows.map((row) => ({
      id: row.beneficiary_id || "",
      name: row.name || row.beneficiary_id || "",
      relation: row.relation || "",
      pension_monthly: Number(row.pension_monthly) || 0,
    }));
    const families = familyRows.map(normalizeFamilyRow);
    const income = incomeRows.map((row) => ({
      id: row.income_id || "",
      month: row.month || "",
      beneficiary_id: row.beneficiary_id || "",
      amount: Number(row.amount) || 0,
      note: row.note || "",
    }));
    const expenses = expenseRows.map(normalizeExpenseRow);

    const metaRow = settings.get("fund-meta") || {};
    const meta = parsePayload(metaRow.payload);
    const fund = { name: meta.name || "", steward: meta.steward || "", note: meta.note || "" };
    const base_currency = meta.base_currency || "CNY";
    const deviation_threshold_pct = Number(meta.deviation_threshold_pct) || 20;

    const onboardingRow = settings.get("onboarding") || {};
    const onboarding = parsePayload(onboardingRow.payload);

    const snapshot = buildSnapshot({
      snapshot_id: `ff-${Date.now()}`,
      generated_at: new Date().toISOString(),
      base_currency,
      fund,
      beneficiaries,
      families,
      income,
      expenses,
    });
    snapshot.insights = computeInsights(snapshot, deviation_threshold_pct);

    const recordCounts = await recordCountsPromise;
    return {
      app: "kelly-family-fund",
      demo: false,
      data_provider: "busabase",
      pagination: Object.fromEntries(BROWSED_KEYS.map((key) => [key, initialCursors.get(key) || null])),
      totals: Object.fromEntries(BROWSED_KEYS.map((key, index) => [key, recordCounts[index]])),
      onboarding: { completed: Boolean(onboarding.completed), ...onboarding },
      config_summary: {
        config_path: "busabase:base/kelly-family-fund-settings",
        is_example: false,
        base_currency,
        fund,
        beneficiaries,
        families,
        deviation_threshold_pct,
      },
      lock: null,
      snapshot,
    };
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    const normalize = { families: normalizeFamilyRow, expenses: normalizeExpenseRow }[key];
    return { ...page, rows: normalize ? page.rows.map(normalize) : page.rows };
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
