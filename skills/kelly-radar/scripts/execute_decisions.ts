#!/usr/bin/env node
// Dry-run-by-default execution stub: turns approved items into concrete operations
// in execution_report.json. No external side effects — handoffs are performed by the
// agent (kelly-writer / kelly-feedback / watchlist config) after reading the report.
// Usage: node scripts/execute_decisions.ts [--apply]
import { createProvider } from "../lib/data-provider/index.ts";

const apply = process.argv.includes("--apply");
const provider = await createProvider();
const { operations, report_path } = await provider.executeDecisions(apply);

console.log(`${apply ? "APPLIED" : "DRY-RUN"}: ${operations.length} operations → ${report_path}`);
for (const op of operations) {
  console.log(`- [${op.kind}] ${op.operation} → ${op.target || "(no target)"} :: ${op.summary}`);
}
if (!apply) console.log("No changes applied. Re-run with --apply to mark handoffs executed.");
