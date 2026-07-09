#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apply = process.argv.includes("--apply");
const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const batchPath = path.join(dataDir, "current_batch.json");
const decisionsPath = path.join(dataDir, "decisions.json");
const reportPath = path.join(dataDir, "execution_report.json");

async function readJson(file: string, fallback: any) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

const batch = await readJson(batchPath, null);
if (!batch) {
  console.error("No current_batch.json. Generate or collect a batch first.");
  process.exit(1);
}
const decisions = await readJson(decisionsPath, { decisions: {} });
const items = [...(batch.signals || []), ...(batch.actions || []), ...(batch.drafts || [])];
const operations = [];

for (const item of items) {
  const decision = decisions.decisions?.[item.id];
  if (!decision) continue;
  if (decision.action === "approve") {
    operations.push({
      item_id: item.id,
      operation: item.channel ? "handoff_content_pack" : item.next_step ? "export_action_plan" : "mark_signal_approved",
      target: item.channel || item.title,
      status: apply ? "done" : "dry_run",
      note: decision.note || "",
    });
  } else if (decision.action === "request_changes") {
    operations.push({
      item_id: item.id,
      operation: "queue_agent_revision",
      status: apply ? "queued" : "dry_run",
      note: decision.note || "",
    });
  } else if (decision.action === "block") {
    operations.push({
      item_id: item.id,
      operation: "mark_blocked",
      status: apply ? "done" : "dry_run",
      note: decision.note || "",
    });
  } else if (decision.action === "revise") {
    operations.push({
      item_id: item.id,
      operation: "save_human_revision",
      status: apply ? "done" : "dry_run",
      note: decision.note || "",
    });
  }
}

const report = {
  schema_version: "1",
  generated_at: new Date().toISOString(),
  mode: apply ? "apply" : "dry_run",
  batch_id: batch.batch_id,
  operations,
};
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
