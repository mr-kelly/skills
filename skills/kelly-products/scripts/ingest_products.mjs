#!/usr/bin/env node
// Trusted hand-off step. Kelly Products's AirApp never ingests a product
// itself -- the browser cannot read an arbitrary local file path, a
// marketplace export, or an inventory CSV. This script reads a JSON payload
// file shaped like the retired content/kelly-products-app/.data/products_snapshot.json contract
// ({ seller, products: [...], channel_matrix: [...], inventory: [...],
// review_items: [...] }) and upserts every row into Busabase by natural key
// (product_id, channel_id, inventory_id, item_id) so re-ingests are
// idempotent. The seller/platforms/warehouses/review_policy/sync summary is
// upserted into the single Settings row when `seller`, `platforms`,
// `warehouses`, `review_policy`, or `sync` are present in the payload.
//
// Usage: node scripts/ingest_products.mjs <payload.json> [--apply]
// Without --apply this is a dry run that only prints what would be written.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-products-app/app/js/config.js";
import {
  channelToFields,
  inventoryToFields,
  productToFields,
  reviewToFields,
} from "../content/kelly-products-app/app/js/products-model.js";

function help() {
  console.log(`Usage: node scripts/ingest_products.mjs <payload.json> [--apply]

Reads a JSON payload shaped like the retired products_snapshot.json contract
({ seller, products: [...], channel_matrix: [...], inventory: [...],
review_items: [...] }) and upserts every row into Busabase by natural key.
Without --apply this is a dry run that only prints what would be written.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

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

async function upsert(client, declared, existing, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-products-ingest",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-products-ingest",
    autoMerge: true,
  });
  return "created";
}

function summarize(created, updated, label) {
  if (created || updated) console.log(`${label}: ${created} created, ${updated} updated`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const apply = argv.includes("--apply");
  const payloadPath = argv.find((arg) => !arg.startsWith("--"));
  if (!payloadPath) return help();

  const payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
  const incomingProducts = payload.products || [];
  const incomingChannels = payload.channel_matrix || payload.channels || [];
  const incomingInventory = payload.inventory || [];
  const incomingReviewItems = payload.review_items || [];

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Products Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [existingProducts, existingChannels, existingInventory, existingReviewItems, existingSettings] =
    await Promise.all([
      readAll(client, declared("products")),
      readAll(client, declared("channels")),
      readAll(client, declared("inventory")),
      readAll(client, declared("review")),
      readAll(client, declared("settings")),
    ]);

  const productsById = new Map(existingProducts.map((row) => [row.product_id, row]));
  let nextProductRef = Math.max(0, ...existingProducts.map((row) => Number(row.ref) || 0)) + 1;
  const now = new Date().toISOString();

  let productsCreated = 0;
  let productsUpdated = 0;
  for (const input of incomingProducts) {
    if (!input.product_id) throw new Error("Every product needs a product_id");
    const existing = productsById.get(input.product_id);
    const fields = productToFields({
      ...existing,
      ...input,
      ref: existing ? existing.ref : nextProductRef++,
      created_at: existing?.created_at || input.created_at || now,
      updated_at: now,
    });
    const result = await upsert(
      client,
      declared("products"),
      existing,
      fields,
      `${existing ? "Update" : "Ingest"} product ${input.product_id}`,
      apply,
    );
    if (result === "created" || result === "would_create") productsCreated += 1;
    else productsUpdated += 1;
    console.log(
      `${apply ? result : `would ${result.replace("would_", "")}`} ${input.product_id} — ${input.name || ""}`,
    );
  }
  summarize(productsCreated, productsUpdated, "products");

  const channelsById = new Map(
    existingChannels.map((row) => [row.channel_id || `${row.product_id}__${row.platform}`, row]),
  );
  let channelsCreated = 0;
  let channelsUpdated = 0;
  for (const input of incomingChannels) {
    const channelId = input.channel_id || `${input.product_id}__${input.platform}`;
    const existing = channelsById.get(channelId);
    const fields = channelToFields({ ...existing, ...input, channel_id: channelId, updated_at: now });
    const result = await upsert(
      client,
      declared("channels"),
      existing,
      fields,
      `${existing ? "Update" : "Ingest"} channel row ${channelId}`,
      apply,
    );
    if (result === "created" || result === "would_create") channelsCreated += 1;
    else channelsUpdated += 1;
  }
  summarize(channelsCreated, channelsUpdated, "channel_matrix");

  const inventoryById = new Map(
    existingInventory.map((row) => [row.inventory_id || `${row.product_id}__${row.warehouse_id}`, row]),
  );
  let inventoryCreated = 0;
  let inventoryUpdated = 0;
  for (const input of incomingInventory) {
    const inventoryId = input.inventory_id || `${input.product_id}__${input.warehouse_id}`;
    const existing = inventoryById.get(inventoryId);
    const fields = inventoryToFields({ ...existing, ...input, inventory_id: inventoryId, updated_at: now });
    const result = await upsert(
      client,
      declared("inventory"),
      existing,
      fields,
      `${existing ? "Update" : "Ingest"} inventory row ${inventoryId}`,
      apply,
    );
    if (result === "created" || result === "would_create") inventoryCreated += 1;
    else inventoryUpdated += 1;
  }
  summarize(inventoryCreated, inventoryUpdated, "inventory");

  const reviewById = new Map(existingReviewItems.map((row) => [row.item_id, row]));
  let nextReviewRef = Math.max(0, ...existingReviewItems.map((row) => Number(row.ref) || 0)) + 1;
  let reviewCreated = 0;
  let reviewUpdated = 0;
  for (const input of incomingReviewItems) {
    if (!input.item_id) throw new Error("Every review item needs an item_id");
    const existing = reviewById.get(input.item_id);
    const fields = reviewToFields({
      ...existing,
      ...input,
      ref: existing ? existing.ref : nextReviewRef++,
      // Never let a re-ingest clobber a human decision already recorded on
      // this row -- only the AirApp's decideReview() writes status/
      // decision_note/decided_at once a verdict exists.
      status: existing?.decided_at ? existing.status : input.status || existing?.status || "needs_review",
      decision_note: existing?.decision_note || "",
      decided_at: existing?.decided_at || "",
      created_at: existing?.created_at || input.created_at || now,
      updated_at: now,
    });
    const result = await upsert(
      client,
      declared("review"),
      existing,
      fields,
      `${existing ? "Update" : "Ingest"} review item ${input.item_id}`,
      apply,
    );
    if (result === "created" || result === "would_create") reviewCreated += 1;
    else reviewUpdated += 1;
  }
  summarize(reviewCreated, reviewUpdated, "review_items");

  if (payload.seller || payload.platforms || payload.warehouses || payload.review_policy || payload.sync) {
    const existing = existingSettings.find((row) => row.record_id === "config");
    const fields = {
      "record-id": "config",
      "seller-brand": payload.seller?.brand ?? existing?.seller_brand ?? "",
      "seller-entity": payload.seller?.entity ?? existing?.seller_entity ?? "",
      "base-currency": payload.seller?.base_currency ?? existing?.base_currency ?? "USD",
      platforms: JSON.stringify(payload.platforms || JSON.parse(existing?.platforms || "[]")),
      warehouses: JSON.stringify(payload.warehouses || JSON.parse(existing?.warehouses || "[]")),
      "review-policy": JSON.stringify(payload.review_policy || JSON.parse(existing?.review_policy || "{}")),
      sync: JSON.stringify(payload.sync || JSON.parse(existing?.sync || "{}")),
      "updated-at": now,
    };
    if (!apply) {
      console.log(`would ${existing ? "update" : "create"} settings row`);
    } else if (existing) {
      await client.records.changeRequest({
        recordId: existing.__recordId,
        operation: "update",
        fields,
        message: "Update settings",
        author: "kelly-products-ingest",
        baseCommitId: existing.__headCommitId,
        autoMerge: true,
      });
      console.log("updated settings row");
    } else {
      await client.bases.createChangeRequest({
        baseId: declared("settings").baseId,
        fields,
        message: "Ingest settings",
        submittedBy: "kelly-products-ingest",
        autoMerge: true,
      });
      console.log("created settings row");
    }
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write to Busabase.");
  } else {
    console.log("Wrote products/channels/inventory/review_items to Busabase.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
