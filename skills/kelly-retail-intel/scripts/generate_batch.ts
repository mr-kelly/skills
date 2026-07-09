#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeDemoBatch } from "../app/server/demo.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(skillDir, "app", ".data", "current_batch.json");
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(makeDemoBatch(), null, 2)}\n`);
console.log(`Wrote ${outPath}`);
