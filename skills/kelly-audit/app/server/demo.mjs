// Deterministic demo scenes for Kelly Audit. Never reads or writes app/.data.
// Persona: Brightway Trading, a small trading/manufacturing company selling
// hardware and fabrication parts to regional retailers, with three months of
// orders, invoices, and payments and a mixed-state anomaly review queue.

import { deriveSnapshot } from "./compute.mjs";

const NOW = "2026-07-02T09:00:00.000Z";
const RANGE = { start: "2026-04-01", end: "2026-06-30" };
const RULES = { days_to_invoice: 14, amount_tolerance_pct: 1, aging_buckets: [30, 60, 90], duplicate_window_days: 7 };

// [order_no, customer, order_date, amount, currency]
const ORDER_ROWS = [
  ["SO-2026-1001", "Harborline Retail", "2026-04-02", 18400, "USD"],
  ["SO-2026-1002", "Northgate Manufacturing", "2026-04-05", 9600, "USD"],
  ["SO-2026-1003", "Cedar & Lane Distribution", "2026-04-08", 4250, "USD"],
  ["SO-2026-1004", "Ironwood Tools", "2026-06-05", 7800, "USD"],
  ["SO-2026-1005", "Orchid Home Goods", "2026-06-10", 3150, "USD"],
  ["SO-2026-1006", "Pinewave Electronics", "2026-03-28", 12600, "USD"],
  ["SO-2026-1007", "Bluecrest Hardware", "2026-04-12", 5400, "USD"],
  ["SO-2026-1008", "Summit Fabrication", "2026-04-15", 6900, "USD"],
  ["SO-2026-1009", "Harborline Retail", "2026-04-22", 2350, "USD"],
  ["SO-2026-1010", "Golden Prairie Trading", "2026-04-28", 86000, "CNY"],
  ["SO-2026-1011", "Northgate Manufacturing", "2026-05-04", 11200, "USD"],
  ["SO-2026-1012", "Cedar & Lane Distribution", "2026-05-08", 3600, "USD"],
  ["SO-2026-1013", "Ironwood Tools", "2026-05-12", 8250, "USD"],
  ["SO-2026-1014", "Bluecrest Hardware", "2026-05-16", 4780, "USD"],
  ["SO-2026-1015", "Summit Fabrication", "2026-05-20", 6100, "USD"],
  ["SO-2026-1016", "Orchid Home Goods", "2026-05-24", 2980, "USD"],
  ["SO-2026-1017", "Pinewave Electronics", "2026-06-02", 9450, "USD"],
  ["SO-2026-1018", "Harborline Retail", "2026-06-22", 5250, "USD"],
  ["SO-2026-1019", "Golden Prairie Trading", "2026-06-24", 42500, "CNY"],
  ["SO-2026-1020", "Northgate Manufacturing", "2026-06-25", 4400, "USD"]
];

// [invoice_no, order_no, customer, issue_date, due_date, amount, currency, kind]
const INVOICE_ROWS = [
  ["INV-2026-039", "SO-2026-1006", "Pinewave Electronics", "2026-04-02", "2026-05-02", 12600, "USD", "invoice"],
  ["INV-2026-041", "SO-2026-1001", "Harborline Retail", "2026-04-16", "2026-05-01", 18400, "USD", "invoice"],
  ["INV-2026-042", "SO-2026-1002", "Northgate Manufacturing", "2026-04-12", "2026-05-12", 9120, "USD", "invoice"],
  ["INV-2026-043", "SO-2026-1003", "Cedar & Lane Distribution", "2026-04-14", "2026-05-08", 4250, "USD", "invoice"],
  ["INV-2026-044", "SO-2026-1007", "Bluecrest Hardware", "2026-04-18", "2026-05-18", 5400, "USD", "invoice"],
  ["INV-2026-045", "SO-2026-1008", "Summit Fabrication", "2026-04-21", "2026-05-21", 6900, "USD", "invoice"],
  ["INV-2026-046", "SO-2026-1009", "Harborline Retail", "2026-04-26", "2026-05-26", 2350, "USD", "invoice"],
  ["INV-2026-047", "SO-2026-1010", "Golden Prairie Trading", "2026-05-02", "2026-06-01", 86000, "CNY", "invoice"],
  ["INV-2026-048", "SO-2026-1011", "Northgate Manufacturing", "2026-05-08", "2026-06-07", 11200, "USD", "invoice"],
  ["INV-2026-049", "SO-2026-1012", "Cedar & Lane Distribution", "2026-05-12", "2026-07-08", 3600, "USD", "invoice"],
  ["INV-2026-050", "SO-2026-1013", "Ironwood Tools", "2026-05-16", "2026-06-15", 8250, "USD", "invoice"],
  ["INV-2026-051", "SO-2026-1014", "Bluecrest Hardware", "2026-05-20", "2026-07-15", 4780, "USD", "invoice"],
  ["INV-2026-052", "", "Summit Fabrication", "2026-05-22", "", -1200, "USD", "credit_note"],
  ["INV-2026-053", "SO-2026-1015", "Summit Fabrication", "2026-05-25", "2026-07-04", 6100, "USD", "invoice"],
  ["INV-2026-054", "SO-2026-1016", "Orchid Home Goods", "2026-05-28", "2026-06-27", 2980, "USD", "invoice"],
  ["INV-2026-055", "SO-2026-1017", "Pinewave Electronics", "2026-06-08", "2026-07-17", 9450, "USD", "invoice"]
];

// [payment_ref, invoice_no, payer, paid_date, amount, currency, method]
const PAYMENT_ROWS = [
  ["RCP-5502", "INV-2026-039", "Pinewave Electronics", "2026-06-20", 12600, "USD", "wire"],
  ["RCP-5510", "INV-2026-042", "Northgate Manufacturing", "2026-05-10", 9120, "USD", "ach"],
  ["RCP-5515", "INV-2026-044", "Bluecrest Hardware", "2026-05-02", 5400, "USD", "ach"],
  ["RCP-5522", "INV-2026-045", "Summit Fabrication", "2026-05-14", 6900, "USD", "wire"],
  ["RCP-5526", "INV-2026-046", "Harborline Retail", "2026-05-20", 2350, "USD", "ach"],
  ["RCP-5529", "INV-2026-047", "Golden Prairie Trading", "2026-05-25", 86000, "CNY", "bank_transfer"],
  ["RCP-5531", "INV-2026-043", "Cedar & Lane Distribution", "2026-05-06", 4250, "USD", "check"],
  ["RCP-5538", "INV-2026-043", "Cedar & Lane Distribution", "2026-05-07", 4250, "USD", "check"],
  ["RCP-5543", "INV-2026-048", "Northgate Manufacturing", "2026-06-01", 11200, "USD", "ach"],
  ["RCP-5547", "INV-2026-050", "Ironwood Tools", "2026-06-10", 8250, "USD", "wire"],
  ["RCP-5552", "INV-2026-053", "Summit Fabrication", "2026-06-18", 3000, "USD", "wire"],
  ["RCP-5556", "INV-2026-054", "Orchid Home Goods", "2026-06-20", 2980, "USD", "ach"],
  ["RCP-5560", "INV-2026-058", "Bluecrest Hardware", "2026-06-15", 2900, "USD", "wire"],
  ["RCP-5566", "INV-2026-055", "Pinewave Electronics", "2026-06-28", 9450, "USD", "wire"]
];

const CHASE_DRAFT_EN = `Subject: Payment reminder — invoice INV-2026-041 (US$18,400.00, 62 days past due)

Hi Harborline accounts team,

Our records show invoice INV-2026-041 for order SO-2026-1001 (US$18,400.00, issued 2026-04-16) was due on 2026-05-01 and remains unpaid — 62 days past due.

Could you confirm the payment status or share an expected remittance date? If the invoice or bank details need to be reissued, tell us and we will send them today.

Thank you,
Brightway Trading — Finance`;

const CHASE_DRAFT_ZH = `主题：付款提醒 — 发票 INV-2026-041（US$18,400.00，已逾期 62 天）

明华贸易财务组，您好：

我们的记录显示，订单 SO-2026-1001 对应的发票 INV-2026-041（金额 US$18,400.00，开票日 2026-04-16）应于 2026-05-01 到期，目前仍未回款，已逾期 62 天。

烦请确认付款状态，或告知预计的汇款日期。如需重开发票或更新收款账户信息，请告诉我们，我们今天即可补发。

谢谢！
明威贸易 · 财务部`;

function id(value) {
  return String(value).toLowerCase();
}

function buildTables() {
  const orders = ORDER_ROWS.map(([order_no, customer, order_date, amount, currency]) => ({
    order_id: id(order_no),
    order_no,
    customer,
    order_date,
    amount,
    currency,
    source_file: "exports/orders.csv"
  }));
  const invoices = INVOICE_ROWS.map(([invoice_no, order_no, customer, issue_date, due_date, amount, currency, kind]) => ({
    invoice_id: id(invoice_no),
    invoice_no,
    order_no,
    customer,
    issue_date,
    due_date,
    amount,
    currency,
    kind,
    notes: kind === "credit_note" ? "Credit note issued after a price adjustment discussion." : "",
    source_file: "exports/invoices.csv"
  }));
  const payments = PAYMENT_ROWS.map(([payment_ref, invoice_no, payer, paid_date, amount, currency, method]) => ({
    payment_id: id(payment_ref),
    payment_ref,
    invoice_no,
    order_no: "",
    payer,
    paid_date,
    amount,
    currency,
    method,
    source_file: "exports/payments.csv"
  }));
  return { orders, invoices, payments };
}

function demoAnomalies() {
  return [
    {
      id: "anom-overdue_receivable-inv-2026-041",
      ref: 1,
      rule: "overdue_receivable",
      severity: "high",
      status: "needs_review",
      title: "Harborline Retail invoice 62 days past due",
      customer: "Harborline Retail",
      amount_at_stake: 18400,
      currency: "USD",
      aging_bucket: "61-90",
      reason: "Invoice INV-2026-041 (US$18,400.00) was due 2026-05-01 and has no matching payment. 62 days overdue puts it in the 61-90 aging bucket — the largest open receivable.",
      evidence: {
        order_id: "so-2026-1001",
        invoice_id: "inv-2026-041",
        payment_ids: [],
        rows: [
          { label: "Order SO-2026-1001", detail: "Harborline Retail · 2026-04-02", amount: 18400, currency: "USD" },
          { label: "Invoice INV-2026-041", detail: "Issued 2026-04-16 · due 2026-05-01", amount: 18400, currency: "USD" },
          { label: "Payments", detail: "No payment received", amount: 0, currency: "USD" }
        ],
        computed: "Outstanding US$18,400.00 · 62 days past due as of 2026-07-02."
      },
      proposed_action: "chase_receivable",
      draft: CHASE_DRAFT_EN,
      agent_notes: "Harborline paid INV-2026-046 on time in May, so the account is active. No dispute is on file for this invoice.",
      created_at: "2026-07-01T09:05:00.000Z",
      decision: null,
      execution: null
    },
    {
      id: "anom-amount_mismatch-so-2026-1002",
      ref: 2,
      rule: "amount_mismatch",
      severity: "medium",
      status: "needs_review",
      title: "Invoice 5% under order amount for Northgate Manufacturing",
      customer: "Northgate Manufacturing",
      amount_at_stake: 480,
      currency: "USD",
      reason: "Order SO-2026-1002 totals US$9,600.00 but invoice INV-2026-042 was issued for US$9,120.00 — a −US$480.00 (5.0%) gap, beyond the 1% tolerance. The customer paid the invoice amount, leaving US$480.00 unbilled.",
      evidence: {
        order_id: "so-2026-1002",
        invoice_id: "inv-2026-042",
        payment_ids: ["rcp-5510"],
        rows: [
          { label: "Order SO-2026-1002", detail: "Northgate Manufacturing · 2026-04-05", amount: 9600, currency: "USD" },
          { label: "Invoice INV-2026-042", detail: "Issued 2026-04-12 · due 2026-05-12", amount: 9120, currency: "USD" },
          { label: "Payment RCP-5510", detail: "ACH · 2026-05-10", amount: 9120, currency: "USD" }
        ],
        computed: "Invoice − order = −US$480.00 (−5.0%) · tolerance 1%."
      },
      proposed_action: "reissue_invoice",
      draft: "Internal request — billing:\n\nInvoice INV-2026-042 was issued at US$9,120.00 against order SO-2026-1002 (US$9,600.00). Please confirm whether a discount was agreed. If not, issue a supplementary invoice for US$480.00 to Northgate Manufacturing referencing SO-2026-1002 and notify their AP contact.",
      agent_notes: "No discount agreement was found in the order metadata. The gap equals exactly 5%, which may be an early-payment discount applied by mistake.",
      created_at: "2026-07-01T09:05:00.000Z",
      decision: null,
      execution: null
    },
    {
      id: "anom-duplicate-rcp-5538",
      ref: 3,
      rule: "duplicate",
      severity: "high",
      status: "needs_review",
      title: "Duplicate payment from Cedar & Lane Distribution",
      customer: "Cedar & Lane Distribution",
      amount_at_stake: 4250,
      currency: "USD",
      reason: "Two payments of US$4,250.00 (RCP-5531 on 2026-05-06 and RCP-5538 on 2026-05-07) both reference invoice INV-2026-043. The invoice total is US$4,250.00, so the account is overpaid by US$4,250.00.",
      evidence: {
        order_id: "so-2026-1003",
        invoice_id: "inv-2026-043",
        payment_ids: ["rcp-5531", "rcp-5538"],
        rows: [
          { label: "Invoice INV-2026-043", detail: "Issued 2026-04-14 · due 2026-05-08", amount: 4250, currency: "USD" },
          { label: "Payment RCP-5531", detail: "Check · 2026-05-06", amount: 4250, currency: "USD" },
          { label: "Payment RCP-5538", detail: "Check · 2026-05-07 · same amount, 1 day apart", amount: 4250, currency: "USD" }
        ],
        computed: "Paid US$8,500.00 against a US$4,250.00 invoice · overpaid US$4,250.00."
      },
      proposed_action: "flag_to_accountant",
      draft: "Flag for the accountant:\n\nInvoice INV-2026-043 (Cedar & Lane Distribution) received two US$4,250.00 checks one day apart (RCP-5531, RCP-5538). Please verify both cleared, then either refund the duplicate or apply it as a credit against their open invoice INV-2026-049 (US$3,600.00) after confirming with the customer.",
      agent_notes: "Both entries came from the June bank export with different bank references, so this is not an import artifact.",
      created_at: "2026-07-01T09:05:00.000Z",
      decision: null,
      execution: null
    },
    {
      id: "anom-missing_invoice-so-2026-1004",
      ref: 4,
      rule: "missing_invoice",
      severity: "medium",
      status: "needs_review",
      title: "Order for Ironwood Tools uninvoiced for 27 days",
      customer: "Ironwood Tools",
      amount_at_stake: 7800,
      currency: "USD",
      reason: "Order SO-2026-1004 (US$7,800.00, 2026-06-05) has no invoice after 27 days; the policy threshold is 14 days. Revenue is unbilled and the payment clock has not started.",
      evidence: {
        order_id: "so-2026-1004",
        invoice_id: "",
        payment_ids: [],
        rows: [
          { label: "Order SO-2026-1004", detail: "Ironwood Tools · 2026-06-05", amount: 7800, currency: "USD" },
          { label: "Invoice", detail: "None found in imported invoices", amount: 0, currency: "USD" }
        ],
        computed: "27 days since order date · threshold 14 days."
      },
      proposed_action: "reissue_invoice",
      draft: "Internal request — billing:\n\nOrder SO-2026-1004 for Ironwood Tools (US$7,800.00, 2026-06-05) shipped but was never invoiced. Please issue the invoice with standard NET-30 terms and reference SO-2026-1004.",
      agent_notes: "The order status in the export is 'fulfilled', so this looks like a billing miss rather than a hold.",
      created_at: "2026-07-01T09:05:00.000Z",
      decision: null,
      execution: null
    },
    {
      id: "anom-missing_invoice-so-2026-1005",
      ref: 5,
      rule: "missing_invoice",
      severity: "medium",
      status: "approved",
      title: "Order for Orchid Home Goods uninvoiced for 22 days",
      customer: "Orchid Home Goods",
      amount_at_stake: 3150,
      currency: "USD",
      reason: "Order SO-2026-1005 (US$3,150.00, 2026-06-10) has no invoice after 22 days; the policy threshold is 14 days.",
      evidence: {
        order_id: "so-2026-1005",
        invoice_id: "",
        payment_ids: [],
        rows: [
          { label: "Order SO-2026-1005", detail: "Orchid Home Goods · 2026-06-10", amount: 3150, currency: "USD" },
          { label: "Invoice", detail: "None found in imported invoices", amount: 0, currency: "USD" }
        ],
        computed: "22 days since order date · threshold 14 days."
      },
      proposed_action: "reissue_invoice",
      draft: "Internal request — billing:\n\nOrder SO-2026-1005 for Orchid Home Goods (US$3,150.00, 2026-06-10) is fulfilled but uninvoiced. Please issue the invoice with NET-30 terms referencing SO-2026-1005.",
      agent_notes: "",
      created_at: "2026-07-01T09:05:00.000Z",
      decision: {
        action: "approve",
        note: "Confirmed with warehouse that the order shipped 06-12. Bill it.",
        draft: null,
        decided_at: "2026-07-01T15:20:00.000Z"
      },
      execution: null
    },
    {
      id: "anom-unmatched_payment-rcp-5560",
      ref: 6,
      rule: "unmatched_payment",
      severity: "medium",
      status: "changes_requested",
      title: "Payment from Bluecrest Hardware matches no invoice",
      customer: "Bluecrest Hardware",
      amount_at_stake: 2900,
      currency: "USD",
      reason: "Payment RCP-5560 (US$2,900.00, 2026-06-15) references invoice INV-2026-058, which does not exist in the imported invoices. No open Bluecrest invoice matches the amount.",
      evidence: {
        order_id: "",
        invoice_id: "",
        payment_ids: ["rcp-5560"],
        rows: [
          { label: "Payment RCP-5560", detail: "Wire · 2026-06-15 · memo: INV-2026-058", amount: 2900, currency: "USD" },
          { label: "Invoice INV-2026-058", detail: "Not found in imported invoices", amount: 0, currency: "USD" },
          { label: "Open Bluecrest invoices", detail: "INV-2026-051 open at US$4,780.00 — amount does not match", amount: 4780, currency: "USD" }
        ],
        computed: "US$2,900.00 received with no matching invoice or order."
      },
      proposed_action: "flag_to_accountant",
      draft: "Flag for the accountant:\n\nWire RCP-5560 from Bluecrest Hardware (US$2,900.00, 2026-06-15) cites INV-2026-058, which is not in our books. Please check whether an invoice was issued outside the export window, and confirm with Bluecrest what this payment covers before applying it.",
      agent_notes: "",
      created_at: "2026-07-01T09:05:00.000Z",
      decision: {
        action: "request_changes",
        note: "Check the May export first — invoice numbering jumped from 056. Re-import invoices for May and re-run the checks before I flag this to the accountant.",
        draft: null,
        decided_at: "2026-07-01T15:26:00.000Z"
      },
      execution: null
    },
    {
      id: "anom-irregular_entry-inv-2026-052",
      ref: 7,
      rule: "irregular_entry",
      severity: "medium",
      status: "blocked",
      title: "Credit note without a linked original invoice",
      customer: "Summit Fabrication",
      amount_at_stake: 1200,
      currency: "USD",
      reason: "Credit note INV-2026-052 (−US$1,200.00, 2026-05-22) for Summit Fabrication references no order and no original invoice. Negative entries without a paper trail need documentation before month close.",
      evidence: {
        order_id: "",
        invoice_id: "inv-2026-052",
        payment_ids: [],
        rows: [
          { label: "Credit note INV-2026-052", detail: "Issued 2026-05-22 · no order reference", amount: -1200, currency: "USD" },
          { label: "Original invoice", detail: "No linked invoice found", amount: 0, currency: "USD" }
        ],
        computed: "Negative entry −US$1,200.00 with no linked original document."
      },
      proposed_action: "flag_to_accountant",
      draft: "Flag for the accountant:\n\nCredit note INV-2026-052 (−US$1,200.00) for Summit Fabrication has no linked original invoice or order. Please attach the signed price-adjustment agreement or reverse the credit note.",
      agent_notes: "Blocked: sales says a contract amendment covering this credit is still being signed. Revisit after the amendment arrives.",
      created_at: "2026-07-01T09:05:00.000Z",
      decision: {
        action: "block",
        note: "Waiting on the signed contract amendment from Summit before booking this credit.",
        draft: null,
        decided_at: "2026-07-01T15:31:00.000Z"
      },
      execution: null
    },
    {
      id: "anom-overdue_receivable-inv-2026-039",
      ref: 8,
      rule: "overdue_receivable",
      severity: "high",
      status: "done",
      title: "Pinewave Electronics invoice recovered after chase",
      customer: "Pinewave Electronics",
      amount_at_stake: 12600,
      currency: "USD",
      aging_bucket: "31-60",
      reason: "Invoice INV-2026-039 (US$12,600.00) was 45 days overdue when flagged in June. A chasing email was approved and sent; payment RCP-5502 arrived 2026-06-20 and the anomaly auto-resolved.",
      evidence: {
        order_id: "so-2026-1006",
        invoice_id: "inv-2026-039",
        payment_ids: ["rcp-5502"],
        rows: [
          { label: "Invoice INV-2026-039", detail: "Issued 2026-04-02 · due 2026-05-02", amount: 12600, currency: "USD" },
          { label: "Payment RCP-5502", detail: "Wire · 2026-06-20 · received after reminder", amount: 12600, currency: "USD" }
        ],
        computed: "Paid in full 49 days after the due date."
      },
      proposed_action: "chase_receivable",
      draft: "Subject: Payment reminder — invoice INV-2026-039 (US$12,600.00)\n\nHi Pinewave accounts team,\n\nInvoice INV-2026-039 for order SO-2026-1006 was due 2026-05-02 and is still open on our side. Could you confirm the payment status?\n\nThank you,\nBrightway Trading — Finance",
      agent_notes: "",
      created_at: "2026-06-16T10:00:00.000Z",
      decision: {
        action: "approve",
        note: "Send it — Pinewave usually pays after one reminder.",
        draft: null,
        decided_at: "2026-06-16T14:00:00.000Z"
      },
      execution: {
        status: "executed",
        operation: "chase_receivable",
        target: "inv-2026-039",
        detail: "Reminder email sent to Pinewave AP on 2026-06-16 via kelly-email. Payment RCP-5502 received 2026-06-20; invoice paid in full.",
        executed_at: "2026-06-16T14:05:00.000Z"
      }
    }
  ];
}

function demoImportLog() {
  return [
    {
      import_id: "imp-20260701-0902",
      imported_at: "2026-07-01T09:02:00.000Z",
      files: { orders: "exports/orders_2026Q2.csv", invoices: "exports/invoices_2026Q2.csv", payments: "exports/payments_jun.csv" },
      added: { orders: 7, invoices: 4, payments: 6 },
      updated: { orders: 0, invoices: 1, payments: 0 },
      warnings: ["Payment RCP-5560 references unknown invoice INV-2026-058."]
    },
    {
      import_id: "imp-20260601-0845",
      imported_at: "2026-06-01T08:45:00.000Z",
      files: { orders: "exports/orders_may.csv", invoices: "exports/invoices_may.csv", payments: "exports/payments_may.csv" },
      added: { orders: 7, invoices: 8, payments: 6 },
      updated: { orders: 1, invoices: 0, payments: 0 },
      warnings: []
    },
    {
      import_id: "imp-20260502-0910",
      imported_at: "2026-05-02T09:10:00.000Z",
      files: { orders: "exports/orders_apr.csv", invoices: "exports/invoices_apr.csv", payments: "exports/payments_apr.csv" },
      added: { orders: 6, invoices: 4, payments: 2 },
      updated: { orders: 0, invoices: 0, payments: 0 },
      warnings: []
    }
  ];
}

export function buildDemoSnapshot() {
  const { orders, invoices, payments } = buildTables();
  const snapshot = {
    schema_version: "1",
    generated_at: NOW,
    source: "kelly-audit-demo",
    base_currency: "USD",
    fx_rates: { CNY: 0.14 },
    company: { name: "Brightway Trading" },
    range: RANGE,
    orders,
    invoices,
    payments,
    matches: [],
    anomalies: demoAnomalies(),
    import_log: demoImportLog(),
    warnings: []
  };
  return deriveSnapshot(snapshot, RULES, NOW);
}

export function isDemoQuery(query = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query = {}) {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "").toLowerCase().startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(buildDemoSnapshot()) : buildDemoSnapshot();
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-audit",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-audit/config.json",
      is_example: false,
      company: { name: zh ? "明威贸易" : "Brightway Trading", contact_email: "finance@brightway.example" },
      base_currency: "USD",
      rules: RULES,
      import: {
        orders: { format: "csv", columns: { order_no: "OrderNo", customer: "Customer", order_date: "OrderDate", amount: "Total", currency: "Currency" } },
        invoices: { format: "csv", columns: { invoice_no: "InvoiceNo", order_no: "OrderNo", customer: "Customer", issue_date: "IssueDate", due_date: "DueDate", amount: "Total", currency: "Currency" } },
        payments: { format: "csv", columns: { payment_ref: "Reference", invoice_no: "InvoiceNo", payer: "Payer", paid_date: "PaidDate", amount: "Amount", currency: "Currency", method: "Method" } }
      },
      env: { config_env: "KELLY_AUDIT_CONFIG", config_env_set: true, env_file_env: "KELLY_AUDIT_ENV_FILE", env_file_set: false }
    },
    agent_tasks: demoAgentTasks(zh),
    execution_report: demoExecutionReport(zh),
    snapshot
  };
}

function demoAgentTasks(zh) {
  return {
    updated_at: NOW,
    tasks: [
      {
        id: "anom-unmatched_payment-rcp-5560",
        ref: 6,
        title: zh ? "蓝峰五金的回款找不到对应发票" : "Payment from Bluecrest Hardware matches no invoice",
        rule: "unmatched_payment",
        type: "revise_anomaly",
        note: zh
          ? "先查 5 月的导出——发票编号从 056 直接跳号了。重新导入 5 月发票并重跑检查，再决定是否转交会计。"
          : "Check the May export first — invoice numbering jumped from 056. Re-import invoices for May and re-run the checks before I flag this to the accountant.",
        requested_at: "2026-07-01T15:26:00.000Z"
      }
    ]
  };
}

function demoExecutionReport(zh) {
  return {
    generated_at: "2026-06-16T14:05:00.000Z",
    dry_run: false,
    source: "kelly-audit-demo",
    results: [
      {
        id: "anom-overdue_receivable-inv-2026-039",
        ref: 8,
        title: zh ? "松涛电子逾期发票已追回" : "Pinewave Electronics invoice recovered after chase",
        operation: "chase_receivable",
        target: "inv-2026-039",
        customer: zh ? "松涛电子" : "Pinewave Electronics",
        status: "executed",
        detail: zh
          ? "已于 2026-06-16 通过 kelly-email 向松涛电子应付组发送催款邮件。回款 RCP-5502 于 2026-06-20 到账，发票已全额结清。"
          : "Reminder email sent to Pinewave AP on 2026-06-16 via kelly-email. Payment RCP-5502 received 2026-06-20; invoice paid in full."
      }
    ]
  };
}

const CUSTOMER_ZH = {
  "Harborline Retail": "明华贸易",
  "Northgate Manufacturing": "北阁制造",
  "Cedar & Lane Distribution": "松岚商贸",
  "Ironwood Tools": "铁木工具",
  "Orchid Home Goods": "兰居家品",
  "Pinewave Electronics": "松涛电子",
  "Bluecrest Hardware": "蓝峰五金",
  "Summit Fabrication": "峰达机械",
  "Golden Prairie Trading": "金原商贸"
};

const ANOMALY_ZH = {
  "anom-overdue_receivable-inv-2026-041": {
    title: "明华贸易发票逾期 62 天未回款",
    reason: "发票 INV-2026-041（US$18,400.00）应于 2026-05-01 到期，至今没有匹配的回款。逾期 62 天，落入 61-90 天账龄区间，是当前最大的一笔未收应收款。",
    computed: "未收 US$18,400.00 · 截至 2026-07-02 已逾期 62 天。",
    rows: [
      { label: "订单 SO-2026-1001", detail: "明华贸易 · 2026-04-02", amount: 18400, currency: "USD" },
      { label: "发票 INV-2026-041", detail: "开票 2026-04-16 · 到期 2026-05-01", amount: 18400, currency: "USD" },
      { label: "回款", detail: "未收到任何回款", amount: 0, currency: "USD" }
    ],
    draft: CHASE_DRAFT_ZH,
    agent_notes: "明华贸易 5 月按时支付了 INV-2026-046，账户仍在正常往来，本发票也没有争议记录。"
  },
  "anom-amount_mismatch-so-2026-1002": {
    title: "北阁制造的发票金额比订单低 5%",
    reason: "订单 SO-2026-1002 总额 US$9,600.00，但发票 INV-2026-042 只开了 US$9,120.00，差 −US$480.00（5.0%），超过 1% 的容差。客户按发票金额付款，还有 US$480.00 未开票。",
    computed: "发票 − 订单 = −US$480.00（−5.0%）· 容差 1%。",
    rows: [
      { label: "订单 SO-2026-1002", detail: "北阁制造 · 2026-04-05", amount: 9600, currency: "USD" },
      { label: "发票 INV-2026-042", detail: "开票 2026-04-12 · 到期 2026-05-12", amount: 9120, currency: "USD" },
      { label: "回款 RCP-5510", detail: "ACH · 2026-05-10", amount: 9120, currency: "USD" }
    ],
    draft: "内部工单 — 开票组：\n\n发票 INV-2026-042 按 US$9,120.00 开具，但订单 SO-2026-1002 金额为 US$9,600.00。请确认是否有约定折扣；如没有，请向北阁制造补开 US$480.00 的发票，引用订单号 SO-2026-1002 并通知对方应付联系人。",
    agent_notes: "订单元数据里没有折扣协议。差额恰好 5%，可能是误用了提前付款折扣。"
  },
  "anom-duplicate-rcp-5538": {
    title: "松岚商贸重复付款",
    reason: "两笔 US$4,250.00 的付款（RCP-5531，2026-05-06；RCP-5538，2026-05-07）都对应发票 INV-2026-043。发票总额 US$4,250.00，账户多收 US$4,250.00。",
    computed: "US$4,250.00 的发票收到 US$8,500.00 · 多收 US$4,250.00。",
    rows: [
      { label: "发票 INV-2026-043", detail: "开票 2026-04-14 · 到期 2026-05-08", amount: 4250, currency: "USD" },
      { label: "回款 RCP-5531", detail: "支票 · 2026-05-06", amount: 4250, currency: "USD" },
      { label: "回款 RCP-5538", detail: "支票 · 2026-05-07 · 金额相同，仅隔一天", amount: 4250, currency: "USD" }
    ],
    draft: "转交会计：\n\n发票 INV-2026-043（松岚商贸）一天内收到两张 US$4,250.00 的支票（RCP-5531、RCP-5538）。请确认两张都已兑付，然后与客户确认：退回重复款项，或经客户同意后抵扣其未结发票 INV-2026-049（US$3,600.00）。",
    agent_notes: "两条记录来自 6 月的银行导出，银行参考号不同，不是导入产生的重复行。"
  },
  "anom-missing_invoice-so-2026-1004": {
    title: "铁木工具的订单 27 天未开票",
    reason: "订单 SO-2026-1004（US$7,800.00，2026-06-05）已 27 天没有对应发票，超过 14 天的开票时限。收入未入账，账期也未开始计算。",
    computed: "距订单日期已 27 天 · 时限 14 天。",
    rows: [
      { label: "订单 SO-2026-1004", detail: "铁木工具 · 2026-06-05", amount: 7800, currency: "USD" },
      { label: "发票", detail: "导入的发票中未找到", amount: 0, currency: "USD" }
    ],
    draft: "内部工单 — 开票组：\n\n铁木工具的订单 SO-2026-1004（US$7,800.00，2026-06-05）已发货但一直没有开票。请按标准 NET-30 账期开票，并引用订单号 SO-2026-1004。",
    agent_notes: "导出数据中订单状态为“已履约”，更像是漏开票而不是暂缓开票。"
  },
  "anom-missing_invoice-so-2026-1005": {
    title: "兰居家品的订单 22 天未开票",
    reason: "订单 SO-2026-1005（US$3,150.00，2026-06-10）已 22 天没有对应发票，超过 14 天的开票时限。",
    computed: "距订单日期已 22 天 · 时限 14 天。",
    rows: [
      { label: "订单 SO-2026-1005", detail: "兰居家品 · 2026-06-10", amount: 3150, currency: "USD" },
      { label: "发票", detail: "导入的发票中未找到", amount: 0, currency: "USD" }
    ],
    draft: "内部工单 — 开票组：\n\n兰居家品的订单 SO-2026-1005（US$3,150.00，2026-06-10）已履约但未开票。请按 NET-30 账期开票并引用订单号 SO-2026-1005。",
    agent_notes: "",
    decision_note: "已和仓库确认订单 06-12 发货，可以开票。"
  },
  "anom-unmatched_payment-rcp-5560": {
    title: "蓝峰五金的回款找不到对应发票",
    reason: "回款 RCP-5560（US$2,900.00，2026-06-15）备注引用发票 INV-2026-058，但导入的发票里没有这张发票，也没有金额匹配的蓝峰未结发票。",
    computed: "收到 US$2,900.00，没有可匹配的发票或订单。",
    rows: [
      { label: "回款 RCP-5560", detail: "电汇 · 2026-06-15 · 备注：INV-2026-058", amount: 2900, currency: "USD" },
      { label: "发票 INV-2026-058", detail: "导入的发票中不存在", amount: 0, currency: "USD" },
      { label: "蓝峰未结发票", detail: "INV-2026-051 未结 US$4,780.00 — 金额不符", amount: 4780, currency: "USD" }
    ],
    draft: "转交会计：\n\n蓝峰五金的电汇 RCP-5560（US$2,900.00，2026-06-15）引用了账上不存在的发票 INV-2026-058。请核查是否有发票开在导出窗口之外，并与蓝峰确认这笔款项的用途后再入账。",
    agent_notes: "",
    decision_note: "先查 5 月的导出——发票编号从 056 直接跳号了。重新导入 5 月发票并重跑检查，再决定是否转交会计。"
  },
  "anom-irregular_entry-inv-2026-052": {
    title: "红字发票（贷项）缺少对应的原始发票",
    reason: "峰达机械的贷项发票 INV-2026-052（−US$1,200.00，2026-05-22）没有引用任何订单或原始发票。月结前，负数分录必须补齐凭证。",
    computed: "负数分录 −US$1,200.00，未关联任何原始单据。",
    rows: [
      { label: "贷项发票 INV-2026-052", detail: "开具 2026-05-22 · 无订单引用", amount: -1200, currency: "USD" },
      { label: "原始发票", detail: "未找到关联发票", amount: 0, currency: "USD" }
    ],
    draft: "转交会计：\n\n峰达机械的贷项发票 INV-2026-052（−US$1,200.00）没有关联的原始发票或订单。请补附已签署的调价协议，或冲销该贷项。",
    agent_notes: "阻塞：销售确认涵盖该贷项的合同补充协议仍在签署中，等协议到位后再处理。",
    decision_note: "等峰达的合同补充协议签回来，再入这笔贷项。"
  },
  "anom-overdue_receivable-inv-2026-039": {
    title: "松涛电子逾期发票已追回",
    reason: "发票 INV-2026-039（US$12,600.00）6 月被标记时已逾期 45 天。催款邮件经批准后发出；回款 RCP-5502 于 2026-06-20 到账，异常自动关闭。",
    computed: "到期后第 49 天全额付清。",
    rows: [
      { label: "发票 INV-2026-039", detail: "开票 2026-04-02 · 到期 2026-05-02", amount: 12600, currency: "USD" },
      { label: "回款 RCP-5502", detail: "电汇 · 2026-06-20 · 催款后到账", amount: 12600, currency: "USD" }
    ],
    draft: "主题：付款提醒 — 发票 INV-2026-039（US$12,600.00）\n\n松涛电子财务组，您好：\n\n订单 SO-2026-1006 对应的发票 INV-2026-039 应于 2026-05-02 到期，目前在我方账上仍未结清。烦请确认付款状态。\n\n谢谢！\n明威贸易 · 财务部",
    agent_notes: "",
    decision_note: "发吧——松涛电子一般提醒一次就会付。",
    execution_detail: "已于 2026-06-16 通过 kelly-email 向松涛电子应付组发送催款邮件。回款 RCP-5502 于 2026-06-20 到账，发票已全额结清。"
  }
};

function localizeSnapshotZh(snapshot) {
  snapshot.company = { name: "明威贸易" };
  const mapCustomer = (name) => CUSTOMER_ZH[name] || name;
  snapshot.orders = snapshot.orders.map((order) => ({ ...order, customer: mapCustomer(order.customer) }));
  snapshot.invoices = snapshot.invoices.map((invoice) => ({
    ...invoice,
    customer: mapCustomer(invoice.customer),
    notes: invoice.kind === "credit_note" ? "价格调整沟通后开具的贷项发票。" : invoice.notes
  }));
  snapshot.payments = snapshot.payments.map((payment) => ({ ...payment, payer: mapCustomer(payment.payer) }));
  snapshot.anomalies = snapshot.anomalies.map((anomaly) => {
    const zh = ANOMALY_ZH[anomaly.id];
    if (!zh) return anomaly;
    return {
      ...anomaly,
      title: zh.title,
      customer: mapCustomer(anomaly.customer),
      reason: zh.reason,
      draft: zh.draft,
      agent_notes: zh.agent_notes ?? anomaly.agent_notes,
      evidence: { ...anomaly.evidence, rows: zh.rows, computed: zh.computed },
      decision: anomaly.decision
        ? { ...anomaly.decision, note: zh.decision_note || anomaly.decision.note }
        : null,
      execution: anomaly.execution
        ? { ...anomaly.execution, detail: zh.execution_detail || anomaly.execution.detail }
        : null
    };
  });
  snapshot.import_log = snapshot.import_log.map((entry) => ({
    ...entry,
    warnings: entry.warnings.map((warning) => warning
      .replace("Payment RCP-5560 references unknown invoice INV-2026-058.", "回款 RCP-5560 引用了不存在的发票 INV-2026-058。"))
  }));
  return snapshot;
}
