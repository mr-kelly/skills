#!/usr/bin/env node
// Trusted hand-off step. Kelly Family Fund's AirApp is read-only (see
// app/app/js/config.js — writeProcedures: []); this script is the only
// process that ever adds ledger rows. It reads a documented ledger CSV (see
// references/ledger-csv-template.csv), resolves beneficiary/family references
// against Busabase (creating a new family record on the fly if the CSV names
// one that doesn't exist yet, matching the retired local importer's
// behavior), and writes Income/Expense records. It performs no other
// external effect and never touches money.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

function help() {
  console.log(`Usage: node scripts/import_csv.mjs <path/to/ledger.csv> [--apply]

Reads a documented ledger CSV and writes Income/Expense rows to Busabase.
Without --apply this is a dry run that only prints what would be written.
With --apply it creates the records (and any new beneficiary/family rows the
CSV references) via Busabase ChangeRequests.`);
}

const REQUIRED_COLUMNS = ["type", "month", "category", "amount"];

function fail(message) {
  console.error(`CSV import failed: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields and embedded commas).
function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim().length));
}

function toBool(value) {
  return ["true", "1", "yes", "y", "共享", "shared"].includes(String(value).trim().toLowerCase());
}

const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));
const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const apply = args.includes("--apply");
  const input = args.find((a) => !a.startsWith("-"));
  if (!input) return help();

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Family Fund Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const baseByKey = new Map(resources.bases.map((base) => [base.key, base]));

  async function listRows(key) {
    const declared = baseByKey.get(key);
    const rows = [];
    let cursor;
    for (let page = 0; page < 20; page += 1) {
      const result = await client.records.list({
        baseId: declared.baseId,
        limit: declared.readLimit,
        ...(cursor ? { cursor } : {}),
      });
      const records = Array.isArray(result) ? result : result.records || [];
      for (const record of records) rows.push(normalizeFields(record.headCommit?.fields || record.fields));
      cursor = Array.isArray(result) ? null : result.nextCursor;
      if (!cursor) break;
    }
    return rows;
  }

  const raw = await fs.readFile(input, "utf8").catch((error) => fail(`cannot read ${input}: ${error.message}`));
  const rows = parseCsv(raw);
  if (rows.length < 2) fail("CSV needs a header row and at least one data row");

  const header = rows[0].map((cell) => cell.trim());
  for (const column of REQUIRED_COLUMNS) {
    if (!header.includes(column)) fail(`missing required column: ${column}`);
  }
  const records = rows.slice(1).map((cells) => {
    const record = {};
    header.forEach((key, index) => {
      record[key] = (cells[index] ?? "").trim();
    });
    return record;
  });

  const existingBeneficiaries = await listRows("beneficiaries");
  const existingFamilies = await listRows("families");
  const beneficiaryIds = new Set(existingBeneficiaries.map((b) => b.beneficiary_id));
  const familyMap = new Map(existingFamilies.map((f) => [f.family_id, f]));
  const familyByName = new Map(existingFamilies.map((f) => [f.name, f.family_id]));

  const newBeneficiaries = [];
  const newFamilies = [];
  const income = [];
  const expenses = [];

  function resolveFamily(ref) {
    const value = ref.trim();
    if (!value) return null;
    if (familyMap.has(value)) return value;
    if (familyByName.has(value)) return familyByName.get(value);
    familyMap.set(value, { family_id: value, name: value, head: "", members_count: 0 });
    newFamilies.push({ family_id: value, name: value, head: "", members_count: 0 });
    return value;
  }

  for (const [index, record] of records.entries()) {
    const line = index + 2;
    const type = record.type.toLowerCase();
    if (type !== "income" && type !== "expense") fail(`row ${line}: type must be income or expense`);
    if (!record.month) fail(`row ${line}: month is required`);
    const amount = Number(record.amount);
    if (Number.isNaN(amount)) fail(`row ${line}: amount must be numeric`);

    if (type === "income") {
      const beneficiary_id = record.beneficiary || "unknown-beneficiary";
      if (!beneficiaryIds.has(beneficiary_id) && !newBeneficiaries.some((b) => b.beneficiary_id === beneficiary_id)) {
        newBeneficiaries.push({ beneficiary_id, name: beneficiary_id, relation: "", pension_monthly: 0 });
        beneficiaryIds.add(beneficiary_id);
      }
      income.push({
        income_id: `inc-${record.month}-${beneficiary_id}-${line}`,
        month: record.month,
        beneficiary_id,
        amount,
        note: record.note || "",
      });
    } else {
      const category = record.category || "misc";
      const family_id = category === "care" ? null : resolveFamily(record.family || "");
      expenses.push({
        expense_id: `exp-${record.month}-${category}-${line}`,
        month: record.month,
        date: record.date || "",
        category,
        amount,
        payee: record.payee || "",
        occasion: record.occasion || "",
        family_id: family_id || "",
        shared: category === "care" ? false : toBool(record.shared),
        note: record.note || "",
      });
    }
  }

  const plan = {
    source_csv: input,
    new_beneficiaries: newBeneficiaries.length,
    new_families: newFamilies.length,
    income_rows: income.length,
    expense_rows: expenses.length,
  };

  if (!apply) {
    console.log(JSON.stringify({ dry_run: true, plan }, null, 2));
    return;
  }

  const beneficiariesBaseId = baseByKey.get("beneficiaries").baseId;
  const familiesBaseId = baseByKey.get("families").baseId;
  const incomeBaseId = baseByKey.get("income").baseId;
  const expensesBaseId = baseByKey.get("expenses").baseId;

  for (const fields of newBeneficiaries) {
    await client.bases.createChangeRequest({
      baseId: beneficiariesBaseId,
      fields: toBusabaseFields(fields),
      message: `Import beneficiary ${fields.beneficiary_id}`,
      submittedBy: "kelly-family-fund-importer",
      autoMerge: true,
    });
  }
  for (const fields of newFamilies) {
    await client.bases.createChangeRequest({
      baseId: familiesBaseId,
      fields: toBusabaseFields(fields),
      message: `Import family ${fields.family_id}`,
      submittedBy: "kelly-family-fund-importer",
      autoMerge: true,
    });
  }
  for (const fields of income) {
    await client.bases.createChangeRequest({
      baseId: incomeBaseId,
      fields: toBusabaseFields(fields),
      message: `Import income ${fields.income_id}`,
      submittedBy: "kelly-family-fund-importer",
      autoMerge: true,
    });
  }
  for (const fields of expenses) {
    await client.bases.createChangeRequest({
      baseId: expensesBaseId,
      fields: toBusabaseFields(fields),
      message: `Import expense ${fields.expense_id}`,
      submittedBy: "kelly-family-fund-importer",
      autoMerge: true,
    });
  }

  console.log(JSON.stringify({ dry_run: false, imported_at: new Date().toISOString(), plan }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
