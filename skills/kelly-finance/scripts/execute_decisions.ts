#!/usr/bin/env node
import fs from "node:fs/promises";
import { createProvider } from "../lib/data-provider/index.ts";
import { executionReportPath } from "../lib/paths.ts";

const apply = process.argv.includes("--apply");
const provider = await createProvider();

const existingLock = await provider.readLock();
if (existingLock) {
  console.error(
    `agent.lock exists (owner: ${existingLock.owner}, started ${existingLock.started_at}). Wait for the other run to finish.`,
  );
  process.exit(1);
}

await provider.acquireLock({
  owner: "kelly-finance-execute",
  message: apply ? "Preparing execution report from approved checks" : "Dry-running approved checks",
  started_at: new Date().toISOString(),
});

try {
  // Re-read the snapshot after acquiring the lock so a decision made
  // concurrently (e.g. via the app UI) while this script was starting is
  // reflected before we decide what to hand off to the agent.
  const snapshot = await provider.readSnapshot();
  const approved = snapshot.checks.filter((check) => check.status === "approved");
  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    operations: approved.map((check) => ({
      id: check.id,
      operation: check.check_type === "model_quality" ? "revise_model_structure" : "record_model_review",
      status: apply ? "ready_for_agent" : "dry_run",
      target: snapshot.workbook?.last_generated_path || "workbook",
      reason: check.proposed_action,
    })),
  };

  await fs.mkdir(new URL("../app/.data/", import.meta.url), { recursive: true });
  await fs.writeFile(executionReportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${apply ? "execution" : "dry-run"} report for ${approved.length} approved checks.`);
} finally {
  await provider.releaseLock();
}
