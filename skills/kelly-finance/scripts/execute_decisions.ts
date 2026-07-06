#!/usr/bin/env node
import fs from "node:fs/promises";
import { localFileProvider } from "../lib/data-provider/local-file-provider.ts";
import { executionReportPath } from "../lib/paths.ts";

const apply = process.argv.includes("--apply");
const snapshot = await localFileProvider.readSnapshot();
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
