#!/usr/bin/env node
// Trusted export step. Kelly Legal Contracts's AirApp only ever writes a
// review decision onto an issue record — the browser cannot write to the
// local filesystem. This script re-reads Busabase for genuinely approved
// issues and exports each as a clean Markdown issue memo plus issues.csv.
// issueMarkdown()/csvCell()/PLATFORM_LABELS/slugify() are ported verbatim
// (same headings, same table shape, same CSV columns, same footer) from the
// retired scripts/export_issues.ts; only the read source changed, from a
// persisted app/.data/contract_snapshot.json + decisions.json to Busabase's
// contracts/issues Bases.
//
// An issue is exportable only when its decision_action is a genuine
// "approve" (written exclusively by the review queue's decideIssue()) — not
// merely because status happens to read "approved"/"done". This preserves
// the retired script's safety property: an agent ingesting a payload with
// status: "approved" directly (scripts/ingest_contracts.mjs) can never spoof
// an export; only a real human approve decision can. Re-running is
// idempotent (decision_action stays "approve" after export, so the file is
// simply regenerated).
//
// Usage: node scripts/export_issues.mjs [--out /path/to/dir]
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";
import { normalizeContractRow, normalizeIssueRow } from "../app/app/js/contracts-model.js";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log(`Usage: node scripts/export_issues.mjs [--out /path/to/dir]

Reads issues with a genuine "approve" decision from Busabase and writes one
Markdown issue memo per issue plus issues.csv into --out (default:
<skill>/exports, gitignored). Marks each exported issue "done" in Busabase.
External sends, filings, or redline delivery remain the agent's job outside
the app after explicit approval.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

function baseIssueFields(row) {
  return {
    issue_id: row.issue_id,
    ref: row.ref,
    contract_id: row.contract_id,
    platform: row.platform,
    locale: row.locale || "",
    variant_group: row.variant_group || "",
    status: row.status || "needs_review",
    compliance_score: row.compliance_score,
    keyword_strategy: row.keyword_strategy || "",
    title: row.title || "",
    subtitle: row.subtitle || "",
    bullets: row.bullets || "[]",
    description: row.description || "",
    search_terms: row.search_terms || "",
    seo_title: row.seo_title || "",
    seo_description: row.seo_description || "",
    selling_points: row.selling_points || "[]",
    aplus_outline: row.aplus_outline || "[]",
    item_specifics: row.item_specifics || "[]",
    compliance_summary: row.compliance_summary || "",
    suggestions: row.suggestions || "[]",
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
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

// ---- Ported verbatim from the retired scripts/export_issues.ts ----

function slugify(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "issue"
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const PLATFORM_LABELS = {
  nda: "NDA",
  msa: "MSA",
  dpa: "DPA",
  sow: "SOW",
  amazon: "NDA",
  shopify: "MSA",
  tiktok_shop: "DPA",
  ebay: "SOW",
};

function issueMarkdown(issue, contract, sellerBrand) {
  const fields = issue.fields || {};
  const lines = [];
  lines.push(`# ${fields.title || contract?.name || issue.issue_id}`);
  lines.push("");
  lines.push("| | |");
  lines.push("| --- | --- |");
  lines.push(`| Company | ${sellerBrand || ""} |`);
  lines.push(`| Contract | ${contract?.name || issue.contract_id} |`);
  lines.push(`| Counterparty | ${contract?.sku || ""} |`);
  lines.push(`| Workstream | ${PLATFORM_LABELS[issue.platform] || issue.platform} |`);
  lines.push(`| Jurisdiction | ${issue.locale || ""} |`);
  lines.push(`| Risk score | ${issue.compliance_score} |`);
  lines.push("");
  if (fields.subtitle) lines.push("## Short Issue", "", fields.subtitle, "");
  if (fields.bullets?.length) {
    lines.push("## Risk Notes", "", ...fields.bullets.map((bullet) => `- ${bullet}`), "");
  }
  if (fields.selling_points?.length) {
    lines.push("## Business Ask", "", ...fields.selling_points.map((point) => `- ${point}`), "");
  }
  if (fields.description) lines.push("## Recommended Fallback", "", fields.description, "");
  if (fields.search_terms) lines.push("## Negotiation Notes", "", "```", fields.search_terms, "```", "");
  if (fields.seo_title || fields.seo_description) {
    lines.push("## Memo", "");
    if (fields.seo_title) lines.push(`- Title: ${fields.seo_title}`);
    if (fields.seo_description) lines.push(`- Summary: ${fields.seo_description}`);
    lines.push("");
  }
  if (fields.item_specifics?.length) {
    lines.push("## Structured Facts", "", "| Name | Value |", "| --- | --- |");
    for (const entry of fields.item_specifics) lines.push(`| ${entry.name} | ${entry.value} |`);
    lines.push("");
  }
  if (fields.aplus_outline?.length) {
    lines.push("## Redline / Memo Outline", "", ...fields.aplus_outline.map((module) => `- ${module}`), "");
  }
  lines.push(
    "---",
    "",
    `Exported by kelly-legal-contracts on ${new Date().toISOString()} (Issue #${issue.ref}, ${issue.issue_id}). External sending or redline delivery is executed by the agent only after approval.`,
    "",
  );
  return lines.join("\n");
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
    throw new Error("Kelly Legal Contracts Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [issueRows, contractRows, settingsRows] = await Promise.all([
    readAll(client, declared("issues")),
    readAll(client, declared("contracts")),
    readAll(client, declared("settings")),
  ]);
  if (!issueRows.length) {
    console.log("No issues found. Nothing to export.");
    return;
  }
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const sellerBrand = settings.seller_brand || "";
  const contractsById = new Map(contractRows.map((row) => [row.contract_id, normalizeContractRow(row)]));

  // Exportable only when a genuine human "approve" decision was recorded —
  // see the module doc comment for why this is not simply status === "approved".
  const exportableRows = issueRows.filter((row) => row.decision_action === "approve");
  if (!exportableRows.length) {
    console.log("No approved issues to export.");
    return;
  }

  await fs.mkdir(outDir, { recursive: true });
  const csvRows = [
    [
      "counterparty",
      "contract",
      "workstream",
      "jurisdiction",
      "issue_title",
      "risk_notes",
      "fallback_language",
      "negotiation_notes",
      "memo_title",
      "memo_summary",
      "issue_id",
    ],
  ];

  const now = new Date().toISOString();
  for (const row of exportableRows) {
    const issue = normalizeIssueRow(row);
    const contract = contractsById.get(issue.contract_id);
    const fields = issue.fields;
    const fileName = `${slugify(`${sellerBrand}-${contract?.name || issue.contract_id}-${issue.platform}-${issue.locale}`)}.md`;
    const filePath = path.join(outDir, fileName);
    await fs.writeFile(filePath, issueMarkdown(issue, contract, sellerBrand));
    csvRows.push([
      contract?.sku || "",
      contract?.name || issue.contract_id,
      issue.platform,
      issue.locale || "",
      fields.title || "",
      (fields.bullets || fields.selling_points || []).join(" | "),
      fields.description || "",
      fields.search_terms || "",
      fields.seo_title || "",
      fields.seo_description || "",
      issue.issue_id,
    ]);
    await client.records.changeRequest({
      recordId: row.__recordId,
      operation: "update",
      fields: toBusabaseFields({ ...baseIssueFields(row), status: "done", updated_at: now }),
      message: `Export issue ${issue.issue_id}`,
      author: "kelly-legal-contracts-export",
      baseCommitId: row.__headCommitId,
      autoMerge: true,
    });
    console.log(`Exported Issue #${issue.ref} -> ${filePath}`);
  }

  const csvPath = path.join(outDir, "issues.csv");
  await fs.writeFile(csvPath, `${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`);
  console.log(`Wrote ${csvPath}`);
  console.log(
    `Done: ${exportableRows.length} issue(s) exported to ${outDir}. External sends remain approval-gated and delegated to the agent.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
