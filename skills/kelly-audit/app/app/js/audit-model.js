// Pure domain logic for kelly-audit, ported verbatim (same variable names,
// same order of operations, only TS types stripped) from the retired
// app/server/compute.ts (deriveSnapshot/round2/dateOnly/daysBetween/
// isCreditNote/toBase/agingBucketKey/agingBucketKeys/DEFAULT_RULES) and
// scripts/run_checks.ts (detectAnomalies/chaseDraft/moneyText). The
// linking/aging/metrics math is unchanged; only the write target moved from
// a single app/.data/audit_snapshot.json file to five Busabase Bases
// (orders/invoices/payments/anomalies/settings) read fresh on every
// getState(), so buildSnapshot() below takes those rows directly instead of
// mutating a persisted snapshot object.
//
// statusForVerdict is ported verbatim from the retired
// lib/data-provider/local-file-provider.ts's applyDecision() combined with
// lib/audit-core.ts's mergeAnomalies() status-transition table.
//
// OPERATION_BY_RULE and planExecution are ported verbatim from the retired
// scripts/execute_decisions.ts.

export const DEFAULT_RULES = {
  days_to_invoice: 14,
  amount_tolerance_pct: 1,
  aging_buckets: [30, 60, 90],
  duplicate_window_days: 7,
};

export function round2(value = 0) {
  return Number(Number(value || 0).toFixed(2));
}

export function dateOnly(value = "") {
  if (!value) return "";
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

export function daysBetween(fromDate = "", toDate = "") {
  const from = new Date(`${dateOnly(fromDate)}T00:00:00Z`).getTime();
  const to = new Date(`${dateOnly(toDate) || String(toDate).slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.floor((to - from) / 86400000);
}

export function isCreditNote(invoice = {}) {
  return invoice.kind === "credit_note" || Number(invoice.amount || 0) < 0;
}

export function toBase(amount = 0, currency = "", snapshot = {}) {
  const base = snapshot.base_currency || "USD";
  if (!currency || currency === base) return Number(amount || 0);
  const rate = Number(snapshot.fx_rates?.[currency] || 0);
  return rate ? Number(amount || 0) * rate : Number(amount || 0);
}

function normalizeRules(rules) {
  const merged = { ...DEFAULT_RULES, ...(rules || {}) };
  const buckets =
    Array.isArray(merged.aging_buckets) && merged.aging_buckets.length
      ? [...merged.aging_buckets].map(Number).sort((a, b) => a - b)
      : DEFAULT_RULES.aging_buckets;
  return { ...merged, aging_buckets: buckets };
}

export function agingBucketKey(daysOverdue, buckets) {
  if (daysOverdue <= 0) return "current";
  let lower = 0;
  for (const edge of buckets) {
    if (daysOverdue <= edge) return `${lower + 1}-${edge}`;
    lower = edge;
  }
  return `${buckets[buckets.length - 1]}+`;
}

export function agingBucketKeys(buckets) {
  const keys = ["current"];
  let lower = 0;
  for (const edge of buckets) {
    keys.push(`${lower + 1}-${edge}`);
    lower = edge;
  }
  keys.push(`${buckets[buckets.length - 1]}+`);
  return keys;
}

function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ---- Normalization: Busabase rows (already snake_cased by the provider) -> item shapes ----

export function normalizeOrderRow({
  order_id = "",
  order_no = "",
  customer = "",
  order_date = "",
  amount = 0,
  currency = "USD",
  source_file = "",
} = {}) {
  return {
    order_id,
    order_no,
    customer,
    order_date,
    amount: Number(amount) || 0,
    currency,
    source_file,
    invoice_ids: [],
    payment_ids: [],
    anomaly_ids: [],
  };
}

export function normalizeInvoiceRow({
  invoice_id = "",
  invoice_no = "",
  order_no = "",
  customer = "",
  issue_date = "",
  due_date = "",
  amount = 0,
  currency = "USD",
  kind = "invoice",
  notes = "",
  source_file = "",
} = {}) {
  return {
    invoice_id,
    invoice_no,
    order_no,
    customer,
    issue_date,
    due_date,
    amount: Number(amount) || 0,
    currency,
    kind,
    notes,
    source_file,
    payment_ids: [],
    anomaly_ids: [],
  };
}

export function normalizePaymentRow({
  payment_id = "",
  payment_ref = "",
  invoice_no = "",
  order_no = "",
  payer = "",
  paid_date = "",
  amount = 0,
  currency = "USD",
  method = "other",
  source_file = "",
} = {}) {
  return {
    payment_id,
    payment_ref,
    invoice_no,
    order_no,
    payer,
    paid_date,
    amount: Number(amount) || 0,
    currency,
    method,
    source_file,
  };
}

export function normalizeAnomalyRow({
  anomaly_id = "",
  ref = 0,
  rule = "irregular_entry",
  severity = "medium",
  status = "needs_review",
  title = "",
  customer = "",
  amount_at_stake = 0,
  currency = "USD",
  aging_bucket = "",
  reason = "",
  evidence = "",
  proposed_action = "flag_to_accountant",
  draft = "",
  agent_notes = "",
  created_at = "",
  resolved_at = "",
  decision_action = "",
  decision_note = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
} = {}) {
  return {
    id: anomaly_id,
    ref: Number(ref) || 0,
    rule,
    severity,
    status,
    title: title || "(untitled anomaly)",
    customer,
    amount_at_stake: Number(amount_at_stake) || 0,
    currency,
    aging_bucket: aging_bucket || undefined,
    reason,
    evidence: parseJsonValue(evidence, { rows: [], computed: "" }) || { rows: [], computed: "" },
    proposed_action,
    draft,
    agent_notes,
    created_at,
    resolved_at: resolved_at || undefined,
    decision: decision_action ? { action: decision_action, note: decision_note, draft: null, decided_at } : null,
    execution: execution_status
      ? {
          status: execution_status,
          operation: execution_operation,
          target: execution_target,
          detail: execution_detail,
          executed_at,
        }
      : null,
  };
}

// Ported verbatim from the retired lib/data-provider/local-file-provider.ts's
// applyDecision() + lib/audit-core.ts's mergeAnomalies() status table.
export function statusForVerdict(action, currentStatus = "needs_review") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  if (action === "dismiss") return "done";
  return currentStatus; // "revise" edits the draft only, status is unchanged
}

export const DECISION_ACTIONS = new Set(["approve", "request_changes", "revise", "block", "dismiss"]);

// Mutates and returns the snapshot: recomputes links, statuses, matches,
// aging, and metrics from the orders/invoices/payments/anomalies tables
// already on it. Ported verbatim from the retired app/server/compute.ts's
// deriveSnapshot() — same variable names, same order of operations — so the
// demo provider can call it directly on hand-built demo tables exactly like
// the retired app/server/demo.ts did (`deriveSnapshot(snapshot, RULES, NOW)`).
export function deriveSnapshot(snapshot, rules, now = new Date().toISOString()) {
  const cfg = normalizeRules(rules);
  snapshot.orders = snapshot.orders || [];
  snapshot.invoices = snapshot.invoices || [];
  snapshot.payments = snapshot.payments || [];
  snapshot.anomalies = snapshot.anomalies || [];
  for (const order of snapshot.orders) {
    order.invoice_ids = [];
    order.payment_ids = [];
    order.anomaly_ids = [];
  }
  for (const invoice of snapshot.invoices) {
    invoice.payment_ids = [];
    invoice.anomaly_ids = [];
  }

  const orderByNo = new Map();
  for (const order of snapshot.orders) {
    if (order.order_no && !orderByNo.has(order.order_no)) orderByNo.set(order.order_no, order);
  }
  const invoiceByNo = new Map();
  const invoiceById = new Map();
  for (const invoice of snapshot.invoices) {
    invoice.order_id = orderByNo.get(invoice.order_no)?.order_id || "";
    if (invoice.invoice_no && !invoiceByNo.has(invoice.invoice_no)) invoiceByNo.set(invoice.invoice_no, invoice);
    invoiceById.set(invoice.invoice_id, invoice);
    const order = orderByNo.get(invoice.order_no);
    if (order) order.invoice_ids.push(invoice.invoice_id);
  }

  const matches = [];
  for (const payment of snapshot.payments) {
    const invoice = payment.invoice_no ? invoiceByNo.get(payment.invoice_no) : null;
    payment.invoice_id = invoice?.invoice_id || "";
    payment.order_id = invoice?.order_id || orderByNo.get(payment.order_no || "")?.order_id || "";
    payment.match_status = invoice ? "matched" : "unmatched";
    if (invoice) {
      invoice.payment_ids.push(payment.payment_id);
      const order = snapshot.orders.find((item) => item.order_id === invoice.order_id);
      if (order && !order.payment_ids.includes(payment.payment_id)) order.payment_ids.push(payment.payment_id);
      matches.push({
        match_id: `match-${payment.payment_id}`,
        order_id: invoice.order_id || "",
        invoice_id: invoice.invoice_id,
        payment_id: payment.payment_id,
        rule: "invoice_no",
        amount_delta: round2(Number(payment.amount || 0) - Number(invoice.amount || 0)),
      });
    }
  }

  const paymentById = new Map(snapshot.payments.map((payment) => [payment.payment_id, payment]));
  for (const invoice of snapshot.invoices) {
    const paid = invoice.payment_ids.reduce((sum, id) => sum + Number(paymentById.get(id)?.amount || 0), 0);
    invoice.paid_amount = round2(paid);
    invoice.outstanding = round2(Number(invoice.amount || 0) - paid);
    invoice.days_overdue = 0;
    if (!isCreditNote(invoice) && invoice.outstanding > 0.005 && invoice.due_date) {
      invoice.days_overdue = Math.max(daysBetween(invoice.due_date, now), 0);
    }
    if (isCreditNote(invoice)) invoice.status = "credit_note";
    else if (invoice.outstanding <= 0.005) invoice.status = "paid";
    else if (invoice.days_overdue > 0) invoice.status = "overdue";
    else if (invoice.paid_amount > 0) invoice.status = "partial";
    else invoice.status = "open";
  }

  for (const order of snapshot.orders) {
    const linked = order.invoice_ids
      .map((id) => invoiceById.get(id))
      .filter(Boolean)
      .filter((invoice) => !isCreditNote(invoice));
    if (!linked.length) {
      order.invoice_status = "missing";
      order.payment_status = "unpaid";
      continue;
    }
    const invoiced = linked.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    const tolerance = Math.abs(Number(order.amount || 0)) * (cfg.amount_tolerance_pct / 100);
    order.invoice_status =
      Math.abs(invoiced - Number(order.amount || 0)) <= tolerance + 0.005 ? "invoiced" : "mismatch";
    const outstanding = linked.reduce((sum, invoice) => sum + Number(invoice.outstanding || 0), 0);
    const paid = linked.reduce((sum, invoice) => sum + Number(invoice.paid_amount || 0), 0);
    if (outstanding <= 0.005) order.payment_status = "paid";
    else if (paid > 0) order.payment_status = "partial";
    else order.payment_status = "unpaid";
  }

  for (const anomaly of snapshot.anomalies) {
    const evidence = anomaly.evidence || {};
    const order = snapshot.orders.find((item) => item.order_id === evidence.order_id);
    if (order && !order.anomaly_ids.includes(anomaly.id)) order.anomaly_ids.push(anomaly.id);
    const invoice = invoiceById.get(evidence.invoice_id || "");
    if (invoice && !invoice.anomaly_ids.includes(anomaly.id)) invoice.anomaly_ids.push(anomaly.id);
  }

  const bucketKeys = agingBucketKeys(cfg.aging_buckets);
  const aging = bucketKeys.map((bucket) => ({ bucket, amount: 0 }));
  const agingIndex = new Map(aging.map((entry, index) => [entry.bucket, index]));
  let receivableTotal = 0;
  let overdueTotal = 0;
  for (const invoice of snapshot.invoices) {
    if (isCreditNote(invoice) || invoice.outstanding <= 0.005) continue;
    const outstandingBase = toBase(invoice.outstanding, invoice.currency, snapshot);
    receivableTotal += outstandingBase;
    if (invoice.days_overdue > 0) overdueTotal += outstandingBase;
    const key = agingBucketKey(invoice.days_overdue, cfg.aging_buckets);
    aging[agingIndex.get(key)].amount = round2(aging[agingIndex.get(key)].amount + outstandingBase);
  }

  const openStatuses = new Set(["needs_review", "changes_requested"]);
  const stakeStatuses = new Set(["needs_review", "changes_requested", "approved"]);
  const matchedPayments = snapshot.payments.filter((payment) => payment.match_status === "matched").length;

  const orderDates = snapshot.orders
    .map((order) => order.order_date)
    .filter(Boolean)
    .sort();
  snapshot.range = { start: orderDates[0] || "", end: orderDates[orderDates.length - 1] || "" };
  snapshot.matches = matches;
  snapshot.metrics = {
    order_count: snapshot.orders.length,
    invoice_count: snapshot.invoices.length,
    payment_count: snapshot.payments.length,
    matched_payment_count: matchedPayments,
    matched_pct: snapshot.payments.length ? round2(matchedPayments / snapshot.payments.length) : 0,
    anomaly_count: snapshot.anomalies.length,
    open_anomaly_count: snapshot.anomalies.filter((anomaly) => openStatuses.has(anomaly.status)).length,
    at_stake_total: round2(
      snapshot.anomalies
        .filter((anomaly) => stakeStatuses.has(anomaly.status))
        .reduce((sum, anomaly) => sum + toBase(anomaly.amount_at_stake, anomaly.currency, snapshot), 0),
    ),
    receivable_total: round2(receivableTotal),
    overdue_receivable_total: round2(overdueTotal),
    aging,
  };
  if (!snapshot.orders.length && !snapshot.invoices.length && !snapshot.payments.length) {
    snapshot.warnings = [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No audit data yet. Import orders/invoices/payments, then run the checks.",
      },
    ];
  }
  return snapshot;
}

// Busabase-row wrapper: normalizes the raw orders/invoices/payments/anomalies
// rows read from Busabase (already snake_cased by the provider) into the
// Order/Invoice/Payment/Anomaly shapes deriveSnapshot() expects, pulls
// base_currency/fx_rates/company/rules off the live Settings row (no
// separate config store in the Busabase-only shape), then calls
// deriveSnapshot() to link and compute metrics — this is new orchestration,
// not a port, since the retired app/server/hono.ts read one persisted
// snapshot file instead of five live Bases.
/**
 * @param {{
 *   orders?: Array<Record<string, any>>,
 *   invoices?: Array<Record<string, any>>,
 *   payments?: Array<Record<string, any>>,
 *   anomalies?: Array<Record<string, any>>,
 *   settings?: Record<string, any>,
 *   now?: string,
 * }} [args]
 */
export function buildSnapshot({
  orders = [],
  invoices = [],
  payments = [],
  anomalies = [],
  settings = {},
  now = new Date().toISOString(),
} = {}) {
  const rules = {
    days_to_invoice: Number(settings.days_to_invoice || DEFAULT_RULES.days_to_invoice),
    amount_tolerance_pct: Number(settings.amount_tolerance_pct || DEFAULT_RULES.amount_tolerance_pct),
    aging_buckets: parseJsonValue(settings.aging_buckets, DEFAULT_RULES.aging_buckets) || DEFAULT_RULES.aging_buckets,
    duplicate_window_days: Number(settings.duplicate_window_days || DEFAULT_RULES.duplicate_window_days),
  };
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-audit",
    base_currency: settings.base_currency || "USD",
    fx_rates: parseJsonValue(settings.fx_rates, {}) || {},
    company: { name: settings.company_name || "" },
    range: { start: "", end: "" },
    orders: orders.map(normalizeOrderRow),
    invoices: invoices.map(normalizeInvoiceRow),
    payments: payments.map(normalizePaymentRow),
    matches: [],
    anomalies: anomalies.map(normalizeAnomalyRow),
    warnings: [],
  };
  return deriveSnapshot(snapshot, rules, now);
}

// Sanitized config summary for #/settings — no separate config store in the
// Busabase-only shape, so this reads straight off the live Settings row.
/**
 * @param {{ settings?: Record<string, any> }} [args]
 */
export function buildConfigSummary({ settings = {} } = {}) {
  const rules = {
    days_to_invoice: Number(settings.days_to_invoice || DEFAULT_RULES.days_to_invoice),
    amount_tolerance_pct: Number(settings.amount_tolerance_pct || DEFAULT_RULES.amount_tolerance_pct),
    aging_buckets: parseJsonValue(settings.aging_buckets, DEFAULT_RULES.aging_buckets) || DEFAULT_RULES.aging_buckets,
    duplicate_window_days: Number(settings.duplicate_window_days || DEFAULT_RULES.duplicate_window_days),
  };
  const summarizeColumns = (value) => {
    const columns = parseJsonValue(value, {}) || {};
    return { format: "csv", columns };
  };
  return {
    config_path: "busabase",
    is_example: false,
    company: {
      name: settings.company_name || "",
      contact_email: settings.contact_email || "",
    },
    base_currency: settings.base_currency || "USD",
    rules,
    import: {
      orders: summarizeColumns(settings.import_orders_columns),
      invoices: summarizeColumns(settings.import_invoices_columns),
      payments: summarizeColumns(settings.import_payments_columns),
    },
  };
}

// ---- Deterministic anomaly-detection rules, ported verbatim from the
// retired scripts/run_checks.ts's detectAnomalies()/chaseDraft()/moneyText() ----

export function moneyText(amount, currency) {
  return `${currency} ${round2(Math.abs(amount)).toFixed(2)}`;
}

export function chaseDraft(company, invoice, order) {
  return [
    `Subject: Payment reminder — invoice ${invoice.invoice_no} (${moneyText(invoice.outstanding, invoice.currency)}, ${invoice.days_overdue} days past due)`,
    "",
    `Hi ${invoice.customer || "there"} accounts team,`,
    "",
    `Our records show invoice ${invoice.invoice_no}${order ? ` for order ${order.order_no}` : ""} (${moneyText(invoice.amount, invoice.currency)}, issued ${invoice.issue_date}) was due on ${invoice.due_date} and remains ${invoice.paid_amount > 0 ? "partially paid" : "unpaid"} — ${invoice.days_overdue} days past due.`,
    "",
    "Could you confirm the payment status or share an expected remittance date? If the invoice or bank details need to be reissued, tell us and we will send them today.",
    "",
    "Thank you,",
    `${company || "Finance"} — Finance`,
  ].join("\n");
}

export function detectAnomalies(snapshot, rules, now) {
  const company = snapshot.company?.name || "";
  const detected = [];
  const orders = snapshot.orders || [];
  const invoices = snapshot.invoices || [];
  const payments = snapshot.payments || [];
  const invoiceById = new Map(invoices.map((invoice) => [invoice.invoice_id, invoice]));
  const orderById = new Map(orders.map((order) => [order.order_id, order]));

  // 1. missing_invoice: order without any invoice after N days.
  for (const order of orders) {
    if (order.invoice_status !== "missing" || !order.order_date) continue;
    const age = daysBetween(order.order_date, now);
    if (age <= rules.days_to_invoice) continue;
    detected.push({
      id: `anom-missing_invoice-${order.order_id}`,
      rule: "missing_invoice",
      severity: "medium",
      title: `Order ${order.order_no} (${order.customer}) uninvoiced for ${age} days`,
      customer: order.customer,
      amount_at_stake: round2(order.amount),
      currency: order.currency,
      reason: `Order ${order.order_no} (${moneyText(order.amount, order.currency)}, ${order.order_date}) has no invoice after ${age} days; the policy threshold is ${rules.days_to_invoice} days.`,
      evidence: {
        order_id: order.order_id,
        invoice_id: "",
        payment_ids: [],
        rows: [
          {
            label: `Order ${order.order_no}`,
            detail: `${order.customer} · ${order.order_date}`,
            amount: order.amount,
            currency: order.currency,
          },
          { label: "Invoice", detail: "None found in imported invoices", amount: 0, currency: order.currency },
        ],
        computed: `${age} days since order date · threshold ${rules.days_to_invoice} days.`,
      },
      proposed_action: "reissue_invoice",
      draft: `Internal request — billing:\n\nOrder ${order.order_no} for ${order.customer} (${moneyText(order.amount, order.currency)}, ${order.order_date}) has not been invoiced. Please issue the invoice with standard terms and reference ${order.order_no}.`,
    });
  }

  // 2. amount_mismatch: invoiced total differs from order amount beyond tolerance.
  for (const order of orders) {
    if (order.invoice_status !== "mismatch") continue;
    const linked = (order.invoice_ids || [])
      .map((id) => invoiceById.get(id))
      .filter(Boolean)
      .filter((invoice) => !isCreditNote(invoice));
    const invoiced = linked.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    const delta = round2(invoiced - Number(order.amount || 0));
    const deltaPct = order.amount ? Math.abs(delta / order.amount) * 100 : 0;
    const first = linked[0];
    detected.push({
      id: `anom-amount_mismatch-${order.order_id}`,
      rule: "amount_mismatch",
      severity: Math.abs(delta) >= 1000 ? "high" : "medium",
      title: `Invoice total ${delta < 0 ? "under" : "over"} order amount for ${order.customer}`,
      customer: order.customer,
      amount_at_stake: Math.abs(delta),
      currency: order.currency,
      reason: `Order ${order.order_no} totals ${moneyText(order.amount, order.currency)} but the linked invoice(s) total ${moneyText(invoiced, order.currency)} — a ${delta < 0 ? "-" : "+"}${moneyText(delta, order.currency)} (${deltaPct.toFixed(1)}%) gap, beyond the ${rules.amount_tolerance_pct}% tolerance.`,
      evidence: {
        order_id: order.order_id,
        invoice_id: first?.invoice_id || "",
        payment_ids: linked.flatMap((invoice) => invoice.payment_ids || []),
        rows: [
          {
            label: `Order ${order.order_no}`,
            detail: `${order.customer} · ${order.order_date}`,
            amount: order.amount,
            currency: order.currency,
          },
          ...linked.map((invoice) => ({
            label: `Invoice ${invoice.invoice_no}`,
            detail: `Issued ${invoice.issue_date} · due ${invoice.due_date}`,
            amount: invoice.amount,
            currency: invoice.currency,
          })),
        ],
        computed: `Invoice − order = ${delta < 0 ? "-" : "+"}${moneyText(delta, order.currency)} (${deltaPct.toFixed(1)}%) · tolerance ${rules.amount_tolerance_pct}%.`,
      },
      proposed_action: "reissue_invoice",
      draft: `Internal request — billing:\n\nInvoice ${first?.invoice_no || ""} was issued at ${moneyText(invoiced, order.currency)} against order ${order.order_no} (${moneyText(order.amount, order.currency)}). Please confirm whether the difference was agreed. If not, issue a corrected or supplementary invoice for ${moneyText(delta, order.currency)} referencing ${order.order_no}.`,
    });
  }

  // 3. overdue_receivable: invoice unpaid past due date, with aging buckets.
  for (const invoice of invoices) {
    if (invoice.status !== "overdue") continue;
    const order = orderById.get(invoice.order_id || "");
    const bucket = agingBucketKey(invoice.days_overdue, rules.aging_buckets);
    detected.push({
      id: `anom-overdue_receivable-${invoice.invoice_id}`,
      rule: "overdue_receivable",
      severity: invoice.days_overdue > rules.aging_buckets[0] ? "high" : "medium",
      title: `${invoice.customer} invoice ${invoice.days_overdue} days past due`,
      customer: invoice.customer,
      amount_at_stake: round2(invoice.outstanding),
      currency: invoice.currency,
      aging_bucket: bucket,
      reason: `Invoice ${invoice.invoice_no} (${moneyText(invoice.amount, invoice.currency)}) was due ${invoice.due_date} and is still ${invoice.paid_amount > 0 ? "partially unpaid" : "unpaid"}. ${invoice.days_overdue} days overdue puts it in the ${bucket} aging bucket.`,
      evidence: {
        order_id: invoice.order_id || "",
        invoice_id: invoice.invoice_id,
        payment_ids: invoice.payment_ids || [],
        rows: [
          ...(order
            ? [
                {
                  label: `Order ${order.order_no}`,
                  detail: `${order.customer} · ${order.order_date}`,
                  amount: order.amount,
                  currency: order.currency,
                },
              ]
            : []),
          {
            label: `Invoice ${invoice.invoice_no}`,
            detail: `Issued ${invoice.issue_date} · due ${invoice.due_date}`,
            amount: invoice.amount,
            currency: invoice.currency,
          },
          {
            label: "Payments",
            detail:
              invoice.paid_amount > 0
                ? `Partial: ${moneyText(invoice.paid_amount, invoice.currency)} received`
                : "No payment received",
            amount: invoice.paid_amount,
            currency: invoice.currency,
          },
        ],
        computed: `Outstanding ${moneyText(invoice.outstanding, invoice.currency)} · ${invoice.days_overdue} days past due as of ${now.slice(0, 10)}.`,
      },
      proposed_action: "chase_receivable",
      draft: chaseDraft(company, invoice, order),
    });
  }

  // 4. duplicate: duplicate payments (same invoice + amount within the window)
  //    and duplicate invoice numbers.
  const paymentGroups = new Map();
  for (const payment of payments) {
    const key = `${payment.invoice_no}|${payment.amount}|${payment.currency}`;
    if (!payment.invoice_no) continue;
    if (!paymentGroups.has(key)) paymentGroups.set(key, []);
    paymentGroups.get(key).push(payment);
  }
  for (const group of paymentGroups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => String(a.paid_date).localeCompare(String(b.paid_date)));
    for (let i = 1; i < sorted.length; i += 1) {
      const first = sorted[0];
      const dup = sorted[i];
      if (Math.abs(daysBetween(first.paid_date, dup.paid_date)) > rules.duplicate_window_days) continue;
      detected.push({
        id: `anom-duplicate-${dup.payment_id}`,
        rule: "duplicate",
        severity: "high",
        title: `Duplicate payment from ${dup.payer || dup.invoice_no}`,
        customer: dup.payer,
        amount_at_stake: round2(dup.amount),
        currency: dup.currency,
        reason: `Payments ${first.payment_ref} (${first.paid_date}) and ${dup.payment_ref} (${dup.paid_date}) both pay invoice ${dup.invoice_no} with the same amount ${moneyText(dup.amount, dup.currency)} within ${rules.duplicate_window_days} days.`,
        evidence: {
          order_id: dup.order_id || "",
          invoice_id: dup.invoice_id || "",
          payment_ids: [first.payment_id, dup.payment_id],
          rows: [
            {
              label: `Payment ${first.payment_ref}`,
              detail: `${first.method} · ${first.paid_date}`,
              amount: first.amount,
              currency: first.currency,
            },
            {
              label: `Payment ${dup.payment_ref}`,
              detail: `${dup.method} · ${dup.paid_date} · same amount`,
              amount: dup.amount,
              currency: dup.currency,
            },
          ],
          computed: `Two identical payments against invoice ${dup.invoice_no} · overpaid ${moneyText(dup.amount, dup.currency)}.`,
        },
        proposed_action: "flag_to_accountant",
        draft: `Flag for the accountant:\n\nInvoice ${dup.invoice_no} (${dup.payer}) received two identical payments of ${moneyText(dup.amount, dup.currency)} (${first.payment_ref}, ${dup.payment_ref}) within ${rules.duplicate_window_days} days. Please verify both cleared, then refund the duplicate or apply it as a credit after confirming with the customer.`,
      });
    }
  }
  const invoiceNoCounts = new Map();
  for (const invoice of invoices) {
    invoiceNoCounts.set(invoice.invoice_no, (invoiceNoCounts.get(invoice.invoice_no) || 0) + 1);
  }
  const seenInvoiceNos = new Set();
  for (const invoice of invoices) {
    if ((invoiceNoCounts.get(invoice.invoice_no) || 0) < 2) continue;
    if (!seenInvoiceNos.has(invoice.invoice_no)) {
      seenInvoiceNos.add(invoice.invoice_no);
      continue;
    }
    detected.push({
      id: `anom-duplicate-${invoice.invoice_id}-no`,
      rule: "duplicate",
      severity: "medium",
      title: `Duplicate invoice number ${invoice.invoice_no}`,
      customer: invoice.customer,
      amount_at_stake: round2(Math.abs(invoice.amount)),
      currency: invoice.currency,
      reason: `Invoice number ${invoice.invoice_no} appears more than once in the imported invoices.`,
      evidence: {
        order_id: invoice.order_id || "",
        invoice_id: invoice.invoice_id,
        payment_ids: [],
        rows: [
          {
            label: `Invoice ${invoice.invoice_no}`,
            detail: `Issued ${invoice.issue_date}`,
            amount: invoice.amount,
            currency: invoice.currency,
          },
        ],
        computed: `Invoice number ${invoice.invoice_no} duplicated in the import.`,
      },
      proposed_action: "flag_to_accountant",
      draft: `Flag for the accountant:\n\nInvoice number ${invoice.invoice_no} appears more than once in the imported invoice table. Please confirm which record is canonical and void or renumber the other.`,
    });
  }

  // 5. unmatched_payment: payment without a matching invoice.
  for (const payment of payments) {
    if (payment.match_status !== "unmatched") continue;
    detected.push({
      id: `anom-unmatched_payment-${payment.payment_id}`,
      rule: "unmatched_payment",
      severity: "medium",
      title: `Payment from ${payment.payer || payment.payment_ref} matches no invoice`,
      customer: payment.payer,
      amount_at_stake: round2(Math.abs(payment.amount)),
      currency: payment.currency,
      reason: payment.invoice_no
        ? `Payment ${payment.payment_ref} (${moneyText(payment.amount, payment.currency)}, ${payment.paid_date}) references invoice ${payment.invoice_no}, which does not exist in the imported invoices.`
        : `Payment ${payment.payment_ref} (${moneyText(payment.amount, payment.currency)}, ${payment.paid_date}) carries no invoice reference and matches no imported invoice.`,
      evidence: {
        order_id: payment.order_id || "",
        invoice_id: "",
        payment_ids: [payment.payment_id],
        rows: [
          {
            label: `Payment ${payment.payment_ref}`,
            detail: `${payment.method} · ${payment.paid_date}${payment.invoice_no ? ` · memo: ${payment.invoice_no}` : ""}`,
            amount: payment.amount,
            currency: payment.currency,
          },
          {
            label: payment.invoice_no ? `Invoice ${payment.invoice_no}` : "Invoice",
            detail: "Not found in imported invoices",
            amount: 0,
            currency: payment.currency,
          },
        ],
        computed: `${moneyText(payment.amount, payment.currency)} received with no matching invoice or order.`,
      },
      proposed_action: "flag_to_accountant",
      draft: `Flag for the accountant:\n\nPayment ${payment.payment_ref} from ${payment.payer || "an unknown payer"} (${moneyText(payment.amount, payment.currency)}, ${payment.paid_date}) matches no invoice in our books${payment.invoice_no ? ` (memo cites ${payment.invoice_no})` : ""}. Please check whether an invoice was issued outside the export window and confirm what this payment covers before applying it.`,
    });
  }

  // 6. irregular_entry: credit notes / negative amounts without a paper trail.
  for (const invoice of invoices) {
    if (!isCreditNote(invoice)) continue;
    if (invoice.order_id) continue;
    detected.push({
      id: `anom-irregular_entry-${invoice.invoice_id}`,
      rule: "irregular_entry",
      severity: "medium",
      title: `Credit note ${invoice.invoice_no} without a linked original invoice`,
      customer: invoice.customer,
      amount_at_stake: round2(Math.abs(invoice.amount)),
      currency: invoice.currency,
      reason: `Credit note ${invoice.invoice_no} (${invoice.amount < 0 ? "-" : ""}${moneyText(invoice.amount, invoice.currency)}, ${invoice.issue_date}) for ${invoice.customer} references no order and no original invoice.`,
      evidence: {
        order_id: "",
        invoice_id: invoice.invoice_id,
        payment_ids: [],
        rows: [
          {
            label: `Credit note ${invoice.invoice_no}`,
            detail: `Issued ${invoice.issue_date} · no order reference`,
            amount: invoice.amount,
            currency: invoice.currency,
          },
          { label: "Original invoice", detail: "No linked invoice found", amount: 0, currency: invoice.currency },
        ],
        computed: `Negative entry ${invoice.amount < 0 ? "-" : ""}${moneyText(invoice.amount, invoice.currency)} with no linked original document.`,
      },
      proposed_action: "flag_to_accountant",
      draft: `Flag for the accountant:\n\nCredit note ${invoice.invoice_no} (${invoice.amount < 0 ? "-" : ""}${moneyText(invoice.amount, invoice.currency)}) for ${invoice.customer} has no linked original invoice or order. Please attach the supporting agreement or reverse the credit note.`,
    });
  }
  for (const payment of payments) {
    if (Number(payment.amount || 0) >= 0) continue;
    detected.push({
      id: `anom-irregular_entry-${payment.payment_id}`,
      rule: "irregular_entry",
      severity: "medium",
      title: `Negative payment ${payment.payment_ref}`,
      customer: payment.payer,
      amount_at_stake: round2(Math.abs(payment.amount)),
      currency: payment.currency,
      reason: `Payment ${payment.payment_ref} (${payment.paid_date}) has a negative amount, which usually means a refund or reversal that needs its own paper trail.`,
      evidence: {
        order_id: payment.order_id || "",
        invoice_id: payment.invoice_id || "",
        payment_ids: [payment.payment_id],
        rows: [
          {
            label: `Payment ${payment.payment_ref}`,
            detail: `${payment.method} · ${payment.paid_date}`,
            amount: payment.amount,
            currency: payment.currency,
          },
        ],
        computed: `Negative payment of ${moneyText(payment.amount, payment.currency)}.`,
      },
      proposed_action: "flag_to_accountant",
      draft: `Flag for the accountant:\n\nPayment ${payment.payment_ref} from ${payment.payer || "an unknown payer"} is negative (${payment.amount} ${payment.currency}). Please confirm the refund/reversal it belongs to and document it.`,
    });
  }

  return detected;
}

// Ported verbatim from the retired scripts/execute_decisions.ts: maps an
// approved anomaly's rule to the concrete follow-up operation the agent must
// perform outside the app, and the evidence-derived target document id.
export const OPERATION_BY_RULE = {
  overdue_receivable: "chase_receivable",
  amount_mismatch: "reissue_invoice",
  missing_invoice: "reissue_invoice",
  duplicate: "flag_to_accountant",
  unmatched_payment: "flag_to_accountant",
  irregular_entry: "flag_to_accountant",
};

export function planExecution(anomaly, { apply = false, hasEditedDraft = false } = {}) {
  const operation = OPERATION_BY_RULE[anomaly.rule] || "flag_to_accountant";
  const evidence = anomaly.evidence || {};
  const target = evidence.invoice_id || evidence.order_id || (evidence.payment_ids || [])[0] || "";
  if (!target) {
    return {
      operation,
      target: "",
      status: "blocked",
      detail: "No target order/invoice/payment id in the evidence; ask the user before executing.",
    };
  }
  return {
    operation,
    target,
    status: apply ? "ready_for_agent" : "planned",
    detail: apply
      ? `Approved: agent should ${operation.replaceAll("_", " ")} for ${target} (${anomaly.customer}) using the ${hasEditedDraft ? "user-edited" : "agent"} draft — e.g. send the chasing email via kelly-email or open the billing task — then record the real result here.`
      : `Dry run: would ${operation.replaceAll("_", " ")} for ${target} using the ${hasEditedDraft ? "user-edited" : "agent"} draft. No email sent, no records changed.`,
  };
}
