#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(skillDir, "app", ".data", "snapshot.json");
const now = new Date().toISOString();

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
  return {
    account_id: account.account_id,
    account_type: account.account_type,
    display_name: account.display_name,
    currency: account.currency,
    net_liquidation: round2(marketValue + totalCash),
    total_cash: round2(totalCash),
    buying_power: round2(account.buying_power != null ? account.buying_power : totalCash),
  };
});

const totals = computeTotals(positions, accounts);
const allocation = computeAllocation(positions, totals.market_value);

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(
  out,
  JSON.stringify(
    {
      schema_version: "1",
      snapshot_id: `demo-${now.slice(0, 10)}`,
      generated_at: now,
      source: "kelly-invest-webull-demo",
      base_currency: "USD",
      accounts,
      positions,
      totals,
      allocation,
      warnings: [],
    },
    null,
    2,
  ),
);

console.log(`Wrote ${out}`);

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
