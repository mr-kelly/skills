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
const invoices = [
  invoice("inv-demo-stripe", "INV-DEMO-001", "incoming", "Example Customer", "", "2026-06-25", "2026-06-25", "paid", "USD", 499, 0, 499, "stripe"),
  invoice("inv-demo-contractor", "BILL-DEMO-017", "outgoing", "Example Contractor", "", "2026-06-23", "2026-06-23", "paid", "USD", 1200, 0, 1200, "mercury")
];
const invoice_matches = [
  match("match-demo-stripe", "inv-demo-stripe", "stripe-1", "matched", 0, 0, 1, "auto", "amount_currency_counterparty_date", "auto_accepted", [], ["Demo invoice matches Stripe payment."]),
  match("match-demo-contractor", "inv-demo-contractor", "mercury-1", "matched", 0, 0, 0.96, "auto", "amount_counterparty_near_date", "auto_accepted", [], ["Demo bill matches Mercury transfer."])
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
  invoices,
  invoice_matches,
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

function invoice(invoice_id, invoice_number, direction, vendor, customer, issue_date, due_date, status, currency, subtotal, tax, total, source) {
  return {
    invoice_id,
    invoice_number,
    direction,
    vendor,
    customer,
    issue_date,
    due_date,
    status,
    currency,
    subtotal,
    tax,
    total,
    source,
    source_url: "",
    file_path: "",
    notes: ""
  };
}

function match(match_id, invoice_id, transaction_id, status, amount_delta, date_delta_days, confidence, matching_method, matching_rule, review_status, candidate_transaction_ids, notes) {
  return {
    match_id,
    invoice_id,
    transaction_id,
    status,
    amount_delta,
    date_delta_days,
    confidence,
    matching_method,
    matching_rule,
    review_status,
    amount_tolerance: 1,
    date_tolerance_days: 3,
    candidate_transaction_ids,
    matched_at: now,
    audit_events: [
      {
        event: status === "matched" ? "auto_matched" : "exception_flagged",
        actor: "kelly-money-demo",
        at: now,
        note: notes[0] || ""
      }
    ],
    notes
  };
}
