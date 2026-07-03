#!/usr/bin/env node
// Deterministic anomaly detection over app/.data/audit_snapshot.json.
// Implements the kelly-audit rule set (see references/audit-schema.md):
//   missing_invoice, amount_mismatch, overdue_receivable, duplicate,
//   unmatched_payment, irregular_entry.
// Anomaly ids are stable (anom-<rule>-<primary key>) so re-runs upsert
// instead of duplicating; anomalies whose condition cleared are auto-resolved
// to `done`. Existing statuses, refs, decisions, and executions are preserved.
// Honors app/.data/agent.lock. No network access.
//
// Usage: node scripts/run_checks.mjs

import fs from "node:fs/promises";
import { LOCK_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import {
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  readConfig,
  readJson,
  readLock,
  writeJson
} from "../app/server/store.mjs";
import { DEFAULT_RULES, agingBucketKey, daysBetween, deriveSnapshot, isCreditNote, round2 } from "../app/server/compute.mjs";

function fail(message) {
  console.error(`kelly-audit checks: ${message}`);
  process.exit(1);
}

function moneyText(amount, currency) {
  return `${currency} ${round2(Math.abs(amount)).toFixed(2)}`;
}

function chaseDraft(company, invoice, order) {
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
    `${company || "Finance"} — Finance`
  ].join("\n");
}

function detectAnomalies(snapshot, rules, now) {
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
          { label: `Order ${order.order_no}`, detail: `${order.customer} · ${order.order_date}`, amount: order.amount, currency: order.currency },
          { label: "Invoice", detail: "None found in imported invoices", amount: 0, currency: order.currency }
        ],
        computed: `${age} days since order date · threshold ${rules.days_to_invoice} days.`
      },
      proposed_action: "reissue_invoice",
      draft: `Internal request — billing:\n\nOrder ${order.order_no} for ${order.customer} (${moneyText(order.amount, order.currency)}, ${order.order_date}) has not been invoiced. Please issue the invoice with standard terms and reference ${order.order_no}.`
    });
  }

  // 2. amount_mismatch: invoiced total differs from order amount beyond tolerance.
  for (const order of orders) {
    if (order.invoice_status !== "mismatch") continue;
    const linked = (order.invoice_ids || []).map((id) => invoiceById.get(id)).filter(Boolean).filter((invoice) => !isCreditNote(invoice));
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
          { label: `Order ${order.order_no}`, detail: `${order.customer} · ${order.order_date}`, amount: order.amount, currency: order.currency },
          ...linked.map((invoice) => ({ label: `Invoice ${invoice.invoice_no}`, detail: `Issued ${invoice.issue_date} · due ${invoice.due_date}`, amount: invoice.amount, currency: invoice.currency }))
        ],
        computed: `Invoice − order = ${delta < 0 ? "-" : "+"}${moneyText(delta, order.currency)} (${deltaPct.toFixed(1)}%) · tolerance ${rules.amount_tolerance_pct}%.`
      },
      proposed_action: "reissue_invoice",
      draft: `Internal request — billing:\n\nInvoice ${first?.invoice_no || ""} was issued at ${moneyText(invoiced, order.currency)} against order ${order.order_no} (${moneyText(order.amount, order.currency)}). Please confirm whether the difference was agreed. If not, issue a corrected or supplementary invoice for ${moneyText(delta, order.currency)} referencing ${order.order_no}.`
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
          ...(order ? [{ label: `Order ${order.order_no}`, detail: `${order.customer} · ${order.order_date}`, amount: order.amount, currency: order.currency }] : []),
          { label: `Invoice ${invoice.invoice_no}`, detail: `Issued ${invoice.issue_date} · due ${invoice.due_date}`, amount: invoice.amount, currency: invoice.currency },
          { label: "Payments", detail: invoice.paid_amount > 0 ? `Partial: ${moneyText(invoice.paid_amount, invoice.currency)} received` : "No payment received", amount: invoice.paid_amount, currency: invoice.currency }
        ],
        computed: `Outstanding ${moneyText(invoice.outstanding, invoice.currency)} · ${invoice.days_overdue} days past due as of ${now.slice(0, 10)}.`
      },
      proposed_action: "chase_receivable",
      draft: chaseDraft(company, invoice, order)
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
            { label: `Payment ${first.payment_ref}`, detail: `${first.method} · ${first.paid_date}`, amount: first.amount, currency: first.currency },
            { label: `Payment ${dup.payment_ref}`, detail: `${dup.method} · ${dup.paid_date} · same amount`, amount: dup.amount, currency: dup.currency }
          ],
          computed: `Two identical payments against invoice ${dup.invoice_no} · overpaid ${moneyText(dup.amount, dup.currency)}.`
        },
        proposed_action: "flag_to_accountant",
        draft: `Flag for the accountant:\n\nInvoice ${dup.invoice_no} (${dup.payer}) received two identical payments of ${moneyText(dup.amount, dup.currency)} (${first.payment_ref}, ${dup.payment_ref}) within ${rules.duplicate_window_days} days. Please verify both cleared, then refund the duplicate or apply it as a credit after confirming with the customer.`
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
        rows: [{ label: `Invoice ${invoice.invoice_no}`, detail: `Issued ${invoice.issue_date}`, amount: invoice.amount, currency: invoice.currency }],
        computed: `Invoice number ${invoice.invoice_no} duplicated in the import.`
      },
      proposed_action: "flag_to_accountant",
      draft: `Flag for the accountant:\n\nInvoice number ${invoice.invoice_no} appears more than once in the imported invoice table. Please confirm which record is canonical and void or renumber the other.`
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
          { label: `Payment ${payment.payment_ref}`, detail: `${payment.method} · ${payment.paid_date}${payment.invoice_no ? ` · memo: ${payment.invoice_no}` : ""}`, amount: payment.amount, currency: payment.currency },
          { label: payment.invoice_no ? `Invoice ${payment.invoice_no}` : "Invoice", detail: "Not found in imported invoices", amount: 0, currency: payment.currency }
        ],
        computed: `${moneyText(payment.amount, payment.currency)} received with no matching invoice or order.`
      },
      proposed_action: "flag_to_accountant",
      draft: `Flag for the accountant:\n\nPayment ${payment.payment_ref} from ${payment.payer || "an unknown payer"} (${moneyText(payment.amount, payment.currency)}, ${payment.paid_date}) matches no invoice in our books${payment.invoice_no ? ` (memo cites ${payment.invoice_no})` : ""}. Please check whether an invoice was issued outside the export window and confirm what this payment covers before applying it.`
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
          { label: `Credit note ${invoice.invoice_no}`, detail: `Issued ${invoice.issue_date} · no order reference`, amount: invoice.amount, currency: invoice.currency },
          { label: "Original invoice", detail: "No linked invoice found", amount: 0, currency: invoice.currency }
        ],
        computed: `Negative entry ${invoice.amount < 0 ? "-" : ""}${moneyText(invoice.amount, invoice.currency)} with no linked original document.`
      },
      proposed_action: "flag_to_accountant",
      draft: `Flag for the accountant:\n\nCredit note ${invoice.invoice_no} (${invoice.amount < 0 ? "-" : ""}${moneyText(invoice.amount, invoice.currency)}) for ${invoice.customer} has no linked original invoice or order. Please attach the supporting agreement or reverse the credit note.`
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
        rows: [{ label: `Payment ${payment.payment_ref}`, detail: `${payment.method} · ${payment.paid_date}`, amount: payment.amount, currency: payment.currency }],
        computed: `Negative payment of ${moneyText(payment.amount, payment.currency)}.`
      },
      proposed_action: "flag_to_accountant",
      draft: `Flag for the accountant:\n\nPayment ${payment.payment_ref} from ${payment.payer || "an unknown payer"} is negative (${payment.amount} ${payment.currency}). Please confirm the refund/reversal it belongs to and document it.`
    });
  }

  return detected;
}

async function main() {
  await ensureDirs();
  await loadDotenvFiles(envSearchPaths());
  const existingLock = await readLock();
  if (existingLock) {
    fail(`agent.lock exists (owner: ${existingLock.owner}, started ${existingLock.started_at}). Wait for the other run to finish.`);
  }

  const snapshot = await readJson(SNAPSHOT_PATH, null);
  if (!snapshot) fail(`no snapshot at ${SNAPSHOT_PATH}. Run scripts/import_tables.mjs first.`);

  const configResult = await readConfig();
  const rules = { ...DEFAULT_RULES, ...(configResult.config?.rules || {}) };
  const now = new Date().toISOString();

  await writeJson(LOCK_PATH, {
    owner: "kelly-audit",
    message: "Running deterministic anomaly checks",
    started_at: now
  });

  try {
    deriveSnapshot(snapshot, rules, now);
    const detected = detectAnomalies(snapshot, rules, now);
    const detectedIds = new Set(detected.map((anomaly) => anomaly.id));
    const existing = snapshot.anomalies || [];
    const existingById = new Map(existing.map((anomaly) => [anomaly.id, anomaly]));

    let maxRef = existing.reduce((max, anomaly) => Math.max(max, Number(anomaly.ref || 0)), 0);
    let addedCount = 0;
    let updatedCount = 0;
    let resolvedCount = 0;

    const next = [];
    for (const anomaly of existing) {
      if (detectedIds.has(anomaly.id)) continue;
      if (anomaly.status !== "done") {
        resolvedCount += 1;
        next.push({
          ...anomaly,
          status: "done",
          resolved_at: now,
          agent_notes: [anomaly.agent_notes, `Auto-resolved: the flagged condition cleared on ${now.slice(0, 10)}.`].filter(Boolean).join(" ")
        });
      } else {
        next.push(anomaly);
      }
    }
    for (const anomaly of detected) {
      const previous = existingById.get(anomaly.id);
      if (previous) {
        updatedCount += 1;
        next.push({
          ...previous,
          ...anomaly,
          ref: previous.ref,
          status: previous.status,
          created_at: previous.created_at,
          draft: previous.decision?.draft ?? anomaly.draft,
          agent_notes: previous.agent_notes || anomaly.agent_notes || "",
          decision: previous.decision || null,
          execution: previous.execution || null
        });
      } else {
        maxRef += 1;
        addedCount += 1;
        next.push({
          ...anomaly,
          ref: maxRef,
          status: "needs_review",
          agent_notes: anomaly.agent_notes || "",
          created_at: now,
          decision: null,
          execution: null
        });
      }
    }
    next.sort((a, b) => Number(a.ref || 0) - Number(b.ref || 0));
    snapshot.anomalies = next;

    deriveSnapshot(snapshot, rules, now);
    snapshot.generated_at = now;
    snapshot.source = "kelly-audit";
    await writeJson(SNAPSHOT_PATH, snapshot);

    console.log(`Wrote ${SNAPSHOT_PATH}`);
    console.log(`  anomalies: +${addedCount} new, ${updatedCount} refreshed, ${resolvedCount} auto-resolved (total ${next.length})`);
    for (const anomaly of next.filter((item) => item.status === "needs_review")) {
      console.log(`  Anomaly #${anomaly.ref} [${anomaly.rule}] ${anomaly.title}`);
    }
  } finally {
    await fs.rm(LOCK_PATH, { force: true });
  }
}

await main();
