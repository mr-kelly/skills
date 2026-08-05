#!/usr/bin/env node
// Trusted export step. Legal Matter Strategy's AirApp only ever writes a
// review decision onto a strategy-pack record — the browser cannot write to
// the local filesystem. This script re-reads Busabase for genuinely
// approved strategy packs and exports them as Markdown + JSON + CSV,
// preserving the exact document format (headings, field order, CSV
// columns) from the retired scripts/export_strategy_pack.ts.
//
// Departure from the retired script (matching kelly-legal-casebase-ingest's
// export_case_records.mjs and kelly-legal-firm-radar's
// export_management_report.mjs precedent, applied here too): a strategy
// pack is exportable only when its decision_action is a genuine "approve"
// (written exclusively by the review queue's decideItem()) — not merely
// because status happens to read "approved"/"done". This closes the
// spoofed-import gap the retired script had (scripts/create_strategy_batch.ts
// setting status: "approved" directly, with no real human decision, used to
// be enough to export). This script is also now the one that marks the item
// "done" after a real export — scripts/execute_decisions.mjs deliberately
// never touches workflow status (see its module doc comment), so export is
// the only write in this Busabase-only shape that finalizes an item.
//
// Usage: node scripts/export_strategy_pack.mjs [--out /path/to/dir]
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { APP_TITLE, normalizeItemRow } from "../app/app/js/matter-strategy-model.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log(`Usage: node scripts/export_strategy_pack.mjs [--out /path/to/dir]

Reads strategy packs with a genuine "approve" decision from Busabase and
writes approved-items.md, approved-items.json, and approved-items.csv into
--out (default: <skill>/exports, gitignored). Marks each exported record
"done" in Busabase. Filing, sending, and client advice remain the agent's
job outside the app after explicit approval.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

function baseItemFields(row) {
  return {
    item_id: row.item_id,
    ref: row.ref || "",
    title: row.title || "",
    category: row.category || "",
    status: row.status || "needs_review",
    owner: row.owner || "",
    risk: row.risk || "[]",
    summary: row.summary || "",
    body: row.body || "",
    recommendation: row.recommendation || "",
    proposed_action: row.proposed_action || "",
    draft: row.draft || "",
    evidence: row.evidence || "[]",
    matter_stage: row.matter_stage || "",
    evidence_gap_count: row.evidence_gap_count ?? "",
    evidence_gaps_list: row.evidence_gaps_list || "[]",
    issue_tree: row.issue_tree || "[]",
    negotiation_options: row.negotiation_options || "[]",
    posture: row.posture || "",
    pleading_outline: row.pleading_outline || "",
    deadline: row.deadline || "",
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_operation: row.execution_operation || "",
    execution_target: row.execution_target || "",
    execution_detail: row.execution_detail || "",
    executed_at: row.executed_at || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
  const rows = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

// Ported verbatim from the retired scripts/export_strategy_pack.ts (same
// heading shape, same field order).
function csv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildMarkdown(items, now) {
  return [
    `# ${APP_TITLE} Approved Items`,
    "",
    `Generated: ${now}`,
    "",
    ...items.flatMap((item) => [
      `## ${item.ref} — ${item.title}`,
      "",
      item.summary || "",
      "",
      item.recommendation ? `Recommendation: ${item.recommendation}` : "",
      "",
      item.draft || "",
      "",
    ]),
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const outIndex = args.indexOf("--out");
  const outDir =
    outIndex !== -1 && args[outIndex + 1] ? path.resolve(args[outIndex + 1]) : path.join(skillDir, "exports");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Legal Matter Strategy Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = resources.bases.find((base) => base.key === "items");

  const rows = await readAll(client, declared);
  if (!rows.length) {
    console.log("No strategy packs found. Nothing to export.");
    return;
  }

  // Exportable only when a genuine human "approve" decision was recorded —
  // see the module doc comment for why this is not simply status === "approved".
  const exportableRows = rows.filter((row) => row.decision_action === "approve");
  if (!exportableRows.length) {
    console.log("No approved strategy packs to export.");
    return;
  }

  await fs.mkdir(outDir, { recursive: true });
  const now = new Date().toISOString();
  const items = exportableRows.map((row) => normalizeItemRow(row));

  const mdPath = path.join(outDir, "approved-items.md");
  const jsonPath = path.join(outDir, "approved-items.json");
  const csvPath = path.join(outDir, "approved-items.csv");

  await fs.writeFile(mdPath, buildMarkdown(items, now));
  await fs.writeFile(jsonPath, `${JSON.stringify(items, null, 2)}\n`);
  await fs.writeFile(
    csvPath,
    [
      "id,ref,title,status,category,owner",
      ...items.map((item) =>
        [item.id, item.ref, item.title, item.status, item.category || "", item.owner || ""].map(csv).join(","),
      ),
    ].join("\n"),
  );

  for (const row of exportableRows) {
    await client.records.changeRequest({
      recordId: row.__recordId,
      operation: "update",
      fields: toBusabaseFields({ ...baseItemFields(row), status: "done", updated_at: now }),
      message: `Export strategy pack ${row.item_id}`,
      author: "kelly-legal-matter-strategy-export",
      baseCommitId: row.__headCommitId,
      autoMerge: true,
    });
  }

  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${csvPath}`);
  console.log(
    `Exported ${items.length} approved item(s) to ${outDir}. Filing and sending remain a separate approved step.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
