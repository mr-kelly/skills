#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoStatePayload } from "../app/server/demo.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const out = path.join(dataDir, "launch_snapshot.json");
const now = new Date().toISOString();

const snapshot = demoStatePayload({ demo: "overview" }).snapshot as Record<string, unknown>;
snapshot.generated_at = now;
snapshot.source = "kelly-launch-demo";

await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(`Wrote ${out}`);
