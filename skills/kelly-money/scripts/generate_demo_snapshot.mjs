#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(skillDir, "app", ".data", "ledger_snapshot.json");
const now = new Date().toISOString();

const accounts = [
  account("mercury-main", "mercury", "Mercury Main", "USD", 18240.12, 0),
  account("stripe-main", "stripe", "Stripe Main", "USD", 6400.5, 1200.2),
  account("airwallex-main", "airwallex", "Airwallex Main", "USD", 3920.33, 0),
  account("creem-main", "creem", "Creem Main", "USD", 880.75, 220.1)
];

const transactions = [
  tx("stripe-1", "stripe", "stripe-main", "2026-06-25T08:10:00Z", "Course payment", "payment", "posted", 499, 15.22, 483.78, "in"),
  tx("creem-1", "creem", "creem-main", "2026-06-24T13:20:00Z", "Software subscription sale", "payment", "posted", 99, 4.9, 94.1, "in"),
  tx("mercury-1", "mercury", "mercury-main", "2026-06-23T16:30:00Z", "Contractor payout", "transfer", "posted", 1200, 0, -1200, "out"),
  tx("airwallex-1", "airwallex", "airwallex-main", "2026-06-22T11:40:00Z", "Currency conversion fee", "fee", "posted", 12.4, 12.4, -12.4, "out")
];

const byAccount = new Map(accounts.map((item) => [item.account_id, item]));
for (const item of transactions) {
  const totals = byAccount.get(item.account_id).totals;
  if (item.direction === "in") totals.gross_inflow += item.gross;
  if (item.direction === "out") totals.gross_outflow += item.gross;
  totals.fees += item.fee;
  totals.net += item.net;
}

const metrics = accounts.reduce((acc, item) => {
  acc.gross_inflow += item.totals.gross_inflow;
  acc.gross_outflow += item.totals.gross_outflow;
  acc.fees += item.totals.fees;
  acc.net += item.totals.net;
  return acc;
}, { account_count: accounts.length, transaction_count: transactions.length, gross_inflow: 0, gross_outflow: 0, fees: 0, net: 0 });

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify({
  schema_version: "1",
  generated_at: now,
  source: "kelly-money-demo",
  base_currency: "USD",
  range: { start: "2026-06-01", end: "2026-06-30" },
  metrics,
  accounts,
  transactions,
  warnings: []
}, null, 2));

console.log(`Wrote ${out}`);

function account(account_id, provider, display_name, currency, available, pending) {
  return {
    account_id,
    provider,
    display_name,
    entity: "Example Company",
    currency,
    status: "ok",
    balance: { available, pending, current: available + pending, as_of: now },
    totals: { gross_inflow: 0, gross_outflow: 0, fees: 0, net: 0 },
    last_sync_at: now,
    provider_account_id: `${provider}_example`
  };
}

function tx(id, provider, account_id, occurred_at, description, type, status, gross, fee, net, direction) {
  return {
    transaction_id: id,
    provider,
    account_id,
    provider_account_id: `${provider}_example`,
    provider_transaction_id: `${id}_provider`,
    occurred_at,
    available_at: occurred_at,
    description,
    counterparty: "Example Counterparty",
    type,
    status,
    currency: "USD",
    gross,
    fee,
    net,
    direction,
    source_url: "",
    tags: []
  };
}
