#!/usr/bin/env node
// Dry-run-by-default executor stub. Reads approved creator engagements, re-checks
// the agent lock and decisions, and records concrete handoff operations in
// execution_report.json (via the active data provider). It performs NO external
// side effects: real sends (outreach DMs, briefs, contracts) are delegated to
// other skills (for example instagram-outreach or kelly-email) per SKILL.md.
import { createProvider } from "../lib/data-provider/index.ts";

const apply = process.argv.includes("--apply");
const provider = await createProvider();

let outcome: Awaited<ReturnType<typeof provider.executeDecisions>>;
try {
  outcome = await provider.executeDecisions({ apply });
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const results = (outcome.results as Record<string, unknown>[]) || [];

if (!results.length) {
  console.log("No approved creator engagements to execute.");
  process.exit(0);
}

for (const result of results) {
  console.log(
    `#${result.ref} ${result.creator_id}: ${result.status} ${result.operation}${result.target ? ` -> ${result.target}` : ""}`,
  );
}

if (!apply) {
  console.log(
    `Dry run only (${results.length} operation(s)) via "${provider.kind}" provider. Re-run with --apply to persist.`,
  );
  process.exit(0);
}

console.log(
  `Executed ${results.length} operation(s) via "${provider.kind}" provider. Real sends must be performed by the delegated skill per SKILL.md.`,
);
