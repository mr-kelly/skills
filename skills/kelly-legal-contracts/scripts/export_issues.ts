#!/usr/bin/env node
// Exports approved contract issues as clean legal-review files: one Markdown
// issue memo per approved issue plus issues.csv (counterparty, workstream,
// jurisdiction, issue title, risk notes, fallback language). Reads the snapshot plus
// decisions.json (a fresh "approve" decision counts), writes into --out
// (default: <skill>/exports, gitignored), records export_issue_list entries in
// execution_report.json, and marks exported drafts/review items "done".
// External sends, filings, or redline delivery remain the agent's job outside
// the app after explicit approval.
//
// Usage: node scripts/export_issues.ts [--out /path/to/dir]
import fs from "node:fs/promises";
import path from "node:path";
import { createProvider } from "../lib/data-provider/index.ts";

const provider = await createProvider();
const skillDir = path.resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const outDir = outFlag !== -1 && args[outFlag + 1] ? path.resolve(args[outFlag + 1]) : path.join(skillDir, "exports");

const lock = await provider.readLock();
if (lock) {
  console.error(`Refusing to export: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const snapshot = await provider.readSnapshot();
if (!snapshot || !Array.isArray(snapshot.drafts)) {
  console.error("No snapshot found. Nothing to export.");
  process.exit(1);
}
const decisions = (await provider.readDecisions()).decisions || {};

function reviewFor(draft) {
  return (snapshot.review_items || []).find((item) => item.draft_id === draft.draft_id) || null;
}

function effectiveStatus(draft) {
  const item = reviewFor(draft);
  const decision = item ? decisions[item.review_id] : null;
  if (decision?.action === "approve") return "approved";
  if (decision?.action === "block") return "blocked";
  if (decision?.action === "request_changes") return "changes_requested";
  return draft.status;
}

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

function issueMarkdown(draft, product) {
  const fields = draft.fields || {};
  const lines = [];
  lines.push(`# ${fields.title || product?.name || draft.draft_id}`);
  lines.push("");
  lines.push("| | |");
  lines.push("| --- | --- |");
  lines.push(`| Company | ${snapshot.seller?.brand || ""} |`);
  lines.push(`| Contract | ${product?.name || draft.product_id} |`);
  lines.push(`| Counterparty | ${product?.sku || ""} |`);
  lines.push(`| Workstream | ${PLATFORM_LABELS[draft.platform] || draft.platform} |`);
  lines.push(`| Jurisdiction | ${draft.locale || ""} |`);
  lines.push(`| Risk score | ${draft.compliance_score} |`);
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
    `Exported by kelly-legal-contracts on ${new Date().toISOString()} (Issue #${draft.ref}, ${draft.draft_id}). External sending or redline delivery is executed by the agent only after approval.`,
    "",
  );
  return lines.join("\n");
}

const productsById = new Map<string, any>((snapshot.products || []).map((product) => [product.product_id, product]));
const exportable = (snapshot.drafts || []).filter((draft) => ["approved", "done"].includes(effectiveStatus(draft)));
if (!exportable.length) {
  console.log("No approved drafts to export.");
  process.exit(0);
}

const now = new Date().toISOString();
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
    "draft_id",
  ],
];
const results = [];

for (const draft of exportable) {
  const product = productsById.get(draft.product_id);
  const fields = draft.fields || {};
  const fileName = `${slugify(`${snapshot.seller?.brand || ""}-${product?.name || draft.product_id}-${draft.platform}-${draft.locale}`)}.md`;
  const filePath = path.join(outDir, fileName);
  await fs.writeFile(filePath, issueMarkdown(draft, product));
  csvRows.push([
    product?.sku || "",
    product?.name || draft.product_id,
    draft.platform,
    draft.locale || "",
    fields.title || "",
    (fields.bullets || fields.selling_points || []).join(" | "),
    fields.description || "",
    fields.search_terms || "",
    fields.seo_title || "",
    fields.seo_description || "",
    draft.draft_id,
  ]);
  const item = reviewFor(draft);
  results.push({
    review_id: item?.review_id || "",
    draft_id: draft.draft_id,
    ref: draft.ref,
    status: "executed",
    operation: "export_issue_list",
    target: filePath,
    detail: "Markdown issue memo and CSV row written.",
    executed_at: now,
  });
  draft.status = "done";
  draft.updated_at = now;
  if (item) item.status = "done";
  console.log(`Exported Issue #${draft.ref} -> ${filePath}`);
}

const csvPath = path.join(outDir, "issues.csv");
await fs.writeFile(csvPath, `${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`);
console.log(`Wrote ${csvPath}`);

// Merge export results into the execution report, idempotently by
// draft_id:operation, preserving unrelated history.
const previousReport = await provider.readExecutionReport();
const kept = (previousReport?.results || []).filter(
  (entry) => !results.some((result) => result.draft_id === entry.draft_id && result.operation === entry.operation),
);
const report = {
  executed_at: now,
  dry_run: false,
  source: "kelly-legal-contracts",
  results: [...kept, ...results],
};
await provider.writeExecutionReport(report);

snapshot.metrics = {
  ...snapshot.metrics,
  drafts_approved: (snapshot.drafts || []).filter((draft) => ["approved", "done"].includes(draft.status)).length,
  exported_this_week: (snapshot.drafts || []).filter(
    (draft) => draft.status === "done" && Date.parse(draft.updated_at || "") >= Date.now() - 7 * 24 * 3600 * 1000,
  ).length,
};
snapshot.generated_at = now;
snapshot.activity_log = [
  {
    id: `act-${Date.now()}-export`,
    at: now,
    actor: "agent",
    detail: `Exported ${exportable.length} contract issue(s) to ${outDir}.`,
  },
  ...(snapshot.activity_log || []),
].slice(0, 50);
await provider.writeSnapshot(snapshot);

console.log(
  `Done: ${exportable.length} contract issue(s) exported to ${outDir}. External sends remain approval-gated and delegated to the agent.`,
);
