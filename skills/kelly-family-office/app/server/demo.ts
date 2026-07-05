import { computeInsights } from "./insights.ts";
import { buildSnapshot } from "./portfolio.ts";
import type { AccountRef, ConsolidatedSnapshot, Entity, FxRates, HoldingInput, TargetAllocation } from "./types.ts";

const now = "2026-06-30T09:30:00.000Z";

const FX_RATES: FxRates = { USD: 1, HKD: 0.128, CNY: 0.139 };

const DEMO_TARGET_ALLOCATION: TargetAllocation = {
  EQUITY: 45,
  BOND: 20,
  REAL_ESTATE: 15,
  PRIVATE_EQUITY: 8,
  CRYPTO: 5,
  CASH: 5,
  ALTERNATIVE: 2,
};

export function isDemoQuery(query: Record<string, string> = {}): boolean {
  return Boolean(query.demo);
}

export function demoStatePayload(query: Record<string, string> = {}): Record<string, unknown> {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(demoSnapshot(scenario)) : demoSnapshot(scenario);
  snapshot.insights = computeInsights(snapshot, DEMO_TARGET_ALLOCATION);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-family-office",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-family-office/config.json",
      is_example: false,
      base_currency: snapshot.base_currency,
      fx_rates: snapshot.fx_rates,
      entities: snapshot.entities.map((entity) => ({
        entity_id: entity.entity_id,
        name: entity.name,
        type: entity.type,
        member: entity.member,
      })),
      institutions: [...new Set(snapshot.accounts.map((account) => account.institution))],
    },
    snapshot,
  };
}

function localizeSnapshotZh(snapshot: ConsolidatedSnapshot): ConsolidatedSnapshot {
  const entityNames: Record<string, string> = {
    "individual-principal": "陈凯莉（个人）",
    "family-trust": "陈氏家族信托",
    "offshore-holdco": "离岸控股公司",
  };
  const entityMembers: Record<string, string> = {
    "individual-principal": "陈凯莉",
    "family-trust": "陈氏家族",
    "offshore-holdco": "陈氏家族",
  };
  snapshot.entities = snapshot.entities.map((entity) => ({
    ...entity,
    name: entityNames[entity.entity_id] || entity.name,
    member: entityMembers[entity.entity_id] || entity.member,
  }));
  const nameById = new Map(snapshot.entities.map((entity) => [entity.entity_id, entity.name]));
  snapshot.by_entity = snapshot.by_entity.map((row) => ({ ...row, name: nameById.get(row.entity_id) || row.name }));

  const accountNames: Record<string, string> = {
    "ibkr-individual": "盈透证券 个人经纪账户",
    "hsbc-trust": "汇丰 信托投资账户",
    "ubs-trust": "瑞银 财富管理账户",
    "ibkr-holdco": "盈透证券 公司账户",
    "coinbase-holdco": "Coinbase 加密托管",
    "hsbc-holdco": "汇丰 公司现金账户",
  };
  snapshot.accounts = snapshot.accounts.map((account) => ({
    ...account,
    display_name: accountNames[account.account_id] || account.display_name,
  }));

  const holdingNames: Record<string, string> = {
    "Apple Inc": "苹果公司",
    "Vanguard Total World ETF": "先锋全球股票 ETF",
    "US Treasury 10Y": "美国 10 年期国债",
    "iShares HK Bond ETF": "iShares 香港债券 ETF",
    "China A50 ETF": "中国 A50 ETF",
    "Kweichow Moutai": "贵州茅台",
    "USD Cash": "美元现金",
    "HKD Cash": "港币现金",
    Bitcoin: "比特币",
    Ethereum: "以太坊",
    "Hong Kong Residential": "香港住宅物业",
    "Shenzhen Commercial": "深圳商业物业",
    "Growth Fund LP Stake": "成长基金 LP 份额",
    "Private SaaS Equity": "非上市 SaaS 股权",
    "Gold ETF": "黄金 ETF",
  };
  snapshot.holdings = snapshot.holdings.map((holding) => ({
    ...holding,
    name: holdingNames[holding.name] || holding.name,
  }));

  snapshot.warnings = snapshot.warnings.map((warning) => ({
    ...warning,
    message: "离岸控股公司的加密持仓权重偏高；请复核目标配置。",
    detail: "演示提醒，没有读取真实券商或托管数据。",
  }));
  return snapshot;
}

function demoSnapshot(scenario: string): ConsolidatedSnapshot {
  const entities = [
    entity("individual-principal", "Kelly Chan (Individual)", "INDIVIDUAL", "Kelly Chan"),
    entity("family-trust", "Chan Family Trust", "TRUST", "Chan Family"),
    entity("offshore-holdco", "Offshore Holding Co", "COMPANY", "Chan Family"),
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
    // Individual — IBKR (USD)
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
    // Family Trust — HSBC (HKD)
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
    // Family Trust — UBS (USD)
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
    // Offshore HoldCo — IBKR (USD)
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
    // Offshore HoldCo — Coinbase (USD)
    holding("h-btc", "offshore-holdco", "coinbase-holdco", "BTC", "Bitcoin", "CRYPTO", 12, 540000, 792000, "USD"),
    holding("h-eth", "offshore-holdco", "coinbase-holdco", "ETH", "Ethereum", "CRYPTO", 180, 468000, 558000, "USD"),
    // Offshore HoldCo — HSBC corporate cash (CNY)
    holding(
      "h-cny-cash",
      "offshore-holdco",
      "hsbc-holdco",
      "CNY",
      "USD Cash",
      "CASH",
      3600000,
      3600000,
      3600000,
      "CNY",
    ),
    // Offshore HoldCo — Shenzhen property (CNY)
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

  const warnings = ["overview", "assets", "institutions"].includes(scenario)
    ? [
        {
          id: "crypto-concentration",
          severity: "warning",
          entity_id: "offshore-holdco",
          message: "Offshore HoldCo crypto weight is above target; review target allocation.",
          detail: "Demo warning, no live brokerage or custody data.",
        },
      ]
    : [];

  return buildSnapshot({
    snapshot_id: "fo-demo-2026-06-30",
    generated_at: now,
    base_currency: "USD",
    fx_rates: FX_RATES,
    entities,
    accounts,
    holdings,
    source: "kelly-family-office-demo",
    warnings,
  });
}

function entity(entity_id: string, name: string, type: string, member: string): Entity {
  return { entity_id, name, type, member };
}

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
