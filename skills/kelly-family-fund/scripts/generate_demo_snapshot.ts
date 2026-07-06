#!/usr/bin/env node
// Write the deterministic demo fund snapshot to app/.data/snapshot.json so the
// dashboard has offline data to render without any private ledger. This reuses
// the same demo builder the API serves at ?demo=1, keeping the two in sync.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoStatePayload } from "../app/server/demo.ts";
import { computeInsights } from "../app/server/insights.ts";
import type { FundSnapshot } from "../app/server/types.ts";
import { createProvider } from "../lib/data-provider/index.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const provider = await createProvider();

const snapshot = demoStatePayload({ demo: "overview" }).snapshot as FundSnapshot;
snapshot.insights = computeInsights(snapshot, 20);

await provider.putSnapshot(snapshot);
const out =
  provider.kind === "local" ? path.join(skillDir, "app", ".data", "snapshot.json") : `${provider.kind} provider`;
console.log(`Wrote ${out}`);
console.log(
  `Balance ${snapshot.totals.balance} · care share ${(
    (snapshot.totals.care_total / (snapshot.totals.expense_total || 1)) * 100
  ).toFixed(1)}%`,
);
