import { computeInsights, DEFAULT_TARGET_ALLOCATION } from "./insights.mjs";

const now = "2026-06-30T20:00:00.000Z";

export function isDemoQuery(query = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query = {}) {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(demoSnapshot(scenario)) : demoSnapshot(scenario);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-invest-webull",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-invest-webull/config.json",
      is_example: false,
      base_currency: snapshot.base_currency,
      webull: {
        region: "us",
        base_url: "https://us-openapi.webullbroker.com",
        account_allowlist: snapshot.accounts.map((account) => account.account_id),
        secret_envs: ["KELLY_INVEST_WEBULL_APP_KEY", "KELLY_INVEST_WEBULL_APP_SECRET"],
        secrets_ready: true,
      },
    },
    snapshot,
  };
}

function localizeSnapshotZh(snapshot) {
  const accountNames = {
    "webull-cash": "Webull 现金账户",
    "webull-margin": "Webull 保证金账户",
  };
  snapshot.accounts = snapshot.accounts.map((account) => ({
    ...account,
    display_name: accountNames[account.account_id] || account.display_name,
  }));
  const posNames = {
    AAPL: "苹果公司",
    NVDA: "英伟达",
    MSFT: "微软",
    TSLA: "特斯拉",
    AMZN: "亚马逊",
    VOO: "先锋标普500 ETF",
    QQQ: "纳指100 ETF",
    SCHD: "施瓦布高股息 ETF",
    "BTC-USD": "比特币",
    "ETH-USD": "以太坊",
  };
  snapshot.positions = snapshot.positions.map((position) => ({
    ...position,
    name: posNames[position.symbol] || position.name,
  }));
  snapshot.warnings = snapshot.warnings.map((warning) => ({
    ...warning,
    message: "TSLA 今日回撤明显，请留意保证金账户的当日波动。",
    detail: "演示提醒，没有读取真实券商数据。",
  }));
  return snapshot;
}

function demoSnapshot(scenario) {
  const rawAccounts = [
    { account_id: "webull-cash", account_type: "CASH", display_name: "Webull Cash", currency: "USD", total_cash: 9840.35 },
    {
      account_id: "webull-margin",
      account_type: "MARGIN",
      display_name: "Webull Margin",
      currency: "USD",
      total_cash: 4120.6,
      buying_power: 32460.4,
    },
  ];

  // position(symbol, name, asset_type, account_id, quantity, avg_cost, last_price, prev_close)
  const rawPositions = [
    position("AAPL", "Apple Inc.", "STOCK", "webull-cash", 60, 172.4, 214.31, 211.02),
    position("NVDA", "NVIDIA Corp.", "STOCK", "webull-margin", 40, 88.15, 141.28, 135.9),
    position("MSFT", "Microsoft Corp.", "STOCK", "webull-cash", 22, 352.1, 468.55, 465.1),
    position("TSLA", "Tesla Inc.", "STOCK", "webull-margin", 35, 248.7, 219.44, 233.8),
    position("AMZN", "Amazon.com Inc.", "STOCK", "webull-cash", 30, 158.2, 201.6, 199.4),
    position("VOO", "Vanguard S&P 500 ETF", "ETF", "webull-cash", 45, 402.5, 512.18, 509.7),
    position("QQQ", "Invesco QQQ Trust", "ETF", "webull-margin", 28, 388.9, 498.32, 494.6),
    position("SCHD", "Schwab US Dividend Equity ETF", "ETF", "webull-cash", 120, 74.6, 82.05, 81.7),
    position("BTC-USD", "Bitcoin", "CRYPTO", "webull-cash", 0.35, 41200, 63180, 61550),
    position("ETH-USD", "Ethereum", "CRYPTO", "webull-margin", 3.2, 2380, 3420, 3510),
  ];

  const totalMarketValue = rawPositions.reduce((sum, p) => sum + p.market_value, 0);
  const positions = rawPositions.map((p) => ({
    ...p,
    weight_pct: round2((p.market_value / totalMarketValue) * 100),
  }));

  const accounts = rawAccounts.map((account) => {
    const owned = positions.filter((p) => p.account_id === account.account_id);
    const marketValue = owned.reduce((sum, p) => sum + p.market_value, 0);
    const totalCash = account.total_cash || 0;
    const netLiquidation = round2(marketValue + totalCash);
    return {
      account_id: account.account_id,
      account_type: account.account_type,
      display_name: account.display_name,
      currency: account.currency,
      net_liquidation: netLiquidation,
      total_cash: round2(totalCash),
      buying_power: round2(account.buying_power != null ? account.buying_power : totalCash),
    };
  });

  const totals = computeTotals(positions, accounts);
  const allocation = computeAllocation(positions, totals.market_value);

  const snapshot = {
    schema_version: "1",
    snapshot_id: "demo-2026-06-30",
    generated_at: now,
    source: "kelly-invest-webull-demo",
    base_currency: "USD",
    accounts,
    positions,
    totals,
    allocation,
    warnings: ["overview", "positions", "detail"].includes(scenario)
      ? [
          {
            id: "tsla-day-drawdown",
            severity: "warning",
            account_id: "webull-margin",
            message: "TSLA is down sharply today; review the margin account's day change.",
            detail: "Demo warning, no live brokerage data.",
          },
        ]
      : [],
  };

  snapshot.insights = computeInsights(snapshot, DEFAULT_TARGET_ALLOCATION);
  return snapshot;
}

function position(symbol, name, asset_type, account_id, quantity, avg_cost, last_price, prev_close) {
  const market_value = round2(quantity * last_price);
  const cost_basis = round2(quantity * avg_cost);
  const unrealized_pnl = round2(market_value - cost_basis);
  const unrealized_pnl_pct = cost_basis ? round2((unrealized_pnl / cost_basis) * 100) : 0;
  const day_change = round2(quantity * (last_price - prev_close));
  const prev_value = quantity * prev_close;
  const day_change_pct = prev_value ? round2((day_change / prev_value) * 100) : 0;
  return {
    symbol,
    name,
    asset_type,
    account_id,
    quantity,
    avg_cost,
    last_price,
    market_value,
    cost_basis,
    unrealized_pnl,
    unrealized_pnl_pct,
    day_change,
    day_change_pct,
    currency: "USD",
    weight_pct: 0,
  };
}

function computeTotals(positions, accounts) {
  const market_value = round2(positions.reduce((sum, p) => sum + p.market_value, 0));
  const cost_basis = round2(positions.reduce((sum, p) => sum + p.cost_basis, 0));
  const unrealized_pnl = round2(market_value - cost_basis);
  const unrealized_pnl_pct = cost_basis ? round2((unrealized_pnl / cost_basis) * 100) : 0;
  const day_change = round2(positions.reduce((sum, p) => sum + p.day_change, 0));
  const prev_value = positions.reduce((sum, p) => sum + (p.market_value - p.day_change), 0);
  const day_change_pct = prev_value ? round2((day_change / prev_value) * 100) : 0;
  const total_cash = round2(accounts.reduce((sum, a) => sum + (a.total_cash || 0), 0));
  return {
    market_value,
    cost_basis,
    unrealized_pnl,
    unrealized_pnl_pct,
    day_change,
    day_change_pct,
    total_cash,
  };
}

function computeAllocation(positions, marketValueTotal) {
  const byType = new Map();
  for (const p of positions) {
    byType.set(p.asset_type, round2((byType.get(p.asset_type) || 0) + p.market_value));
  }
  return [...byType.entries()]
    .map(([asset_type, market_value]) => ({
      asset_type,
      market_value: round2(market_value),
      weight_pct: marketValueTotal ? round2((market_value / marketValueTotal) * 100) : 0,
    }))
    .sort((a, b) => b.market_value - a.market_value);
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
