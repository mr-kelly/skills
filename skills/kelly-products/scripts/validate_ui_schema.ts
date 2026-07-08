#!/usr/bin/env node
import fs from "node:fs/promises";
import { SNAPSHOT_PATH } from "../app/server/paths.ts";

const file = process.argv[2] || SNAPSHOT_PATH;
const snapshot = JSON.parse(await fs.readFile(file, "utf8"));

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(snapshot.schema_version === "1", "schema_version must be 1");
assert(Array.isArray(snapshot.products), "products must be an array");
assert(Array.isArray(snapshot.channel_matrix), "channel_matrix must be an array");
assert(Array.isArray(snapshot.inventory), "inventory must be an array");
assert(Array.isArray(snapshot.review_items), "review_items must be an array");

const productIds = new Set(snapshot.products.map((product: { product_id?: string }) => product.product_id));
for (const product of snapshot.products) {
  assert(product.product_id, "product.product_id is required");
  assert(product.sku, `sku is required for ${product.product_id}`);
  assert(product.name, `name is required for ${product.product_id}`);
  assert(product.image, `image is required for ${product.product_id}`);
  assert(product.pricing?.gross_margin_pct !== undefined, `gross_margin_pct is required for ${product.product_id}`);
  assert(product.inventory?.on_hand !== undefined, `inventory.on_hand is required for ${product.product_id}`);
}
for (const item of [...snapshot.channel_matrix, ...snapshot.inventory, ...snapshot.review_items]) {
  assert(productIds.has(item.product_id), `unknown product_id: ${item.product_id}`);
}

console.log(`Valid kelly-products snapshot: ${file}`);
