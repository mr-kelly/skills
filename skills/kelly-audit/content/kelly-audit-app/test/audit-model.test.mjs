import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_RULES,
  agingBucketKey,
  buildConfigSummary,
  buildSnapshot,
  daysBetween,
  deriveSnapshot,
  detectAnomalies,
  isCreditNote,
  planExecution,
  round2,
  statusForVerdict,
} from "../app/js/audit-model.js";

test("statusForVerdict maps every decision action, ported from local-file-provider.ts's applyDecision + mergeAnomalies", () => {
  assert.equal(statusForVerdict("approve"), "approved");
  assert.equal(statusForVerdict("request_changes"), "changes_requested");
  assert.equal(statusForVerdict("block"), "blocked");
  assert.equal(statusForVerdict("dismiss"), "done");
  // "revise" only edits the draft: status stays whatever it was.
  assert.equal(statusForVerdict("revise", "needs_review"), "needs_review");
  assert.equal(statusForVerdict("revise", "approved"), "approved");
});

test("round2 rounds to two decimal places like the retired compute.ts", () => {
  assert.equal(round2(812.4019999), 812.4);
  assert.equal(round2(), 0);
});

test("daysBetween computes whole calendar days like the retired compute.ts", () => {
  assert.equal(daysBetween("2026-05-01", "2026-07-02"), 62);
  assert.equal(daysBetween("2026-06-05", "2026-07-02"), 27);
});

test("isCreditNote flags kind=credit_note or a negative amount", () => {
  assert.equal(isCreditNote({ kind: "credit_note", amount: -1200 }), true);
  assert.equal(isCreditNote({ kind: "invoice", amount: -5 }), true);
  assert.equal(isCreditNote({ kind: "invoice", amount: 100 }), false);
});

test("agingBucketKey buckets days_overdue against 30/60/90 edges", () => {
  assert.equal(agingBucketKey(0, [30, 60, 90]), "current");
  assert.equal(agingBucketKey(15, [30, 60, 90]), "1-30");
  assert.equal(agingBucketKey(45, [30, 60, 90]), "31-60");
  assert.equal(agingBucketKey(62, [30, 60, 90]), "61-90");
  assert.equal(agingBucketKey(120, [30, 60, 90]), "90+");
});

// One order/invoice/payment triangle worked by hand, mirroring the retired
// scripts' natural-key linking: SO-1 -> INV-1 (fully paid, on time) proves
// deriveSnapshot()'s linking, status, and metrics math end to end.
test("deriveSnapshot links a fully paid order/invoice/payment and computes metrics", () => {
  const snapshot = {
    base_currency: "USD",
    fx_rates: {},
    orders: [
      { order_id: "so-1", order_no: "SO-1", customer: "Acme", order_date: "2026-04-01", amount: 1000, currency: "USD" },
    ],
    invoices: [
      {
        invoice_id: "inv-1",
        invoice_no: "INV-1",
        order_no: "SO-1",
        customer: "Acme",
        issue_date: "2026-04-02",
        due_date: "2026-05-02",
        amount: 1000,
        currency: "USD",
        kind: "invoice",
      },
    ],
    payments: [
      {
        payment_id: "rcp-1",
        payment_ref: "RCP-1",
        invoice_no: "INV-1",
        payer: "Acme",
        paid_date: "2026-04-20",
        amount: 1000,
        currency: "USD",
      },
    ],
    anomalies: [],
  };
  deriveSnapshot(snapshot, DEFAULT_RULES, "2026-07-02T00:00:00.000Z");
  assert.equal(snapshot.invoices[0].status, "paid");
  assert.equal(snapshot.invoices[0].outstanding, 0);
  assert.equal(snapshot.orders[0].invoice_status, "invoiced");
  assert.equal(snapshot.orders[0].payment_status, "paid");
  assert.equal(snapshot.payments[0].match_status, "matched");
  assert.equal(snapshot.metrics.matched_pct, 1);
  assert.equal(snapshot.metrics.receivable_total, 0);
});

test("buildSnapshot pulls base_currency/fx_rates/company/rules off the Settings row", () => {
  const snapshot = buildSnapshot({
    orders: [
      {
        order_id: "so-1",
        order_no: "SO-1",
        customer: "Acme",
        order_date: "2026-04-01",
        amount: 86000,
        currency: "CNY",
      },
    ],
    settings: { base_currency: "USD", fx_rates: JSON.stringify({ CNY: 0.14 }), company_name: "Brightway" },
    now: "2026-07-02T00:00:00.000Z",
  });
  assert.equal(snapshot.base_currency, "USD");
  assert.equal(snapshot.fx_rates.CNY, 0.14);
  assert.equal(snapshot.company.name, "Brightway");
});

test("buildConfigSummary parses JSON-encoded rules/columns off a raw Busabase settings row", () => {
  const summary = buildConfigSummary({
    settings: {
      company_name: "Brightway Trading",
      base_currency: "USD",
      days_to_invoice: 14,
      amount_tolerance_pct: 1,
      aging_buckets: JSON.stringify([30, 60, 90]),
      import_orders_columns: JSON.stringify({ order_no: "OrderNo" }),
    },
  });
  assert.equal(summary.company.name, "Brightway Trading");
  assert.deepEqual(summary.rules.aging_buckets, [30, 60, 90]);
  assert.equal(summary.import.orders.columns.order_no, "OrderNo");
});

// One worked example per rule, ported verbatim from the retired
// scripts/run_checks.ts's detectAnomalies() — each fixture is the smallest
// snapshot that fires exactly one rule.
test("detectAnomalies: missing_invoice fires when an order has no invoice past the threshold", () => {
  const snapshot = deriveSnapshot(
    {
      base_currency: "USD",
      fx_rates: {},
      orders: [
        {
          order_id: "so-1",
          order_no: "SO-1",
          customer: "Acme",
          order_date: "2026-06-05",
          amount: 7800,
          currency: "USD",
        },
      ],
      invoices: [],
      payments: [],
      anomalies: [],
    },
    DEFAULT_RULES,
    "2026-07-02T00:00:00.000Z",
  );
  const detected = detectAnomalies(snapshot, DEFAULT_RULES, "2026-07-02T00:00:00.000Z");
  assert.equal(detected.length, 1);
  assert.equal(detected[0].rule, "missing_invoice");
  assert.equal(detected[0].id, "anom-missing_invoice-so-1");
  assert.equal(detected[0].amount_at_stake, 7800);
});

test("detectAnomalies: amount_mismatch fires when the invoice total misses the order amount beyond tolerance", () => {
  const snapshot = deriveSnapshot(
    {
      base_currency: "USD",
      fx_rates: {},
      orders: [
        {
          order_id: "so-2",
          order_no: "SO-2",
          customer: "Northgate",
          order_date: "2026-04-05",
          amount: 9600,
          currency: "USD",
        },
      ],
      invoices: [
        {
          invoice_id: "inv-2",
          invoice_no: "INV-2",
          order_no: "SO-2",
          customer: "Northgate",
          issue_date: "2026-04-12",
          due_date: "2026-05-12",
          amount: 9120,
          currency: "USD",
          kind: "invoice",
        },
      ],
      // Paid in full so only amount_mismatch fires, not overdue_receivable too
      // (mirrors the retired demo.ts fixture: RCP-5510 pays INV-2026-042 in full).
      payments: [
        {
          payment_id: "rcp-1",
          payment_ref: "RCP-1",
          invoice_no: "INV-2",
          payer: "Northgate",
          paid_date: "2026-05-10",
          amount: 9120,
          currency: "USD",
          method: "ach",
        },
      ],
      anomalies: [],
    },
    DEFAULT_RULES,
    "2026-07-02T00:00:00.000Z",
  );
  const detected = detectAnomalies(snapshot, DEFAULT_RULES, "2026-07-02T00:00:00.000Z");
  assert.equal(detected.length, 1);
  assert.equal(detected[0].rule, "amount_mismatch");
  assert.equal(detected[0].amount_at_stake, 480);
});

test("detectAnomalies: overdue_receivable fires for an unpaid invoice past due_date, bucketed by aging", () => {
  const snapshot = deriveSnapshot(
    {
      base_currency: "USD",
      fx_rates: {},
      orders: [],
      invoices: [
        {
          invoice_id: "inv-41",
          invoice_no: "INV-41",
          order_no: "",
          customer: "Harborline Retail",
          issue_date: "2026-04-16",
          due_date: "2026-05-01",
          amount: 18400,
          currency: "USD",
          kind: "invoice",
        },
      ],
      payments: [],
      anomalies: [],
    },
    DEFAULT_RULES,
    "2026-07-02T00:00:00.000Z",
  );
  const detected = detectAnomalies(snapshot, DEFAULT_RULES, "2026-07-02T00:00:00.000Z");
  assert.equal(detected.length, 1);
  assert.equal(detected[0].rule, "overdue_receivable");
  assert.equal(detected[0].aging_bucket, "61-90");
  assert.equal(detected[0].amount_at_stake, 18400);
  assert.equal(detected[0].severity, "high");
});

test("detectAnomalies: duplicate fires for two same-amount payments on one invoice within the window", () => {
  const snapshot = deriveSnapshot(
    {
      base_currency: "USD",
      fx_rates: {},
      orders: [],
      invoices: [
        {
          invoice_id: "inv-43",
          invoice_no: "INV-43",
          order_no: "",
          customer: "Cedar & Lane",
          issue_date: "2026-04-14",
          due_date: "2026-05-08",
          amount: 4250,
          currency: "USD",
          kind: "invoice",
        },
      ],
      payments: [
        {
          payment_id: "rcp-a",
          payment_ref: "RCP-A",
          invoice_no: "INV-43",
          payer: "Cedar & Lane",
          paid_date: "2026-05-06",
          amount: 4250,
          currency: "USD",
          method: "check",
        },
        {
          payment_id: "rcp-b",
          payment_ref: "RCP-B",
          invoice_no: "INV-43",
          payer: "Cedar & Lane",
          paid_date: "2026-05-07",
          amount: 4250,
          currency: "USD",
          method: "check",
        },
      ],
      anomalies: [],
    },
    DEFAULT_RULES,
    "2026-07-02T00:00:00.000Z",
  );
  const detected = detectAnomalies(snapshot, DEFAULT_RULES, "2026-07-02T00:00:00.000Z");
  assert.equal(detected.length, 1);
  assert.equal(detected[0].rule, "duplicate");
  assert.equal(detected[0].id, "anom-duplicate-rcp-b");
});

test("detectAnomalies: unmatched_payment fires for a payment referencing no imported invoice", () => {
  const snapshot = deriveSnapshot(
    {
      base_currency: "USD",
      fx_rates: {},
      orders: [],
      invoices: [],
      payments: [
        {
          payment_id: "rcp-x",
          payment_ref: "RCP-X",
          invoice_no: "INV-999",
          payer: "Bluecrest",
          paid_date: "2026-06-15",
          amount: 2900,
          currency: "USD",
          method: "wire",
        },
      ],
      anomalies: [],
    },
    DEFAULT_RULES,
    "2026-07-02T00:00:00.000Z",
  );
  const detected = detectAnomalies(snapshot, DEFAULT_RULES, "2026-07-02T00:00:00.000Z");
  assert.equal(detected.length, 1);
  assert.equal(detected[0].rule, "unmatched_payment");
});

test("detectAnomalies: irregular_entry fires for a credit note with no order reference and for a negative payment", () => {
  const snapshot = deriveSnapshot(
    {
      base_currency: "USD",
      fx_rates: {},
      orders: [],
      invoices: [
        {
          invoice_id: "inv-cn",
          invoice_no: "INV-CN",
          order_no: "",
          customer: "Summit",
          issue_date: "2026-05-22",
          due_date: "",
          amount: -1200,
          currency: "USD",
          kind: "credit_note",
        },
      ],
      payments: [
        {
          payment_id: "rcp-neg",
          payment_ref: "RCP-NEG",
          invoice_no: "",
          payer: "Summit",
          paid_date: "2026-05-22",
          amount: -50,
          currency: "USD",
          method: "wire",
        },
      ],
      anomalies: [],
    },
    DEFAULT_RULES,
    "2026-07-02T00:00:00.000Z",
  );
  const detected = detectAnomalies(snapshot, DEFAULT_RULES, "2026-07-02T00:00:00.000Z");
  // The negative payment also carries no invoice_no, so it additionally fires
  // unmatched_payment — a real cross-rule interaction, not a fixture bug.
  assert.equal(detected.filter((item) => item.rule === "irregular_entry").length, 2);
  assert.equal(detected.filter((item) => item.rule === "unmatched_payment").length, 1);
  assert.equal(detected.length, 3);
});

test("planExecution maps rule -> operation and target, ported verbatim from execute_decisions.ts", () => {
  const anomaly = {
    rule: "overdue_receivable",
    customer: "Harborline Retail",
    evidence: { invoice_id: "inv-41", order_id: "so-1", payment_ids: [] },
  };
  const dryRun = planExecution(anomaly, { apply: false });
  assert.equal(dryRun.operation, "chase_receivable");
  assert.equal(dryRun.target, "inv-41");
  assert.equal(dryRun.status, "planned");

  const applied = planExecution(anomaly, { apply: true });
  assert.equal(applied.status, "ready_for_agent");

  const noTarget = planExecution({ rule: "irregular_entry", evidence: {} }, { apply: false });
  assert.equal(noTarget.status, "blocked");
});
