import { applyDecisions, emptyBatch } from "./store.ts";
import type { Batch, Decision, DecisionsFile, DisclosureItem, EntityRole, Vehicle } from "./types.ts";

// Deterministic, fully offline demo data for screenshots and documentation. Never
// reads or writes real handoff files.

interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

const now = "2026-07-10T09:00:00.000Z";

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

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

// deterministic pseudo-random from a string seed, used only to vary demo scenarios
function seedIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % mod;
}

function buildDemoBatch(): Batch {
  const vehicles: Vehicle[] = [];
  const items: DisclosureItem[] = [];
  const decisions: DecisionsFile = {};

  VEHICLE_SEEDS.forEach((seed, vIndex) => {
    const vehicle_id = `veh-${String(vIndex + 1).padStart(2, "0")}`;
    const name = `SPV ${seed.suffix}`;
    ITEM_TEMPLATES.forEach((tpl, tIndex) => {
      const id = `${vehicle_id}-${tpl.item_key}`;
      const bucket = seedIndex(id, 10);
      const item: DisclosureItem = {
        id,
        vehicle_id,
        role: tpl.role,
        item_key: tpl.item_key,
        title: tpl.title,
        summary: tpl.summary,
        body: `${ROLE_LABEL[tpl.role]} deliverable for ${name}: ${tpl.summary} Source of record is the ${ROLE_LABEL[tpl.role].toLowerCase()}'s standard disclosure pack for the current reporting period.`,
        category: tpl.category,
        status: "needs_review",
        proposed_action: tpl.proposed_action,
        reason: `Standard disclosure package requires a current ${tpl.title.toLowerCase()} from the ${ROLE_LABEL[tpl.role].toLowerCase()}.`,
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
          item.status = "blocked";
          item.reason = "Reconciliation mismatch between fund-manager AUM statement and listing venue filing.";
          decisions[id] = {
            action: "flagged",
            comment: "Escalated to fund-manager entity for restated AUM figure before re-filing.",
            decided_at: now,
          };
        }
      }

      if (!decisions[id]) {
        if (bucket % 3 === 0) {
          decisions[id] = { action: "verified", comment: "Matches source document, no exceptions.", decided_at: now };
        } else if (bucket % 5 === 0) {
          decisions[id] = {
            action: "needs_source",
            comment: "Waiting on an updated document from the counterparty entity.",
            decided_at: now,
          };
        }
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

  const batch = emptyBatch();
  batch.batch_id = "disclosure-demo-20260710";
  batch.generated_at = now;
  batch.vehicles = vehicles;
  batch.items = items;
  return applyDecisions(batch, decisions);
}

const zhVehicleNames: Record<string, string> = {
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

function localizeZh(batch: Batch): Batch {
  const vehicles = batch.vehicles.map((v) => ({ ...v, name: zhVehicleNames[v.vehicle_id] || v.name }));
  return { ...batch, vehicles };
}

export function demoStatePayload(query: DemoQuery = {}): Record<string, unknown> {
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const batch = zh ? localizeZh(buildDemoBatch()) : buildDemoBatch();
  return {
    demo: true,
    app: "kelly-disclosure-tracker",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-disclosure-tracker/config.json",
      is_example: false,
      reviewer_name: zh ? "演示审阅人" : "Demo Reviewer",
      data_provider: "demo",
    },
    batch,
  };
}
