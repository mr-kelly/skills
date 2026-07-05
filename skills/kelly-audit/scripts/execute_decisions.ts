#!/usr/bin/env node
// Dry-run-by-default execution stub for approved audit anomalies.
// Re-checks the agent lock and decisions, then writes execution_report.json
// entries with concrete operations (chase_receivable with the drafted email
// handoff, reissue_invoice, flag_to_accountant) and target document ids.
// It performs NO external side effects: any outbound chasing email or ERP
// change is executed by the agent OUTSIDE the app (e.g. via kelly-email)
// after explicit user approval, and the real result is recorded back here.
// Usage: node scripts/execute_decisions.mjs [--apply]

import fs from "node:fs/promises";
import { EXECUTION_REPORT_PATH, LOCK_PATH } from "../app/server/paths.ts";
import {
  ensureDirs,
  mergeAnomalies,
  readDecisions,
  readExecutionReport,
  readLock,
  readSnapshot,
  writeJson,
} from "../app/server/store.ts";
import type { Evidence } from "../app/server/types.ts";

const OPERATION_BY_RULE: Record<string, string> = {
  overdue_receivable: "chase_receivable",
  amount_mismatch: "reissue_invoice",
  missing_invoice: "reissue_invoice",
  duplicate: "flag_to_accountant",
  unmatched_payment: "flag_to_accountant",
  irregular_entry: "flag_to_accountant",
};

const apply = process.argv.includes("--apply");
const dryRun = !apply;

function fail(message: string): never {
  console.error(`kelly-audit execute: ${message}`);
  process.exit(1);
}

await ensureDirs();

const existingLock = (await readLock()) as { owner?: string; started_at?: string } | null;
if (existingLock) {
  fail(
    `agent.lock exists (owner: ${existingLock.owner}, started ${existingLock.started_at}). Wait for the other run to finish.`,
  );
}

const [snapshot, decisions, previousReport] = await Promise.all([
  readSnapshot(),
  readDecisions(),
  readExecutionReport(),
]);
const merged = mergeAnomalies(snapshot, decisions, previousReport);
const approved = merged.anomalies.filter((anomaly) => anomaly.status === "approved");

if (!approved.length) {
  console.log("No approved anomalies to execute. Nothing written.");
  process.exit(0);
}

await writeJson(LOCK_PATH, {
  owner: "kelly-audit",
  message: dryRun ? "Dry-run: planning approved anomalies" : "Preparing approved anomalies for the agent",
  started_at: new Date().toISOString(),
});

try {
  const results = approved.map((anomaly) => {
    const decision = decisions.decisions?.[anomaly.id];
    const operation = OPERATION_BY_RULE[anomaly.rule] || "flag_to_accountant";
    const evidence = anomaly.evidence || ({} as Evidence);
    const target = evidence.invoice_id || evidence.order_id || (evidence.payment_ids || [])[0] || "";
    const base = {
      id: anomaly.id,
      ref: anomaly.ref,
      title: anomaly.title,
      rule: anomaly.rule,
      operation,
      target,
      customer: anomaly.customer || "",
      amount_at_stake: anomaly.amount_at_stake,
      currency: anomaly.currency,
      draft: anomaly.draft || "",
    };
    if (!target) {
      return {
        ...base,
        status: "blocked",
        detail: "No target order/invoice/payment id in the evidence; ask the user before executing.",
      };
    }
    return {
      ...base,
      status: dryRun ? "planned" : "ready_for_agent",
      detail: dryRun
        ? `Dry run: would ${operation.replaceAll("_", " ")} for ${target} using the ${decision?.draft ? "user-edited" : "agent"} draft. No email sent, no records changed.`
        : `Approved: agent should ${operation.replaceAll("_", " ")} for ${target} (${anomaly.customer}) using the ${decision?.draft ? "user-edited" : "agent"} draft — e.g. send the chasing email via kelly-email or open the billing task — then record the real result here.`,
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    source: "kelly-audit",
    results,
  };
  await writeJson(EXECUTION_REPORT_PATH, report);
  console.log(`${dryRun ? "Dry run" : "Execution plan"} wrote ${EXECUTION_REPORT_PATH}`);
  for (const result of results) {
    console.log(`  Anomaly #${result.ref} -> ${result.operation} (${result.status}) target=${result.target || "-"}`);
  }
  if (dryRun) console.log("Re-run with --apply to mark items ready_for_agent. No external side effects either way.");
} finally {
  await fs.rm(LOCK_PATH, { force: true });
}
