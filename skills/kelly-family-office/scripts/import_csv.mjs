#!/usr/bin/env node
// Trusted hand-off step. Kelly Family Office's AirApp is read-only (see
// content/kelly-family-office-app/app/js/config.js — writeProcedures: []); this script is the only
// process that ever adds entity/account/holding rows. It reads a documented
// holdings CSV (see references/holdings-csv-template.csv), resolves
// entity/account references against Busabase (creating a new entity or
// account record on the fly if the CSV names one that doesn't exist yet,
// matching the retired local importer's behavior), and writes Holdings
// records. It performs no other external effect and never touches a
// brokerage/custody API, trades, or transfers.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-family-office-app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/import_csv.mjs <path/to/holdings.csv> [--apply]

Reads a documented holdings CSV and writes Entity/Account/Holding rows to
Busabase. Without --apply this is a dry run that only prints what would be
written. With --apply it creates the records (and any new entity/account
rows the CSV references) via Busabase ChangeRequests.`);
}

const REQUIRED_COLUMNS = [
  "entity_id",
  "entity_type",
  "account_id",
  "institution",
  "account_currency",
  "holding_id",
  "symbol",
  "name",
  "asset_class",
  "quantity",
  "cost_basis",
  "market_value",
  "currency",
];

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
    throw new Error("Kelly Family Office Busabase resources are not provisioned yet; run the AirApp setup first.");
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
      for (const record of records)
        rows.push(normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields));
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

  const existingEntities = await listRows("entities");
  const existingAccounts = await listRows("accounts");
  const entityMap = new Map(existingEntities.map((e) => [e.entity_id, e]));
  const accountMap = new Map(existingAccounts.map((a) => [a.account_id, a]));

  const newEntities = [];
  const newAccounts = [];
  const holdings = [];

  function resolveEntity(record) {
    const id = record.entity_id;
    if (!id) fail("entity_id is required");
    if (entityMap.has(id)) return id;
    const fields = {
      entity_id: id,
      name: record.entity_name || id,
      type: record.entity_type || "INDIVIDUAL",
      member: record.member || "",
    };
    entityMap.set(id, fields);
    newEntities.push(fields);
    return id;
  }

  function resolveAccount(record, entityId) {
    const id = record.account_id;
    if (!id) fail("account_id is required");
    if (accountMap.has(id)) return id;
    const fields = {
      account_id: id,
      entity_id: entityId,
      institution: record.institution || "Unassigned",
      account_type: record.account_type || "",
      currency: record.account_currency || record.currency || "USD",
      display_name: `${record.institution || record.account_id} ${record.account_type || ""}`.trim(),
      as_of: record.as_of || "",
    };
    accountMap.set(id, fields);
    newAccounts.push(fields);
    return id;
  }

  for (const [index, record] of records.entries()) {
    const line = index + 2;
    for (const column of ["entity_id", "account_id", "holding_id", "asset_class"]) {
      if (!record[column]) fail(`row ${line}: ${column} is required`);
    }
    const quantity = Number(record.quantity);
    const cost_basis = Number(record.cost_basis);
    const market_value = Number(record.market_value);
    if ([quantity, cost_basis, market_value].some((value) => Number.isNaN(value))) {
      fail(`row ${line}: quantity/cost_basis/market_value must be numeric`);
    }

    const entityId = resolveEntity(record);
    resolveAccount(record, entityId);

    holdings.push({
      holding_id: record.holding_id,
      entity_id: entityId,
      account_id: record.account_id,
      symbol: record.symbol || record.holding_id,
      name: record.name || record.symbol || record.holding_id,
      asset_class: record.asset_class,
      quantity,
      cost_basis,
      market_value,
      currency: record.currency || record.account_currency || "USD",
      as_of: record.as_of || "",
    });
  }

  const plan = {
    source_csv: input,
    new_entities: newEntities.length,
    new_accounts: newAccounts.length,
    holding_rows: holdings.length,
  };

  if (!apply) {
    console.log(JSON.stringify({ dry_run: true, plan }, null, 2));
    return;
  }

  const entitiesBaseId = baseByKey.get("entities").baseId;
  const accountsBaseId = baseByKey.get("accounts").baseId;
  const holdingsBaseId = baseByKey.get("holdings").baseId;

  for (const fields of newEntities) {
    await client.bases.createChangeRequest({
      baseId: entitiesBaseId,
      fields: toBusabaseFields(fields),
      message: `Import entity ${fields.entity_id}`,
      submittedBy: "kelly-family-office-importer",
      autoMerge: true,
    });
  }
  for (const fields of newAccounts) {
    await client.bases.createChangeRequest({
      baseId: accountsBaseId,
      fields: toBusabaseFields(fields),
      message: `Import account ${fields.account_id}`,
      submittedBy: "kelly-family-office-importer",
      autoMerge: true,
    });
  }
  for (const fields of holdings) {
    await client.bases.createChangeRequest({
      baseId: holdingsBaseId,
      fields: toBusabaseFields(fields),
      message: `Import holding ${fields.holding_id}`,
      submittedBy: "kelly-family-office-importer",
      autoMerge: true,
    });
  }

  console.log(JSON.stringify({ dry_run: false, imported_at: new Date().toISOString(), plan }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
