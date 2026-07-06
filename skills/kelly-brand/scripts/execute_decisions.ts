#!/usr/bin/env node
// Dry-run-by-default executor. Reads adopted (approved) narrative assets and
// resolved drift decisions through the data provider, re-checks the agent lock,
// and records concrete operations in the execution report. It performs NO
// external side effects: promotion to the canonical narrative registry and
// channel export are the skill's responsibility post-approval, per SKILL.md.
//
// Storage is reached only through the data provider, so this script honours
// KELLY_BRAND_DATA_PROVIDER=local|busabase just like the server.
import { createProvider } from "../lib/data-provider/index.ts";
import { executionReportPath } from "../lib/paths.ts";

const apply = process.argv.includes("--apply");

interface Lock {
  owner?: string;
  message?: string;
}

interface Decision {
  action?: string;
  comment?: string;
  draft?: string;
}

interface Item {
  item_id: string;
  ref?: number;
  type?: string;
  title?: string;
  status?: string;
  draft?: string;
}

interface DriftAlert {
  alert_id: string;
  channel_id?: string;
  title?: string;
  status?: string;
}

interface Snapshot {
  items?: Item[];
  drift_alerts?: DriftAlert[];
}

interface ExecutionResultItem {
  item_id: string;
  ref?: number;
  status: string;
  operation: string;
  registry?: string;
  channel?: string;
  target?: string;
  comment?: string;
  reason?: string;
  executed_at: string;
}

interface ExecutionReport {
  results?: ExecutionResultItem[];
}

const provider = await createProvider();

const lock = (await provider.getLock()) as Lock | null;
if (lock) {
  console.error(`Refusing to execute: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const snapshot = (await provider.getSnapshot()) as Snapshot | null;
if (!snapshot || !Array.isArray(snapshot.items)) {
  console.error("No snapshot available from the data provider. Nothing to execute.");
  process.exit(1);
}

const decisions = ((await provider.getDecisions())?.decisions || {}) as Record<string, Decision>;
const previousReport = (await provider.getExecutionReport()) as ExecutionReport | null;
const alreadyDone = new Set(
  (previousReport?.results || [])
    .filter((item) => item.status === "promoted" || item.status === "resolved")
    .map((item) => item.item_id),
);

const now = new Date().toISOString();
const results: ExecutionResultItem[] = [];

// Adopt approved narrative assets into the canonical registry.
for (const item of snapshot.items || []) {
  const decision = decisions[item.item_id];
  if (!decision || decision.action !== "approve") continue;
  if (item.status === "done" || alreadyDone.has(item.item_id)) {
    results.push({
      item_id: item.item_id,
      ref: item.ref,
      status: "skipped",
      operation: "none",
      reason: "Already promoted or marked done; skipping to stay idempotent.",
      executed_at: now,
    });
    continue;
  }
  results.push({
    item_id: item.item_id,
    ref: item.ref,
    status: apply ? "promoted" : "dry_run",
    operation: "promote_to_canonical",
    registry: "narrative",
    target: `canonical/${item.type || "asset"}/${item.item_id}`,
    comment: decision.comment || "",
    reason: `Adopt "${item.title || item.item_id}" into the canonical brand narrative.`,
    executed_at: now,
  });
}

// Record approved drift fixes.
for (const alert of snapshot.drift_alerts || []) {
  const decision = decisions[alert.alert_id];
  if (!decision || decision.action !== "resolve_drift") continue;
  if (alreadyDone.has(alert.alert_id)) {
    results.push({
      item_id: alert.alert_id,
      status: "skipped",
      operation: "none",
      reason: "Drift already resolved; skipping to stay idempotent.",
      executed_at: now,
    });
    continue;
  }
  results.push({
    item_id: alert.alert_id,
    status: apply ? "resolved" : "dry_run",
    operation: "resolve_drift",
    channel: alert.channel_id || "",
    reason: `Approved fix for drift: ${alert.title || alert.alert_id}.`,
    comment: decision.comment || "",
    executed_at: now,
  });
}

if (!results.length) {
  console.log("No adopted assets or approved drift fixes to execute.");
  process.exit(0);
}

for (const result of results) {
  console.log(
    `${result.ref ? `#${result.ref} ` : ""}${result.item_id}: ${result.status} ${result.operation}${result.target ? ` -> ${result.target}` : ""}`,
  );
}

if (!apply) {
  console.log(`Dry run only (${results.length} operation(s)). Re-run with --apply to write ${executionReportPath}.`);
  process.exit(0);
}

// Preserve history so repeated --apply runs stay idempotent.
const freshlyDone = new Set(
  results.filter((item) => item.status === "promoted" || item.status === "resolved").map((item) => item.item_id),
);
const carriedForward = (previousReport?.results || []).filter(
  (item) => (item.status === "promoted" || item.status === "resolved") && !freshlyDone.has(item.item_id),
);
const carriedIds = new Set(carriedForward.map((item) => item.item_id));
const report = {
  executed_at: now,
  dry_run: false,
  source: "kelly-brand",
  results: [
    ...carriedForward,
    ...results.filter((item) => !(item.status === "skipped" && carriedIds.has(item.item_id))),
  ],
};
await provider.writeExecutionReport(report);
console.log(
  `Wrote ${executionReportPath}. Canonical promotion and channel export are performed by the skill per SKILL.md.`,
);
