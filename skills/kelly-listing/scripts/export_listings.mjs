#!/usr/bin/env node
// Trusted export step. Kelly Listing's AirApp only ever writes a review
// decision onto a draft record — the browser cannot write to the local
// filesystem. This script re-reads Busabase for genuinely approved drafts
// and exports each as a clean Markdown document plus a flat-file-ready
// listings.csv. listingMarkdown()/csvCell()/PLATFORM_LABELS/slugify() are
// ported verbatim (same headings, same table shape, same CSV columns, same
// footer) from the retired scripts/export_listings.ts; only the read source
// changed, from a persisted content/kelly-listing-app/.data/listing_snapshot.json + decisions.json
// to Busabase's products/drafts Bases.
//
// A draft is exportable only when its decision_action is a genuine "approve"
// (written exclusively by the review queue's decideDraft()) — not merely
// because status happens to read "approved"/"done". This preserves the
// retired script's safety property: an agent ingesting a payload with
// status: "approved" directly (scripts/ingest_drafts.mjs) can never spoof an
// export; only a real human approve decision can. Re-running is idempotent
// (decision_action stays "approve" after export, so the file is simply
// regenerated).
//
// Usage: node scripts/export_listings.mjs [--out /path/to/dir]
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-listing-app/app/js/config.js";
import { normalizeDraftRow, normalizeProductRow } from "../content/kelly-listing-app/app/js/listing-model.js";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log(`Usage: node scripts/export_listings.mjs [--out /path/to/dir]

Reads drafts with a genuine "approve" decision from Busabase and writes one
Markdown document per listing plus listings.csv into --out (default:
<skill>/exports, gitignored). Marks each exported draft "done" in Busabase.
Publishing via platform APIs remains the agent's job outside the app after
explicit approval.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

function baseDraftFields(row) {
  return {
    draft_id: row.draft_id,
    ref: row.ref,
    product_id: row.product_id,
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

// ---- Ported verbatim from the retired scripts/export_listings.ts ----

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

function listingMarkdown(draft, product, sellerBrand) {
  const fields = draft.fields || {};
  const lines = [];
  lines.push(`# ${fields.title || product?.name || draft.draft_id}`);
  lines.push("");
  lines.push("| | |");
  lines.push("| --- | --- |");
  lines.push(`| Brand | ${sellerBrand || ""} |`);
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
    throw new Error("Kelly Listing Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [draftRows, productRows, settingsRows] = await Promise.all([
    readAll(client, declared("drafts")),
    readAll(client, declared("products")),
    readAll(client, declared("settings")),
  ]);
  if (!draftRows.length) {
    console.log("No drafts found. Nothing to export.");
    return;
  }
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const sellerBrand = settings.seller_brand || "";
  const productsById = new Map(productRows.map((row) => [row.product_id, normalizeProductRow(row)]));

  // Exportable only when a genuine human "approve" decision was recorded —
  // see the module doc comment for why this is not simply status === "approved".
  const exportableRows = draftRows.filter((row) => row.decision_action === "approve");
  if (!exportableRows.length) {
    console.log("No approved drafts to export.");
    return;
  }

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

  const now = new Date().toISOString();
  for (const row of exportableRows) {
    const draft = normalizeDraftRow(row);
    const product = productsById.get(draft.product_id);
    const fields = draft.fields;
    const fileName = `${slugify(`${sellerBrand}-${product?.name || draft.product_id}-${draft.platform}-${draft.locale}`)}.md`;
    const filePath = path.join(outDir, fileName);
    await fs.writeFile(filePath, listingMarkdown(draft, product, sellerBrand));
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
    await client.records.changeRequest({
      recordId: row.__recordId,
      operation: "update",
      fields: toBusabaseFields({ ...baseDraftFields(row), status: "done", updated_at: now }),
      message: `Export listing ${draft.draft_id}`,
      author: "kelly-listing-export",
      baseCommitId: row.__headCommitId,
      autoMerge: true,
    });
    console.log(`Exported Draft #${draft.ref} -> ${filePath}`);
  }

  const csvPath = path.join(outDir, "listings.csv");
  await fs.writeFile(csvPath, `${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`);
  console.log(`Wrote ${csvPath}`);
  console.log(
    `Done: ${exportableRows.length} listing(s) exported to ${outDir}. Publishing via platform APIs is handed off to the agent.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
