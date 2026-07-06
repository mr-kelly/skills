#!/usr/bin/env node
import { buildSnapshot } from "../app/server/portfolio.ts";
import type { AccountRef, FxRates, HoldingInput } from "../app/server/types.ts";
import { createProvider } from "../lib/data-provider/index.ts";
import { snapshotPath } from "../lib/paths.ts";

const out = snapshotPath;
const now = new Date().toISOString();

const FX_RATES: FxRates = { USD: 1, HKD: 0.128, CNY: 0.139 };

const entities = [
  { entity_id: "individual-principal", name: "Principal (Individual)", type: "INDIVIDUAL", member: "Principal" },
  { entity_id: "family-trust", name: "Family Trust", type: "TRUST", member: "Family" },
  { entity_id: "offshore-holdco", name: "Offshore Holding Co", type: "COMPANY", member: "Family" },
];

const accounts = [
  account("ibkr-individual", "individual-principal", "Interactive Brokers", "Brokerage", "USD"),
  account("hsbc-trust", "family-trust", "HSBC", "Investment", "HKD"),
  account("ubs-trust", "family-trust", "UBS", "Wealth Management", "USD"),
  account("ibkr-holdco", "offshore-holdco", "Interactive Brokers", "Brokerage", "USD"),
  account("coinbase-holdco", "offshore-holdco", "Coinbase Custody", "Crypto Custody", "USD"),
  account("hsbc-holdco", "offshore-holdco", "HSBC", "Corporate Cash", "CNY"),
];

const holdings = [
  holding(
    "h-aapl",
    "individual-principal",
    "ibkr-individual",
    "AAPL",
    "Apple Inc",
    "EQUITY",
    600,
    96000,
    138600,
    "USD",
  ),
  holding(
    "h-vt",
    "individual-principal",
    "ibkr-individual",
    "VT",
    "Vanguard Total World ETF",
    "EQUITY",
    900,
    88200,
    104400,
    "USD",
  ),
  holding(
    "h-ind-cash",
    "individual-principal",
    "ibkr-individual",
    "USD",
    "USD Cash",
    "CASH",
    45000,
    45000,
    45000,
    "USD",
  ),
  holding(
    "h-hkbond",
    "family-trust",
    "hsbc-trust",
    "HKBOND",
    "iShares HK Bond ETF",
    "BOND",
    120000,
    2400000,
    2352000,
    "HKD",
  ),
  holding("h-hkd-cash", "family-trust", "hsbc-trust", "HKD", "HKD Cash", "CASH", 1800000, 1800000, 1800000, "HKD"),
  holding(
    "h-hk-property",
    "family-trust",
    "hsbc-trust",
    "HKRES",
    "Hong Kong Residential",
    "REAL_ESTATE",
    1,
    42000000,
    46500000,
    "HKD",
  ),
  holding("h-ust10", "family-trust", "ubs-trust", "UST10Y", "US Treasury 10Y", "BOND", 500000, 500000, 486000, "USD"),
  holding("h-gold", "family-trust", "ubs-trust", "GLD", "Gold ETF", "ALTERNATIVE", 1200, 228000, 279600, "USD"),
  holding(
    "h-growth-lp",
    "family-trust",
    "ubs-trust",
    "GROWTHLP",
    "Growth Fund LP Stake",
    "PRIVATE_EQUITY",
    1,
    750000,
    1080000,
    "USD",
  ),
  holding("h-a50", "offshore-holdco", "ibkr-holdco", "A50", "China A50 ETF", "EQUITY", 400000, 720000, 684000, "CNY"),
  holding(
    "h-moutai",
    "offshore-holdco",
    "ibkr-holdco",
    "600519",
    "Kweichow Moutai",
    "EQUITY",
    1500,
    2400000,
    2565000,
    "CNY",
  ),
  holding(
    "h-saas",
    "offshore-holdco",
    "ibkr-holdco",
    "SAASX",
    "Private SaaS Equity",
    "PRIVATE_EQUITY",
    1,
    500000,
    900000,
    "USD",
  ),
  holding("h-btc", "offshore-holdco", "coinbase-holdco", "BTC", "Bitcoin", "CRYPTO", 12, 540000, 792000, "USD"),
  holding("h-eth", "offshore-holdco", "coinbase-holdco", "ETH", "Ethereum", "CRYPTO", 180, 468000, 558000, "USD"),
  holding("h-cny-cash", "offshore-holdco", "hsbc-holdco", "CNY", "CNY Cash", "CASH", 3600000, 3600000, 3600000, "CNY"),
  holding(
    "h-sz-property",
    "offshore-holdco",
    "hsbc-holdco",
    "SZCOM",
    "Shenzhen Commercial",
    "REAL_ESTATE",
    1,
    18000000,
    16200000,
    "CNY",
  ),
];

const snapshot = buildSnapshot({
  snapshot_id: "fo-demo-generated",
  generated_at: now,
  base_currency: "USD",
  fx_rates: FX_RATES,
  entities,
  accounts,
  holdings,
  source: "kelly-family-office-demo",
  warnings: [],
});

const provider = await createProvider();
await provider.writeSnapshot(snapshot);
console.log(`Wrote ${out}`);

function account(
  account_id: string,
  entity_id: string,
  institution: string,
  account_type: string,
  currency: string,
): AccountRef {
  return {
    account_id,
    entity_id,
    institution,
    account_type,
    currency,
    display_name: `${institution} ${account_type}`,
    as_of: now,
  };
}

function holding(
  holding_id: string,
  entity_id: string,
  account_id: string,
  symbol: string,
  name: string,
  asset_class: string,
  quantity: number,
  cost_basis: number,
  market_value: number,
  currency: string,
): HoldingInput {
  return {
    holding_id,
    entity_id,
    account_id,
    symbol,
    name,
    asset_class,
    quantity,
    cost_basis,
    market_value,
    currency,
    as_of: now,
  };
}
