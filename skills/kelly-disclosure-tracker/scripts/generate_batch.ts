#!/usr/bin/env node
// Seed script: generates a fresh current_batch.json with mock vehicles and their
// standardized disclosure items across the three generic entity roles. This is
// the "agent prepares a batch" half of the review-queue loop; a human then
// reviews it in the app (verified / needs-source / flagged + a note).
//
// No external calls. All vehicle/entity names below are generic placeholders.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { BATCH_PATH, DATA_DIR, LOCK_PATH } from "../app/server/paths.ts";
import { applyDecisions, ensureDirs, writeJson } from "../app/server/store.ts";
import type { Batch, DecisionsFile, DisclosureItem, EntityRole, Vehicle } from "../app/server/types.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date().toISOString();

const ROLE_LABEL: Record<EntityRole, string> = {
  origination: "Origination entity",
  fund_manager: "Fund-manager entity",
  listing_venue: "Listing venue",
};

const ITEM_TEMPLATES: Array<{
  role: EntityRole;
  item_key: string;
  title: string;
  summary: string;
  category: string;
  proposed_action: DisclosureItem["proposed_action"];
}> = [
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

const VEHICLE_SEEDS: Array<{
  suffix: string;
  vehicle_type: Vehicle["vehicle_type"];
  origination_entity: string;
  fund_manager_entity: string;
  listing_venue: string;
  currency: string;
}> = [
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

function seedIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % mod;
}

function buildBatch(): { batch: Batch; decisions: DecisionsFile } {
  const vehicles: Vehicle[] = [];
  const items: DisclosureItem[] = [];
  const decisions: DecisionsFile = {};

  VEHICLE_SEEDS.forEach((seed, vIndex) => {
    const vehicle_id = `veh-${String(vIndex + 1).padStart(2, "0")}`;
    const name = `SPV ${seed.suffix}`;

    ITEM_TEMPLATES.forEach((tpl) => {
      const id = `${vehicle_id}-${tpl.item_key}`;
      const bucket = seedIndex(id, 10);
      const item: DisclosureItem = {
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
        status: "needs_review",
        proposed_action: tpl.proposed_action,
        reason: `Standard disclosure package requires a current ${tpl.title.toLowerCase()} from the ${ROLE_LABEL[
          tpl.role
        ].toLowerCase()}.`,
      };

      if (tpl.item_key === "listing_filing") {
        const originationFigure = 40 + bucket * 3.4;
        const mismatch = bucket % 4 === 0;
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
      if (item.reconciliation && !item.reconciliation.match) {
        decisions[id] = {
          action: "flagged",
          comment: "Escalated to fund-manager entity for a restated AUM figure before re-filing.",
          decided_at: now,
        };
      } else if (bucket % 3 === 0) {
        decisions[id] = { action: "verified", comment: "Matches source document, no exceptions.", decided_at: now };
      } else if (bucket % 5 === 0) {
        decisions[id] = {
          action: "needs_source",
          comment: "Waiting on an updated document from the counterparty entity.",
          decided_at: now,
        };
      }

      items.push(item);
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
      metrics: { total: 0, needs_review: 0, changes_requested: 0, done: 0, blocked: 0 },
      readiness: "in_progress",
    });
  });

  const batch: Batch = {
    batch_id: `disclosure-${now.slice(0, 10).replace(/-/g, "")}-${now.slice(11, 19).replace(/:/g, "")}`,
    generated_at: now,
    source: "kelly-disclosure-tracker",
    mode: "app-in-skill",
    metrics: {
      vehicles_ready: 0,
      vehicles_blocked: 0,
      vehicles_in_progress: 0,
      items_needs_review: 0,
      items_changes_requested: 0,
      items_done: 0,
      items_blocked: 0,
    },
    vehicles,
    items,
  };

  return { batch: applyDecisions(batch, decisions), decisions };
}

async function main(): Promise<void> {
  await ensureDirs();
  await writeJson(LOCK_PATH, {
    owner: "kelly-disclosure-tracker",
    message: "Generating seed disclosure batch",
    started_at: now,
  });
  try {
    const { batch, decisions } = buildBatch();
    await writeJson(BATCH_PATH, batch);
    await writeJson(path.join(DATA_DIR, "decisions.json"), decisions);
    console.log(`Wrote ${BATCH_PATH}`);
    console.log(
      `Seeded ${batch.vehicles.length} vehicles / ${batch.items.length} items — ` +
        `${batch.metrics.items_done} done, ${batch.metrics.items_changes_requested} awaiting source, ` +
        `${batch.metrics.items_blocked} flagged, ${batch.metrics.items_needs_review} needs review.`,
    );
  } finally {
    try {
      await writeJson(LOCK_PATH, null);
    } catch {}
    const fs = await import("node:fs/promises");
    await fs.rm(LOCK_PATH, { force: true });
  }
}

await main();
