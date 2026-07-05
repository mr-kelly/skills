#!/usr/bin/env node
// Write the deterministic demo fund snapshot to app/.data/snapshot.json so the
// dashboard has offline data to render without any private ledger. This reuses
// the same demo builder the API serves at ?demo=1, keeping the two in sync.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoStatePayload } from "../app/server/demo.ts";
import { computeInsights } from "../app/server/insights.ts";
import type { FundSnapshot } from "../app/server/types.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(skillDir, "app", ".data", "snapshot.json");

const snapshot = demoStatePayload({ demo: "overview" }).snapshot as FundSnapshot;
snapshot.insights = computeInsights(snapshot, 20);

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify(snapshot, null, 2));
console.log(`Wrote ${out}`);
console.log(
  `Balance ${snapshot.totals.balance} · care share ${(
    (snapshot.totals.care_total / (snapshot.totals.expense_total || 1)) * 100
  ).toFixed(1)}%`,
);
