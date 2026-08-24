import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshot } from "../app/js/money-model.js";

test("buildSnapshot normalizes fields and computes metrics", () => {
  const snapshot = buildSnapshot({
    accounts: [
      {
        account_id: "acc-1",
        provider: "mercury",
        display_name: "Mercury Main",
        currency: "USD",
        status: "ok",
        gross_inflow: "1000",
        gross_outflow: "200",
        fees: "10",
        net: "790",
      },
      {
        account_id: "acc-2",
        provider: "stripe",
        status: "warning",
        gross_inflow: "0",
        gross_outflow: "0",
        fees: "0",
        net: "0",
      },
    ],
    transactions: [
      {
        transaction_id: "tx-1",
        account_id: "acc-1",
        gross: "1000",
        fee: "10",
        net: "990",
        direction: "in",
        tags: '["a"]',
      },
    ],
    invoices: [{ invoice_id: "inv-1", total: "1000" }],
    invoiceMatches: [
      { match_id: "m-1", invoice_id: "inv-1", transaction_id: "tx-1", status: "matched", confidence: "1" },
    ],
  });

  assert.equal(snapshot.metrics.account_count, 2);
  assert.equal(snapshot.metrics.transaction_count, 1);
  assert.equal(snapshot.metrics.gross_inflow, 1000);
  assert.equal(snapshot.metrics.net, 790);
  assert.deepEqual(snapshot.transactions[0].tags, ["a"]);
  assert.equal(snapshot.invoice_matches[0].confidence, 1);
  assert.equal(snapshot.warnings.length, 1);
  assert.equal(snapshot.warnings[0].account_id, "acc-2");
});

test("buildSnapshot handles empty input", () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.accounts.length, 0);
  assert.equal(snapshot.metrics.account_count, 0);
  assert.equal(snapshot.warnings.length, 0);
});
