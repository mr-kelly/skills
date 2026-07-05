// Shared deterministic derivation for the kelly-audit snapshot: linking
// orders/invoices/payments, statuses, receivable aging, and metrics.
// Used by the import script, the check script, and the demo builder so the
// UI always sees the same shapes regardless of who wrote the snapshot.

import type { AuditSnapshot, Evidence, Invoice, Rules } from "./types.ts";

export const DEFAULT_RULES: Rules = {
  days_to_invoice: 14,
  amount_tolerance_pct: 1,
  aging_buckets: [30, 60, 90],
  duplicate_window_days: 7,
};

export function round2(value: unknown): number {
  return Number(Number(value || 0).toFixed(2));
}

export function dateOnly(value: unknown): string {
  if (!value) return "";
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

export function daysBetween(fromDate: unknown, toDate: unknown): number {
  const from = new Date(`${dateOnly(fromDate)}T00:00:00Z`).getTime();
  const to = new Date(`${dateOnly(toDate) || String(toDate).slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.floor((to - from) / 86400000);
}

export function isCreditNote(invoice: Invoice): boolean {
  return invoice.kind === "credit_note" || Number(invoice.amount || 0) < 0;
}

export function toBase(amount: unknown, currency: string | undefined, snapshot: AuditSnapshot): number {
  const base = snapshot.base_currency || "USD";
  if (!currency || currency === base) return Number(amount || 0);
  const rate = Number(snapshot.fx_rates?.[currency] || 0);
  return rate ? Number(amount || 0) * rate : Number(amount || 0);
}

function normalizeRules(rules: Partial<Rules> | undefined): Rules {
  const merged = { ...DEFAULT_RULES, ...(rules || {}) };
  const buckets =
    Array.isArray(merged.aging_buckets) && merged.aging_buckets.length
      ? [...merged.aging_buckets].map(Number).sort((a, b) => a - b)
      : DEFAULT_RULES.aging_buckets;
  return { ...merged, aging_buckets: buckets };
}

export function agingBucketKey(daysOverdue: number, buckets: number[]): string {
  if (daysOverdue <= 0) return "current";
  let lower = 0;
  for (const edge of buckets) {
    if (daysOverdue <= edge) return `${lower + 1}-${edge}`;
    lower = edge;
  }
  return `${buckets[buckets.length - 1]}+`;
}

export function agingBucketKeys(buckets: number[]): string[] {
  const keys = ["current"];
  let lower = 0;
  for (const edge of buckets) {
    keys.push(`${lower + 1}-${edge}`);
    lower = edge;
  }
  keys.push(`${buckets[buckets.length - 1]}+`);
  return keys;
}

// Mutates and returns the snapshot: recomputes links, statuses, matches,
// aging, and metrics from the raw orders/invoices/payments/anomalies tables.
export function deriveSnapshot(
  snapshot: AuditSnapshot,
  rules: Partial<Rules> | undefined,
  now: string = new Date().toISOString(),
): AuditSnapshot {
  const cfg = normalizeRules(rules);
  const orders = snapshot.orders || [];
  const invoices = snapshot.invoices || [];
  const payments = snapshot.payments || [];
  const anomalies = snapshot.anomalies || [];

  const orderByNo = new Map();
  for (const order of orders) {
    order.invoice_ids = [];
    order.payment_ids = [];
    order.anomaly_ids = [];
    if (order.order_no && !orderByNo.has(order.order_no)) orderByNo.set(order.order_no, order);
  }
  const invoiceByNo = new Map();
  const invoiceById = new Map();
  for (const invoice of invoices) {
    invoice.payment_ids = [];
    invoice.anomaly_ids = [];
    invoice.order_id = orderByNo.get(invoice.order_no)?.order_id || "";
    if (invoice.invoice_no && !invoiceByNo.has(invoice.invoice_no)) invoiceByNo.set(invoice.invoice_no, invoice);
    invoiceById.set(invoice.invoice_id, invoice);
    const order = orderByNo.get(invoice.order_no);
    if (order) order.invoice_ids.push(invoice.invoice_id);
  }

  const matches = [];
  for (const payment of payments) {
    const invoice = payment.invoice_no ? invoiceByNo.get(payment.invoice_no) : null;
    payment.invoice_id = invoice?.invoice_id || "";
    payment.order_id = invoice?.order_id || orderByNo.get(payment.order_no || "")?.order_id || "";
    payment.match_status = invoice ? "matched" : "unmatched";
    if (invoice) {
      invoice.payment_ids.push(payment.payment_id);
      const order = orders.find((item) => item.order_id === invoice.order_id);
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

  const paymentById = new Map(payments.map((payment) => [payment.payment_id, payment]));
  for (const invoice of invoices) {
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

  for (const order of orders) {
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

  for (const anomaly of anomalies) {
    const evidence = anomaly.evidence || ({} as Evidence);
    const order = orders.find((item) => item.order_id === evidence.order_id);
    if (order && !order.anomaly_ids.includes(anomaly.id)) order.anomaly_ids.push(anomaly.id);
    const invoice = invoiceById.get(evidence.invoice_id || "");
    if (invoice && !invoice.anomaly_ids.includes(anomaly.id)) invoice.anomaly_ids.push(anomaly.id);
  }

  const bucketKeys = agingBucketKeys(cfg.aging_buckets);
  const aging = bucketKeys.map((bucket) => ({ bucket, amount: 0 }));
  const agingIndex = new Map(aging.map((entry, index) => [entry.bucket, index]));
  let receivableTotal = 0;
  let overdueTotal = 0;
  for (const invoice of invoices) {
    if (isCreditNote(invoice) || invoice.outstanding <= 0.005) continue;
    const outstandingBase = toBase(invoice.outstanding, invoice.currency, snapshot);
    receivableTotal += outstandingBase;
    if (invoice.days_overdue > 0) overdueTotal += outstandingBase;
    const key = agingBucketKey(invoice.days_overdue, cfg.aging_buckets);
    aging[agingIndex.get(key)].amount = round2(aging[agingIndex.get(key)].amount + outstandingBase);
  }

  const openStatuses = new Set(["needs_review", "changes_requested"]);
  const stakeStatuses = new Set(["needs_review", "changes_requested", "approved"]);
  const matchedPayments = payments.filter((payment) => payment.match_status === "matched").length;

  snapshot.matches = matches;
  snapshot.metrics = {
    order_count: orders.length,
    invoice_count: invoices.length,
    payment_count: payments.length,
    matched_payment_count: matchedPayments,
    matched_pct: payments.length ? round2(matchedPayments / payments.length) : 0,
    anomaly_count: anomalies.length,
    open_anomaly_count: anomalies.filter((anomaly) => openStatuses.has(anomaly.status)).length,
    at_stake_total: round2(
      anomalies
        .filter((anomaly) => stakeStatuses.has(anomaly.status))
        .reduce((sum, anomaly) => sum + toBase(anomaly.amount_at_stake, anomaly.currency, snapshot), 0),
    ),
    receivable_total: round2(receivableTotal),
    overdue_receivable_total: round2(overdueTotal),
    aging,
  };
  return snapshot;
}
