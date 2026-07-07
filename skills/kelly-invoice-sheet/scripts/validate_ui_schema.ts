#!/usr/bin/env node
import fs from "node:fs/promises";
import { createProvider } from "../lib/data-provider/index.ts";
import { validateBatchShape } from "../lib/invoice-schema.ts";

const file = process.argv[2];
const batch = file ? JSON.parse(await fs.readFile(file, "utf8")) : await (await createProvider()).readBatch();
const result = validateBatchShape(batch);

for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
if (!result.ok) {
  for (const error of result.errors) console.error(`Error: ${error}`);
  process.exitCode = 1;
} else {
  const count = Array.isArray(batch.invoices) ? batch.invoices.length : 0;
  console.log(`Invoice batch schema OK (${count} invoices).`);
}
