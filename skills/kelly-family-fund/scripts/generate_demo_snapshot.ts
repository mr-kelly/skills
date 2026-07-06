#!/usr/bin/env node
// Write the deterministic demo fund snapshot to app/.data/snapshot.json so the
// dashboard has offline data to render without any private ledger. This reuses
// the same demo builder the API serves at ?demo=1, keeping the two in sync.
import { demoStatePayload } from "../app/server/demo.ts";
import { computeInsights } from "../app/server/insights.ts";
import type { FundSnapshot } from "../app/server/types.ts";
import { createProvider } from "../lib/data-provider/index.ts";
import { snapshotPath } from "../lib/paths.ts";

const out = snapshotPath;

const snapshot = demoStatePayload({ demo: "overview" }).snapshot as FundSnapshot;
snapshot.insights = computeInsights(snapshot, 20);

const provider = await createProvider();
await provider.writeSnapshot(snapshot);
console.log(`Wrote ${out}`);
console.log(
  `Balance ${snapshot.totals.balance} · care share ${(
    (snapshot.totals.care_total / (snapshot.totals.expense_total || 1)) * 100
  ).toFixed(1)}%`,
);
