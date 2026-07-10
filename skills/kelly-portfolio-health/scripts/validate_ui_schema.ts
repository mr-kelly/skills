#!/usr/bin/env node
import type { Contract, PortfolioSnapshot } from "../app/server/types.ts";
// Validates a snapshot.json file against the minimal contract schema before
// relying on it for the dashboard. Run: node scripts/validate_ui_schema.ts <path>
import { readJson } from "../lib/common.ts";
import { SNAPSHOT_PATH } from "../lib/paths.ts";

const REQUIRED_CONTRACT_FIELDS: (keyof Contract)[] = [
  "id",
  "business_name",
  "category",
  "city",
  "origination_date",
  "months_since_origination",
  "expected_term_months",
  "funding_amount",
  "cap_multiple",
  "cap_amount",
  "cumulative_repayment",
  "monthly_revenue",
  "status",
  "currency",
];

function fail(message: string): never {
  console.error(`INVALID: ${message}`);
  process.exitCode = 1;
  process.exit(1);
}

async function main(): Promise<void> {
  const file = process.argv[2] || SNAPSHOT_PATH;
  const snapshot = (await readJson<PortfolioSnapshot>(file, null)) as PortfolioSnapshot | null;
  if (!snapshot) fail(`Could not read ${file}`);
  if (!Array.isArray(snapshot.contracts)) fail("snapshot.contracts must be an array");

  const ids = new Set<string>();
  snapshot.contracts.forEach((contract, index) => {
    for (const field of REQUIRED_CONTRACT_FIELDS) {
      if (contract[field] === undefined || contract[field] === null) {
        fail(`contracts[${index}] missing field "${field}"`);
      }
    }
    if (ids.has(contract.id)) fail(`duplicate contract id "${contract.id}"`);
    ids.add(contract.id);
    if (!["active", "completed", "delinquent"].includes(contract.status)) {
      fail(`contracts[${index}] has invalid status "${contract.status}"`);
    }
    if (!Array.isArray(contract.monthly_revenue) || contract.monthly_revenue.length === 0) {
      fail(`contracts[${index}] monthly_revenue must be a non-empty array`);
    }
  });

  console.log(`OK: ${snapshot.contracts.length} contracts validated in ${file}`);
}

await main();
