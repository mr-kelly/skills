#!/usr/bin/env node
// Read a documented ledger CSV (see references/ledger-csv-template.csv),
// normalize it into the fund snapshot, and write app/.data/snapshot.json.
// Read-only over external systems: it only reads the local CSV and writes the
// local snapshot. The fund meta, beneficiaries, and families come from config
// (config.local.json / KELLY_FAMILY_FUND_CONFIG / config.example.json); rows in
// the CSV that reference a new family/beneficiary id are added on the fly.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSnapshot } from "../app/server/portfolio.ts";
import type { Beneficiary, ExpenseInput, Family, IncomeInput } from "../app/server/types.ts";
import { createProvider } from "../lib/data-provider/index.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2] || path.join(skillDir, "references", "ledger-csv-template.csv");
// Optional 3rd arg overrides the output snapshot path (local files only). When
// omitted, the snapshot is persisted through the configured data provider.
const outputOverride = process.argv[3] || "";

const provider = await createProvider();

const REQUIRED_COLUMNS = ["type", "month", "category", "amount"];

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

function toBool(value: string): boolean {
  return ["true", "1", "yes", "y", "共享", "shared"].includes(String(value).trim().toLowerCase());
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

const configResult = await provider.getConfig();
const config = configResult.config || {};
const base_currency = config.base_currency || "CNY";
const fund = {
  name: config.fund?.name || "家庭统筹基金",
  steward: config.fund?.steward || "",
  note: config.fund?.note || "",
};

const beneficiaryMap = new Map<string, Beneficiary>();
for (const b of Array.isArray(config.beneficiaries) ? config.beneficiaries : []) {
  if (b?.id) beneficiaryMap.set(b.id, b);
}
const familyMap = new Map<string, Family>();
for (const f of Array.isArray(config.families) ? config.families : []) {
  if (f?.id) familyMap.set(f.id, f);
}

// Resolve a family reference (id or name) to a stable family id, creating one if new.
function resolveFamily(ref: string): string | null {
  const value = ref.trim();
  if (!value) return null;
  if (familyMap.has(value)) return value;
  for (const [id, family] of familyMap) {
    if (family.name === value) return id;
  }
  familyMap.set(value, { id: value, name: value, head: "", members_count: 0 });
  return value;
}

const income: IncomeInput[] = [];
const expenses: ExpenseInput[] = [];

for (const [index, record] of records.entries()) {
  const line = index + 2;
  const type = record.type.toLowerCase();
  if (type !== "income" && type !== "expense") fail(`row ${line}: type must be income or expense`);
  if (!record.month) fail(`row ${line}: month is required`);
  const amount = Number(record.amount);
  if (Number.isNaN(amount)) fail(`row ${line}: amount must be numeric`);

  if (type === "income") {
    const beneficiary_id = record.beneficiary || "unknown-beneficiary";
    if (!beneficiaryMap.has(beneficiary_id)) {
      beneficiaryMap.set(beneficiary_id, {
        id: beneficiary_id,
        name: beneficiary_id,
        relation: "",
        pension_monthly: 0,
      });
    }
    income.push({
      id: `inc-${record.month}-${beneficiary_id}-${line}`,
      month: record.month,
      beneficiary_id,
      amount,
      note: record.note || "",
    });
  } else {
    const category = record.category || "misc";
    const family_id = category === "care" ? null : resolveFamily(record.family);
    expenses.push({
      id: `exp-${record.month}-${category}-${line}`,
      month: record.month,
      date: record.date || "",
      category,
      amount,
      payee: record.payee || "",
      occasion: record.occasion || "",
      family_id,
      shared: category === "care" ? false : toBool(record.shared),
      note: record.note || "",
    });
  }
}

const snapshot = buildSnapshot({
  snapshot_id: `ff-import-${Date.now()}`,
  generated_at: new Date().toISOString(),
  base_currency,
  fund,
  beneficiaries: [...beneficiaryMap.values()],
  families: [...familyMap.values()],
  income,
  expenses,
  source: "kelly-family-fund-csv",
});

const report = {
  imported_at: snapshot.generated_at,
  source_csv: input,
  beneficiaries: snapshot.beneficiaries.length,
  families: snapshot.families.length,
  income_rows: snapshot.income.length,
  expense_rows: snapshot.expenses.length,
  balance: snapshot.totals.balance,
  base_currency,
};

let destination: string;
if (outputOverride) {
  // Explicit path override: write the local files directly, byte-identical to
  // the original importer (no trailing newline).
  await fs.mkdir(path.dirname(outputOverride), { recursive: true });
  await fs.writeFile(outputOverride, JSON.stringify(snapshot, null, 2));
  await fs.writeFile(path.join(path.dirname(outputOverride), "import_report.json"), JSON.stringify(report, null, 2));
  destination = outputOverride;
} else {
  await provider.putSnapshot(snapshot);
  await provider.putImportReport?.(report);
  destination =
    provider.kind === "local" ? path.join(skillDir, "app", ".data", "snapshot.json") : `${provider.kind} provider`;
}

console.log(`Imported ${snapshot.income.length} income and ${snapshot.expenses.length} expense rows.`);
console.log(`Balance (${base_currency}): ${snapshot.totals.balance}`);
console.log(`Wrote ${destination}`);
