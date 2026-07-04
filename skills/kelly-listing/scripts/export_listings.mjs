#!/usr/bin/env node
// Exports approved drafts as clean upload-ready files: one Markdown document
// per listing plus a flat-file-ish listings.csv (sku, platform, locale,
// title, bullets joined, description, search terms). Reads the snapshot plus
// decisions.json (a fresh "approve" decision counts), writes into --out
// (default: <skill>/exports, gitignored), records export_listing entries in
// execution_report.json, and marks exported drafts/review items "done".
// Actual publishing via platform APIs is the agent's job outside the app.
//
// Usage: node scripts/export_listings.mjs [--out /path/to/dir]
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const snapshotPath = path.join(dataDir, "listing_snapshot.json");
const decisionsPath = path.join(dataDir, "decisions.json");
const reportPath = path.join(dataDir, "execution_report.json");
const lockPath = path.join(dataDir, "agent.lock");

const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const outDir = outFlag !== -1 && args[outFlag + 1] ? path.resolve(args[outFlag + 1]) : path.join(skillDir, "exports");

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

const lock = await readJson(lockPath);
if (lock) {
  console.error(`Refusing to export: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const snapshot = await readJson(snapshotPath);
if (!snapshot) {
  console.error(`No snapshot at ${snapshotPath}. Nothing to export.`);
  process.exit(1);
}
const decisions = (await readJson(decisionsPath, { decisions: {} })).decisions || {};

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
      .slice(0, 72) || "listing"
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const PLATFORM_LABELS = { amazon: "Amazon", shopify: "Shopify", tiktok_shop: "TikTok Shop", ebay: "eBay" };

function listingMarkdown(draft, product) {
  const fields = draft.fields || {};
  const lines = [];
  lines.push(`# ${fields.title || product?.name || draft.draft_id}`);
  lines.push("");
  lines.push("| | |");
  lines.push("| --- | --- |");
  lines.push(`| Brand | ${snapshot.seller?.brand || ""} |`);
  lines.push(`| Product | ${product?.name || draft.product_id} |`);
  lines.push(`| SKU | ${product?.sku || ""} |`);
  lines.push(`| Platform | ${PLATFORM_LABELS[draft.platform] || draft.platform} |`);
  lines.push(`| Locale | ${draft.locale || ""} |`);
  lines.push(`| Compliance score | ${draft.compliance_score} |`);
  lines.push("");
  if (fields.subtitle) lines.push("## Subtitle", "", fields.subtitle, "");
  if (fields.bullets?.length) {
    lines.push("## Bullet Points", "", ...fields.bullets.map((bullet) => `- ${bullet}`), "");
  }
  if (fields.selling_points?.length) {
    lines.push("## Selling Points", "", ...fields.selling_points.map((point) => `- ${point}`), "");
  }
  if (fields.description) lines.push("## Description", "", fields.description, "");
  if (fields.search_terms) lines.push("## Backend Search Terms", "", "```", fields.search_terms, "```", "");
  if (fields.seo_title || fields.seo_description) {
    lines.push("## SEO Meta", "");
    if (fields.seo_title) lines.push(`- SEO title: ${fields.seo_title}`);
    if (fields.seo_description) lines.push(`- SEO description: ${fields.seo_description}`);
    lines.push("");
  }
  if (fields.item_specifics?.length) {
    lines.push("## Item Specifics", "", "| Name | Value |", "| --- | --- |");
    for (const entry of fields.item_specifics) lines.push(`| ${entry.name} | ${entry.value} |`);
    lines.push("");
  }
  if (fields.aplus_outline?.length) {
    lines.push("## A+ Content Outline", "", ...fields.aplus_outline.map((module) => `- ${module}`), "");
  }
  lines.push(
    "---",
    "",
    `Exported by kelly-listing on ${new Date().toISOString()} (Draft #${draft.ref}, ${draft.draft_id}). Publishing via platform APIs is executed by the agent after approval.`,
    "",
  );
  return lines.join("\n");
}

const productsById = new Map((snapshot.products || []).map((product) => [product.product_id, product]));
const exportable = (snapshot.drafts || []).filter((draft) => ["approved", "done"].includes(effectiveStatus(draft)));
if (!exportable.length) {
  console.log("No approved drafts to export.");
  process.exit(0);
}

const now = new Date().toISOString();
await fs.mkdir(outDir, { recursive: true });
const csvRows = [
  [
    "sku",
    "product",
    "platform",
    "locale",
    "title",
    "bullets",
    "description",
    "search_terms",
    "seo_title",
    "seo_description",
    "draft_id",
  ],
];
const results = [];

for (const draft of exportable) {
  const product = productsById.get(draft.product_id);
  const fields = draft.fields || {};
  const fileName = `${slugify(`${snapshot.seller?.brand || ""}-${product?.name || draft.product_id}-${draft.platform}-${draft.locale}`)}.md`;
  const filePath = path.join(outDir, fileName);
  await fs.writeFile(filePath, listingMarkdown(draft, product));
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
    operation: "export_listing",
    target: filePath,
    detail: "Markdown document and CSV row written.",
    executed_at: now,
  });
  draft.status = "done";
  draft.updated_at = now;
  if (item) item.status = "done";
  console.log(`Exported Draft #${draft.ref} -> ${filePath}`);
}

const csvPath = path.join(outDir, "listings.csv");
await fs.writeFile(csvPath, `${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`);
console.log(`Wrote ${csvPath}`);

// Merge export results into the execution report, idempotently by
// draft_id:operation, preserving unrelated history.
const previousReport = await readJson(reportPath);
const kept = (previousReport?.results || []).filter(
  (entry) => !results.some((result) => result.draft_id === entry.draft_id && result.operation === entry.operation),
);
const report = {
  executed_at: now,
  dry_run: false,
  source: "kelly-listing",
  results: [...kept, ...results],
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

snapshot.metrics = {
  ...snapshot.metrics,
  drafts_approved: (snapshot.drafts || []).filter((draft) => ["approved", "done"].includes(draft.status)).length,
  exported_this_week: (snapshot.drafts || []).filter(
    (draft) => draft.status === "done" && Date.parse(draft.updated_at || 0) >= Date.now() - 7 * 24 * 3600 * 1000,
  ).length,
};
snapshot.generated_at = now;
snapshot.activity_log = [
  {
    id: `act-${Date.now()}-export`,
    at: now,
    actor: "agent",
    detail: `Exported ${exportable.length} listing(s) to ${outDir}.`,
  },
  ...(snapshot.activity_log || []),
].slice(0, 50);
await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(
  `Done: ${exportable.length} listing(s) exported to ${outDir}. Publishing via platform APIs is handed off to the agent.`,
);
