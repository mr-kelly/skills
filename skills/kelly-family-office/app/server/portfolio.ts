// Shared portfolio rollup logic. Given entities, accounts, holdings, fx rates,
// and a base currency, it converts every holding to the base currency and
// computes the consolidated totals and the three aggregation dimensions
// (by_entity / by_asset_class / by_institution). Used by the demo payload, the
// demo-snapshot generator, and the CSV importer so every rollup is internally
// consistent (weights ~100%, base totals = sum of holdings' base values).

import type {
  AccountRef,
  AssetClassRollup,
  BuildSnapshotInput,
  ConsolidatedSnapshot,
  EntityRollup,
  FxRates,
  Holding,
  HoldingInput,
  InstitutionRollup,
  Warning,
} from "./types.ts";

function round2(value: unknown): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function fxRate(fxRates: FxRates | undefined, currency: string): number {
  const rate = fxRates?.[currency];
  return typeof rate === "number" && rate > 0 ? rate : 1;
}

export function normalizeHoldings(
  holdings: HoldingInput[],
  accounts: AccountRef[],
  fxRates: FxRates,
): { holdings: Holding[]; warnings: Warning[] } {
  const accountById = new Map(accounts.map((account) => [account.account_id, account]));
  const warnings: Warning[] = [];
  const normalized = holdings.map((holding) => {
    const account = (accountById.get(holding.account_id) || {}) as Partial<AccountRef>;
    const currency = holding.currency || account.currency || "USD";
    const entity_id = holding.entity_id || account.entity_id || "";
    const configuredRate = fxRates?.[currency];
    const rate = fxRate(fxRates, currency);
    if (!(typeof configuredRate === "number" && configuredRate > 0)) {
      warnings.push({
        id: `fx-missing-${holding.holding_id || currency}`,
        severity: "warning",
        entity_id,
        message: `No FX rate configured for ${currency}; valued ${holding.holding_id || "holding"} at a 1:1 fallback rate.`,
        detail: "Add this currency to fx_rates so base-currency totals are accurate.",
      });
    }
    const market_value = round2(holding.market_value);
    const cost_basis = round2(holding.cost_basis);
    const market_value_base = round2(market_value * rate);
    const cost_basis_base = round2(cost_basis * rate);
    return {
      ...holding,
      entity_id,
      currency,
      quantity: Number(holding.quantity) || 0,
      market_value,
      cost_basis,
      market_value_base,
      cost_basis_base,
      unrealized_pnl_base: round2(market_value_base - cost_basis_base),
    };
  });
  return { holdings: normalized, warnings };
}

export function buildSnapshot({
  snapshot_id,
  generated_at,
  base_currency = "USD",
  fx_rates = { USD: 1 },
  entities = [],
  accounts = [],
  holdings = [],
  source = "kelly-family-office",
  warnings = [],
}: BuildSnapshotInput): ConsolidatedSnapshot {
  const { holdings: normalized, warnings: fxWarnings } = normalizeHoldings(holdings, accounts, fx_rates);

  const aum_base = round2(normalized.reduce((sum, h) => sum + h.market_value_base, 0));
  const cost_basis_base = round2(normalized.reduce((sum, h) => sum + h.cost_basis_base, 0));
  const unrealized_pnl_base = round2(aum_base - cost_basis_base);
  const unrealized_pnl_pct = cost_basis_base ? round2((unrealized_pnl_base / cost_basis_base) * 100) : 0;

  const weight = (value) => (aum_base ? round2((value / aum_base) * 100) : 0);

  const entityMeta = new Map(entities.map((entity) => [entity.entity_id, entity]));
  const accountMeta = new Map(accounts.map((account) => [account.account_id, account]));

  const entityAgg = new Map<string, { aum_base: number; unrealized_pnl_base: number }>();
  const assetAgg = new Map<string, { aum_base: number }>();
  const instAgg = new Map<string, { aum_base: number }>();

  for (const h of normalized) {
    const entity = entityAgg.get(h.entity_id) || { aum_base: 0, unrealized_pnl_base: 0 };
    entity.aum_base += h.market_value_base;
    entity.unrealized_pnl_base += h.unrealized_pnl_base;
    entityAgg.set(h.entity_id, entity);

    const asset = assetAgg.get(h.asset_class) || { aum_base: 0 };
    asset.aum_base += h.market_value_base;
    assetAgg.set(h.asset_class, asset);

    const institution = accountMeta.get(h.account_id)?.institution || "Unassigned";
    const inst = instAgg.get(institution) || { aum_base: 0 };
    inst.aum_base += h.market_value_base;
    instAgg.set(institution, inst);
  }

  const by_entity: EntityRollup[] = [...entityAgg.entries()]
    .map(([entity_id, agg]) => ({
      entity_id,
      name: entityMeta.get(entity_id)?.name || entity_id,
      aum_base: round2(agg.aum_base),
      weight_pct: weight(agg.aum_base),
      unrealized_pnl_base: round2(agg.unrealized_pnl_base),
    }))
    .sort((a, b) => b.aum_base - a.aum_base);

  const by_asset_class: AssetClassRollup[] = [...assetAgg.entries()]
    .map(([asset_class, agg]) => ({
      asset_class,
      aum_base: round2(agg.aum_base),
      weight_pct: weight(agg.aum_base),
    }))
    .sort((a, b) => b.aum_base - a.aum_base);

  const by_institution: InstitutionRollup[] = [...instAgg.entries()]
    .map(([institution, agg]) => ({
      institution,
      aum_base: round2(agg.aum_base),
      weight_pct: weight(agg.aum_base),
    }))
    .sort((a, b) => b.aum_base - a.aum_base);

  return {
    schema_version: "1",
    snapshot_id: snapshot_id || `fo-${Date.now()}`,
    generated_at: generated_at || new Date().toISOString(),
    source,
    base_currency,
    fx_rates,
    entities,
    accounts,
    holdings: normalized,
    totals: {
      aum_base,
      cost_basis_base,
      unrealized_pnl_base,
      unrealized_pnl_pct,
    },
    by_entity,
    by_asset_class,
    by_institution,
    warnings: [...warnings, ...fxWarnings],
  };
}
