#!/usr/bin/env node
// Read a documented holdings CSV (see references/holdings-csv-template.csv),
// normalize it into the portfolio snapshot, and write app/.data/snapshot.json.
// Read-only over external systems: it only reads the local CSV and writes the
// local snapshot. FX rates and the base currency come from config (config.local
// .json / KELLY_FAMILY_OFFICE_CONFIG / config.example.json).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSnapshot } from "../app/server/portfolio.ts";
import type { AccountRef, Entity, HoldingInput } from "../app/server/types.ts";
import { createProvider } from "../lib/data-provider/index.ts";
import { snapshotPath } from "../lib/paths.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2] || path.join(skillDir, "references", "holdings-csv-template.csv");
const output = process.argv[3] || path.join(skillDir, "app", ".data", "snapshot.json");

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

function fail(message: string): never {
  console.error(`CSV import failed: ${message}`);
  process.exit(1);
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields and embedded commas).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
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

const raw = await fs.readFile(input, "utf8").catch((error) => fail(`cannot read ${input}: ${error.message}`));
const rows = parseCsv(raw);
if (rows.length < 2) fail("CSV needs a header row and at least one data row");

const header = rows[0].map((cell) => cell.trim());
for (const column of REQUIRED_COLUMNS) {
  if (!header.includes(column)) fail(`missing required column: ${column}`);
}

const records: Record<string, string>[] = rows.slice(1).map((cells) => {
  const record: Record<string, string> = {};
  header.forEach((key, index) => {
    record[key] = (cells[index] ?? "").trim();
  });
  return record;
});

const provider = await createProvider();
const configResult = await provider.readConfig();
const config = configResult.config || {};
const base_currency = config.base_currency || "USD";
const fx_rates = config.fx_rates || { USD: 1 };

const entityMap = new Map<string, Entity>();
const accountMap = new Map<string, AccountRef>();
const holdings: HoldingInput[] = [];

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

  if (!entityMap.has(record.entity_id)) {
    entityMap.set(record.entity_id, {
      entity_id: record.entity_id,
      name: record.entity_name || record.entity_id,
      type: record.entity_type || "INDIVIDUAL",
      member: record.member || "",
    });
  }

  if (!accountMap.has(record.account_id)) {
    accountMap.set(record.account_id, {
      account_id: record.account_id,
      entity_id: record.entity_id,
      institution: record.institution || "Unassigned",
      account_type: record.account_type || "",
      currency: record.account_currency || record.currency || base_currency,
      display_name: `${record.institution || record.account_id} ${record.account_type || ""}`.trim(),
      as_of: record.as_of || "",
    });
  }

  holdings.push({
    holding_id: record.holding_id,
    entity_id: record.entity_id,
    account_id: record.account_id,
    symbol: record.symbol || record.holding_id,
    name: record.name || record.symbol || record.holding_id,
    asset_class: record.asset_class,
    quantity,
    cost_basis,
    market_value,
    currency: record.currency || record.account_currency || base_currency,
    as_of: record.as_of || "",
  });
}

const snapshot = buildSnapshot({
  snapshot_id: `fo-import-${Date.now()}`,
  generated_at: new Date().toISOString(),
  base_currency,
  fx_rates,
  entities: [...entityMap.values()],
  accounts: [...accountMap.values()],
  holdings,
  source: "kelly-family-office-csv",
  warnings: [],
});

// Persist through the data provider when writing to the standard snapshot path;
// honor an explicit custom output path with a direct write.
if (path.resolve(output) === path.resolve(snapshotPath)) {
  await provider.writeSnapshot(snapshot);
} else {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(snapshot, null, 2));
}

const report = {
  imported_at: snapshot.generated_at,
  source_csv: input,
  entities: snapshot.entities.length,
  accounts: snapshot.accounts.length,
  holdings: snapshot.holdings.length,
  aum_base: snapshot.totals.aum_base,
  base_currency,
};
await fs.writeFile(path.join(path.dirname(output), "import_report.json"), JSON.stringify(report, null, 2));

console.log(`Imported ${snapshot.holdings.length} holdings across ${snapshot.entities.length} entities.`);
console.log(`AUM (${base_currency}): ${snapshot.totals.aum_base}`);
console.log(`Wrote ${output}`);
