// Domain model for the Cross-Entity Disclosure Tracker, ported verbatim (same
// variable names, same order of operations, only TS types stripped) from the
// retired app/server/{demo,store}.ts and app/server/types.ts. A "vehicle" is
// one financing vehicle (fund/SPV) whose standardized disclosure package
// spans three generic regulatory roles:
//   - origination   : the onshore origination entity (originates/services the assets)
//   - fund_manager  : the offshore fund-manager entity (manages the vehicle)
//   - listing_venue : the exchange/listing venue where the vehicle's notes/units are listed
//
// This is a generic, brand-free compliance/IR workspace: no real company,
// filing system, or exchange is referenced. All data is synthetic.
//
// Architectural change from the retired local-file shape: a reviewer's
// decision now lives directly on the item's own Busabase record (decision
// fields alongside the raw checklist fields) instead of a separate
// decisions.json bucket keyed by item id — same pattern used across this
// batch of Busabase-only conversions (see kelly-deal-scorer). The per-item
// status math itself (computeItemStatus) is ported unchanged from
// applyDecisions() in the retired app/server/store.ts.

export const ROLE_LABEL = {
  origination: "Origination entity",
  fund_manager: "Fund-manager entity",
  listing_venue: "Listing venue",
};

export const ROLE_ORDER = ["origination", "fund_manager", "listing_venue"];

export const VALID_ACTIONS = new Set(["verified", "needs_source", "flagged"]);

export const ITEM_TEMPLATES = [
  {
    role: "origination",
    item_key: "asset_pool_schedule",
    title: "Asset pool schedule",
    summary: "Itemized schedule of originated assets backing the vehicle, with outstanding balances.",
    category: "origination",
    proposed_action: "collect_document",
  },
  {
    role: "origination",
    item_key: "servicer_report",
    title: "Servicer performance report",
    summary: "Delinquency, prepayment, and recovery statistics for the origination book.",
    category: "origination",
    proposed_action: "collect_document",
  },
  {
    role: "fund_manager",
    item_key: "aum_statement",
    title: "AUM statement",
    summary: "Fund-manager entity's statement of assets under management for the vehicle.",
    category: "fund_manager",
    proposed_action: "reconcile_figures",
  },
  {
    role: "fund_manager",
    item_key: "management_fee_disclosure",
    title: "Management fee disclosure",
    summary: "Fee schedule and accrued management/performance fees for the reporting period.",
    category: "fund_manager",
    proposed_action: "collect_document",
  },
  {
    role: "listing_venue",
    item_key: "listing_filing",
    title: "Listing venue filing",
    summary: "Filed prospectus/listing document reflecting the vehicle's notes or units outstanding.",
    category: "listing_venue",
    proposed_action: "reconcile_figures",
  },
  {
    role: "listing_venue",
    item_key: "continuing_disclosure",
    title: "Continuing disclosure notice",
    summary: "Periodic continuing-disclosure notice required by the listing venue's rules.",
    category: "listing_venue",
    proposed_action: "confirm_filing",
  },
];

export const VEHICLE_SEEDS = [
  {
    suffix: "Alpha 12",
    vehicle_type: "spv",
    origination_entity: "Onshore Originator A",
    fund_manager_entity: "Offshore Manager I",
    listing_venue: "Exchange One",
    currency: "USD",
  },
  {
    suffix: "Beta 07",
    vehicle_type: "fund",
    origination_entity: "Onshore Originator B",
    fund_manager_entity: "Offshore Manager I",
    listing_venue: "Exchange Two",
    currency: "USD",
  },
  {
    suffix: "Gamma 03",
    vehicle_type: "spv",
    origination_entity: "Onshore Originator A",
    fund_manager_entity: "Offshore Manager II",
    listing_venue: "Exchange One",
    currency: "EUR",
  },
  {
    suffix: "Delta 21",
    vehicle_type: "fund",
    origination_entity: "Onshore Originator C",
    fund_manager_entity: "Offshore Manager II",
    listing_venue: "Exchange Two",
    currency: "USD",
  },
  {
    suffix: "Epsilon 09",
    vehicle_type: "spv",
    origination_entity: "Onshore Originator B",
    fund_manager_entity: "Offshore Manager I",
    listing_venue: "Exchange Three",
    currency: "USD",
  },
  {
    suffix: "Zeta 15",
    vehicle_type: "fund",
    origination_entity: "Onshore Originator D",
    fund_manager_entity: "Offshore Manager III",
    listing_venue: "Exchange One",
    currency: "GBP",
  },
  {
    suffix: "Eta 04",
    vehicle_type: "spv",
    origination_entity: "Onshore Originator A",
    fund_manager_entity: "Offshore Manager II",
    listing_venue: "Exchange Two",
    currency: "USD",
  },
  {
    suffix: "Theta 18",
    vehicle_type: "fund",
    origination_entity: "Onshore Originator C",
    fund_manager_entity: "Offshore Manager III",
    listing_venue: "Exchange Three",
    currency: "USD",
  },
  {
    suffix: "Iota 02",
    vehicle_type: "spv",
    origination_entity: "Onshore Originator D",
    fund_manager_entity: "Offshore Manager I",
    listing_venue: "Exchange One",
    currency: "EUR",
  },
];

// Chinese localization for the demo scenario, ported verbatim from the
// retired app/server/demo.ts.
export const ZH_VEHICLE_NAMES = {
  "veh-01": "SPV 阿尔法 12",
  "veh-02": "SPV 贝塔 07",
  "veh-03": "SPV 伽马 03",
  "veh-04": "SPV 德尔塔 21",
  "veh-05": "SPV 艾普西龙 09",
  "veh-06": "SPV 泽塔 15",
  "veh-07": "SPV 伊塔 04",
  "veh-08": "SPV 西塔 18",
  "veh-09": "SPV 约塔 02",
};

// deterministic pseudo-random from a string seed, used only to vary demo/seed
// scenarios. Ported verbatim from the retired app/server/demo.ts.
export function seedIndex(seed = "", mod = 1) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % mod;
}

// Per-item status math, ported verbatim from applyDecisions() in the retired
// app/server/store.ts. Applying a decision moves an item to its terminal
// review state: verified -> done, needs_source -> changes_requested (waiting
// on a source document), flagged -> blocked (a real cross-entity
// inconsistency the reviewer must escalate). Undecided items default to
// needs_review. Guardrail: a "verified" decision cannot silently settle an
// item that still has an unresolved cross-entity reconciliation mismatch —
// it is held at "changes_requested" until the reviewer explicitly
// acknowledges the mismatch via override_reconciliation on the decision.
export function computeItemStatus({ decision = null, reconciliation = null } = {}) {
  if (!decision) return "needs_review";
  const hasUnresolvedMismatch = Boolean(reconciliation && reconciliation.match === false);
  let status =
    decision.action === "verified" ? "done" : decision.action === "needs_source" ? "changes_requested" : "blocked";
  if (hasUnresolvedMismatch && decision.action === "verified" && !decision.override_reconciliation) {
    status = "changes_requested";
  }
  return status;
}

// Attaches the derived `status` to an item that already carries its
// `reconciliation` and `decision` (or undefined for either). Destructures
// every field with a default (rather than taking a bare `item = {}`) so
// TypeScript's checkJs infers the full item shape on the return value,
// instead of narrowing it to just `{ status }`.
export function finalizeItem({
  id = "",
  vehicle_id = "",
  role = "origination",
  item_key = "",
  title = "",
  summary = "",
  body = "",
  category = "",
  proposed_action = "no_action",
  reason = "",
  reconciliation = undefined,
  decision = undefined,
} = {}) {
  const item = {
    id,
    vehicle_id,
    role,
    item_key,
    title,
    summary,
    body,
    category,
    proposed_action,
    reason,
    reconciliation,
    decision,
  };
  return { ...item, status: computeItemStatus(item) };
}

// Builds the fixed 9-vehicle / 6-item-per-vehicle seed dataset — ported
// verbatim (same bucket math, same reconciliation-mismatch rule, same
// pre-population thresholds) from the retired scripts/generate_batch.ts's
// buildBatch()/app/server/demo.ts's buildDemoBatch(). Shared by the trusted
// seed script (scripts/generate_batch.mjs) and the offline ?demo= scenario
// (js/providers/demo-provider.js) so both always agree on the mock queue.
// `now` is the ISO timestamp stamped onto every pre-seeded decision.
export function buildSeedData({ now = "" } = {}) {
  const vehicles = [];
  const items = [];

  VEHICLE_SEEDS.forEach((seed, vIndex) => {
    const vehicle_id = `veh-${String(vIndex + 1).padStart(2, "0")}`;
    const name = `SPV ${seed.suffix}`;

    ITEM_TEMPLATES.forEach((tpl) => {
      const id = `${vehicle_id}-${tpl.item_key}`;
      const bucket = seedIndex(id, 10);
      const item = {
        id,
        vehicle_id,
        role: tpl.role,
        item_key: tpl.item_key,
        title: tpl.title,
        summary: tpl.summary,
        body: `${ROLE_LABEL[tpl.role]} deliverable for ${name}: ${tpl.summary} Source of record is the ${ROLE_LABEL[
          tpl.role
        ].toLowerCase()}'s standard disclosure pack for the current reporting period.`,
        category: tpl.category,
        proposed_action: tpl.proposed_action,
        reason: `Standard disclosure package requires a current ${tpl.title.toLowerCase()} from the ${ROLE_LABEL[
          tpl.role
        ].toLowerCase()}.`,
        reconciliation: undefined,
        decision: undefined,
      };

      // Reconciliation pairs: fund-manager AUM vs listing-venue filing amounts.
      if (tpl.item_key === "listing_filing") {
        const originationFigure = 40 + bucket * 3.4;
        const mismatch = bucket % 4 === 0; // ~2-3 vehicles get a flagged mismatch
        const listingFigure = mismatch ? originationFigure + 2.75 : originationFigure;
        item.reconciliation = {
          field: "aum_usd_millions",
          origination_value: `$${originationFigure.toFixed(1)}M (fund-manager AUM statement)`,
          listing_value: `$${listingFigure.toFixed(1)}M (listing venue filing)`,
          match: !mismatch,
          note: mismatch
            ? "Filed amount does not reconcile with the fund-manager AUM statement for this period."
            : undefined,
        };
        if (mismatch) {
          item.reason = "Reconciliation mismatch between fund-manager AUM statement and listing venue filing.";
        }
      }

      // Pre-populate a plausible starting mix so the app is not an empty shell:
      // roughly a third pre-verified, some awaiting source docs, mismatches
      // pre-flagged. Everything else starts at needs_review for the reviewer.
      if (item.reconciliation && item.reconciliation.match === false) {
        item.decision = {
          action: "flagged",
          comment: "Escalated to fund-manager entity for a restated AUM figure before re-filing.",
          decided_at: now,
        };
      } else if (bucket % 3 === 0) {
        item.decision = { action: "verified", comment: "Matches source document, no exceptions.", decided_at: now };
      } else if (bucket % 5 === 0) {
        item.decision = {
          action: "needs_source",
          comment: "Waiting on an updated document from the counterparty entity.",
          decided_at: now,
        };
      }

      items.push(finalizeItem(item));
    });

    vehicles.push({
      vehicle_id,
      name,
      vehicle_type: seed.vehicle_type,
      origination_entity: seed.origination_entity,
      fund_manager_entity: seed.fund_manager_entity,
      listing_venue: seed.listing_venue,
      base_currency: seed.currency,
      target_close_date: "2026-09-30",
    });
  });

  return { vehicles, items };
}

// Per-vehicle rollup, ported verbatim from the vehicle loop inside
// applyDecisions() in the retired app/server/store.ts.
export function computeVehicleMetrics(items = []) {
  return {
    total: items.length,
    needs_review: items.filter((i) => i.status === "needs_review").length,
    changes_requested: items.filter((i) => i.status === "changes_requested").length,
    done: items.filter((i) => i.status === "done").length,
    blocked: items.filter((i) => i.status === "blocked").length,
  };
}

export function computeReadiness(vMetrics = { blocked: 0, done: 0, total: 0 }) {
  return vMetrics.blocked > 0
    ? "blocked"
    : vMetrics.done === vMetrics.total && vMetrics.total > 0
      ? "ready"
      : "in_progress";
}

// Batch-level rollup, ported verbatim from applyDecisions()'s metrics object
// in the retired app/server/store.ts.
export function computeBatchMetrics(items = [], vehicles = []) {
  return {
    vehicles_ready: vehicles.filter((v) => v.readiness === "ready").length,
    vehicles_blocked: vehicles.filter((v) => v.readiness === "blocked").length,
    vehicles_in_progress: vehicles.filter((v) => v.readiness === "in_progress").length,
    items_needs_review: items.filter((i) => i.status === "needs_review").length,
    items_changes_requested: items.filter((i) => i.status === "changes_requested").length,
    items_done: items.filter((i) => i.status === "done").length,
    items_blocked: items.filter((i) => i.status === "blocked").length,
  };
}

// Assembles the full Batch shape the UI renders (batch_id/generated_at/
// source/mode/metrics/vehicles/items), mirroring emptyBatch()/
// applyDecisions()'s return shape in the retired app/server/store.ts.
// `items` must already be finalized (carry `.status`); `vehicles` are raw
// vehicle rows without metrics/readiness attached yet.
export function assembleBatch({
  vehicles = [],
  items = [],
  batchId = "",
  generatedAt = "",
  source = "kelly-disclosure-tracker",
} = {}) {
  const finalVehicles = vehicles.map((vehicle) => {
    const vItems = items.filter((item) => item.vehicle_id === vehicle.vehicle_id);
    const metrics = computeVehicleMetrics(vItems);
    return { ...vehicle, metrics, readiness: computeReadiness(metrics) };
  });
  const metrics = computeBatchMetrics(items, finalVehicles);
  return {
    batch_id: batchId,
    generated_at: generatedAt,
    source,
    mode: "app-in-skill",
    metrics,
    vehicles: finalVehicles,
    items,
  };
}

function parseJsonObject(value = "") {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// Normalizes a Busabase `items` row (already snake_cased by the provider)
// into the structured item shape (reconciliation/decision parsed from JSON,
// override_reconciliation parsed from a "true"/"false" string), then
// finalizes it. Mirrors computeCandidate() in kelly-deal-scorer's
// scorer-model.js.
export function computeItemFromRow({
  item_id = "",
  vehicle_id = "",
  role = "origination",
  item_key = "",
  title = "",
  summary = "",
  body = "",
  category = "",
  proposed_action = "no_action",
  reason = "",
  reconciliation = "",
  decision_action = "",
  decision_comment = "",
  decided_at = "",
  override_reconciliation = "",
} = {}) {
  const parsedReconciliation = parseJsonObject(reconciliation) || undefined;
  const decision = decision_action
    ? {
        action: decision_action,
        comment: decision_comment || "",
        decided_at: decided_at || "",
        override_reconciliation: override_reconciliation === "true",
      }
    : undefined;
  return finalizeItem({
    id: item_id,
    vehicle_id,
    role,
    item_key,
    title,
    summary,
    body,
    category,
    proposed_action,
    reason,
    reconciliation: parsedReconciliation,
    decision,
  });
}

function parseJsonPayload(value = "") {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

// Sanitized config summary, ported from summarizeConfig() in the retired
// app/server/store.ts. The `settings` Base's "config" row is optional; a
// missing row falls back to the same defaults readConfig() used.
export function buildConfigSummary(settingsRows = []) {
  const configRow = findSettingsRow(settingsRows, "config");
  const config = parseJsonPayload(configRow?.payload);
  return {
    config_path: "busabase",
    is_example: false,
    reviewer_name: config.reviewer_name || "Unassigned reviewer",
    data_provider: "busabase",
  };
}

// The `settings` Base's "run" row holds the current batch's batch_id/
// generated_at, written by scripts/generate_batch.mjs. A missing row means
// no batch has been seeded yet.
export function runMetaFromSettings(settingsRows = []) {
  const runRow = findSettingsRow(settingsRows, "run");
  return parseJsonPayload(runRow?.payload);
}
