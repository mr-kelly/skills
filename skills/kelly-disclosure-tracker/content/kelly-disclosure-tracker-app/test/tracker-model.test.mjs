import assert from "node:assert/strict";
import test from "node:test";

import {
  ITEM_TEMPLATES,
  ROLE_ORDER,
  VALID_ACTIONS,
  VEHICLE_SEEDS,
  assembleBatch,
  buildConfigSummary,
  buildSeedData,
  computeBatchMetrics,
  computeItemFromRow,
  computeItemStatus,
  computeReadiness,
  computeVehicleMetrics,
  finalizeItem,
  findSettingsRow,
  runMetaFromSettings,
  seedIndex,
} from "../app/js/tracker-model.js";

test("VEHICLE_SEEDS/ITEM_TEMPLATES: fixed 9-vehicle x 6-item mock portfolio stays within Base readLimits", () => {
  assert.equal(VEHICLE_SEEDS.length, 9);
  assert.equal(ITEM_TEMPLATES.length, 6);
  assert.equal(ROLE_ORDER.length, 3);
});

test("computeItemStatus(): undecided item defaults to needs_review", () => {
  assert.equal(computeItemStatus({}), "needs_review");
  assert.equal(computeItemStatus({ decision: null }), "needs_review");
});

test("computeItemStatus(): hand-worked decision -> status mapping", () => {
  assert.equal(computeItemStatus({ decision: { action: "verified" } }), "done");
  assert.equal(computeItemStatus({ decision: { action: "needs_source" } }), "changes_requested");
  assert.equal(computeItemStatus({ decision: { action: "flagged" } }), "blocked");
});

test("computeItemStatus(): a verified decision cannot silently settle an unresolved reconciliation mismatch", () => {
  const reconciliation = { field: "aum_usd_millions", match: false };
  // Without an explicit override, "verified" is held at changes_requested.
  assert.equal(computeItemStatus({ decision: { action: "verified" }, reconciliation }), "changes_requested");
  // With the reviewer's explicit override, "verified" settles to done.
  assert.equal(
    computeItemStatus({ decision: { action: "verified", override_reconciliation: true }, reconciliation }),
    "done",
  );
  // A resolved (matching) reconciliation never holds the decision back.
  assert.equal(
    computeItemStatus({ decision: { action: "verified" }, reconciliation: { field: "x", match: true } }),
    "done",
  );
});

test("finalizeItem(): attaches the derived status alongside the raw item fields", () => {
  const item = finalizeItem({ id: "veh-01-aum_statement", decision: { action: "needs_source" } });
  assert.equal(item.status, "changes_requested");
  assert.equal(item.id, "veh-01-aum_statement");
});

test("seedIndex(): deterministic across repeated calls for the same seed", () => {
  assert.equal(seedIndex("veh-01-aum_statement", 10), seedIndex("veh-01-aum_statement", 10));
  assert.ok(seedIndex("veh-01-aum_statement", 10) < 10);
});

test("buildSeedData(): fixed 9-vehicle / 54-item portfolio with a plausible starting mix", () => {
  const { vehicles, items } = buildSeedData({ now: "2026-07-10T09:00:00.000Z" });
  assert.equal(vehicles.length, 9);
  assert.equal(items.length, 54);
  // Every vehicle contributes exactly one item per template/role.
  for (const vehicle of vehicles) {
    const vItems = items.filter((item) => item.vehicle_id === vehicle.vehicle_id);
    assert.equal(vItems.length, 6);
    assert.deepEqual(
      new Set(vItems.map((item) => item.role)),
      new Set(["origination", "fund_manager", "listing_venue"]),
    );
  }
  // Hand-verified against the retired app/server/demo.ts's bucket math (same
  // seedIndex/mismatch rule): exactly 2 vehicles get a flagged reconciliation
  // mismatch on this fixed seed set.
  const blocked = items.filter((item) => item.status === "blocked");
  assert.deepEqual(blocked.map((item) => item.id).sort(), ["veh-05-listing_filing", "veh-07-listing_filing"]);
  for (const item of blocked) {
    assert.equal(item.reconciliation.match, false);
    assert.equal(item.decision.action, "flagged");
  }
});

test("computeVehicleMetrics()/computeReadiness(): hand-worked rollup over a 3-item vehicle", () => {
  const items = [{ status: "done" }, { status: "done" }, { status: "blocked" }];
  const metrics = computeVehicleMetrics(items);
  assert.deepEqual(metrics, { total: 3, needs_review: 0, changes_requested: 0, done: 2, blocked: 1 });
  // Any blocked item makes the vehicle blocked, regardless of the rest.
  assert.equal(computeReadiness(metrics), "blocked");
});

test("computeReadiness(): ready only when every item is done, in_progress otherwise", () => {
  assert.equal(computeReadiness({ total: 3, done: 3, blocked: 0 }), "ready");
  assert.equal(computeReadiness({ total: 3, done: 2, blocked: 0 }), "in_progress");
  assert.equal(computeReadiness({ total: 0, done: 0, blocked: 0 }), "in_progress");
});

test("computeBatchMetrics(): hand-worked portfolio-level rollup over 2 vehicles", () => {
  const items = [
    { status: "done", vehicle_id: "v1" },
    { status: "done", vehicle_id: "v1" },
    { status: "blocked", vehicle_id: "v2" },
    { status: "needs_review", vehicle_id: "v2" },
  ];
  const vehicles = [
    { vehicle_id: "v1", readiness: "ready" },
    { vehicle_id: "v2", readiness: "blocked" },
  ];
  const metrics = computeBatchMetrics(items, vehicles);
  assert.deepEqual(metrics, {
    vehicles_ready: 1,
    vehicles_blocked: 1,
    vehicles_in_progress: 0,
    items_needs_review: 1,
    items_changes_requested: 0,
    items_done: 2,
    items_blocked: 1,
  });
});

test("assembleBatch(): assembles the full Batch shape including per-vehicle metrics/readiness", () => {
  const vehicles = [{ vehicle_id: "v1", name: "Test Vehicle" }];
  const items = [
    finalizeItem({ id: "v1-a", vehicle_id: "v1", decision: { action: "verified" } }),
    finalizeItem({ id: "v1-b", vehicle_id: "v1", decision: { action: "verified" } }),
  ];
  const batch = assembleBatch({ vehicles, items, batchId: "test-batch", generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(batch.batch_id, "test-batch");
  assert.equal(batch.generated_at, "2026-01-01T00:00:00.000Z");
  assert.equal(batch.source, "kelly-disclosure-tracker");
  assert.equal(batch.mode, "app-in-skill");
  assert.equal(batch.vehicles[0].readiness, "ready");
  assert.equal(batch.metrics.vehicles_ready, 1);
});

test("computeItemFromRow(): normalizes a Busabase row (kebab-normalized to snake_case) into the UI item shape", () => {
  const row = {
    item_id: "veh-01-aum_statement",
    vehicle_id: "veh-01",
    role: "fund_manager",
    item_key: "aum_statement",
    title: "AUM statement",
    summary: "summary",
    body: "body",
    category: "fund_manager",
    proposed_action: "reconcile_figures",
    reason: "reason",
    reconciliation: "",
    decision_action: "",
    decision_comment: "",
    decided_at: "",
    override_reconciliation: "",
  };
  const item = computeItemFromRow(row);
  assert.equal(item.id, "veh-01-aum_statement");
  assert.equal(item.status, "needs_review");
  assert.equal(item.decision, undefined);
  assert.equal(item.reconciliation, undefined);
});

test("computeItemFromRow(): carries a recorded decision and reconciliation mismatch through to the UI shape", () => {
  const row = {
    item_id: "veh-05-listing_filing",
    vehicle_id: "veh-05",
    role: "listing_venue",
    item_key: "listing_filing",
    title: "Listing venue filing",
    summary: "summary",
    body: "body",
    category: "listing_venue",
    proposed_action: "reconcile_figures",
    reason: "Reconciliation mismatch",
    reconciliation: JSON.stringify({ field: "aum_usd_millions", match: false, note: "mismatch" }),
    decision_action: "flagged",
    decision_comment: "Escalated.",
    decided_at: "2026-07-10T09:00:00.000Z",
    override_reconciliation: "false",
  };
  const item = computeItemFromRow(row);
  assert.equal(item.status, "blocked");
  assert.deepEqual(item.decision, {
    action: "flagged",
    comment: "Escalated.",
    decided_at: "2026-07-10T09:00:00.000Z",
    override_reconciliation: false,
  });
  assert.equal(item.reconciliation.match, false);
});

test("computeItemFromRow() gives every destructured field a default so a partial row never throws", () => {
  assert.doesNotThrow(() => computeItemFromRow());
  assert.doesNotThrow(() => computeItemFromRow({ item_id: "x" }));
});

test("VALID_ACTIONS: exactly the three decision verdicts", () => {
  assert.deepEqual([...VALID_ACTIONS].sort(), ["flagged", "needs_source", "verified"]);
});

test("findSettingsRow()/buildConfigSummary()/runMetaFromSettings(): read the settings 'config'/'run' rows", () => {
  const settingsRows = [
    { kind: "config", payload: JSON.stringify({ reviewer_name: "Jamie Reviewer" }) },
    { kind: "run", payload: JSON.stringify({ batch_id: "b-1", generated_at: "2026-01-01T00:00:00.000Z" }) },
  ];
  assert.equal(findSettingsRow(settingsRows, "config").kind, "config");
  const summary = buildConfigSummary(settingsRows);
  assert.equal(summary.reviewer_name, "Jamie Reviewer");
  assert.equal(summary.data_provider, "busabase");
  const run = runMetaFromSettings(settingsRows);
  assert.equal(run.batch_id, "b-1");
});

test("buildConfigSummary(): documented default reviewer name when no settings row exists yet", () => {
  const summary = buildConfigSummary([]);
  assert.equal(summary.reviewer_name, "Unassigned reviewer");
});
