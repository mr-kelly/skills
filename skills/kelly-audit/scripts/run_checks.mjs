#!/usr/bin/env node
// Trusted hand-off step. Re-reads orders/invoices/payments straight from
// Busabase, links and derives statuses/aging via app/app/js/audit-model.js's
// deriveSnapshot() (the same pure function the AirApp uses to render), then
// runs the deterministic anomaly-detection rule set (detectAnomalies, also
// in audit-model.js, ported verbatim from the retired scripts/run_checks.ts)
// and upserts the Anomalies Base.
//
// Anomaly ids are stable (anom-<rule>-<key>), so re-runs upsert instead of
// duplicating; existing status/ref/decision/execution/agent_notes/created_at
// are preserved, and a currently-open anomaly whose condition cleared is
// auto-resolved to `done`. A previously-reviewed anomaly's draft (any
// decision has been recorded on it) is left untouched even if the rule text
// changed; an anomaly nobody has decided on yet gets the freshly generated
// draft, matching the retired script's `previous.decision?.draft ?? anomaly.draft`
// behavior as closely as the flat Busabase-row shape allows.
//
// Usage: node scripts/run_checks.mjs [--apply]
// Without --apply this is a dry run that only prints what would change.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { DEFAULT_RULES, buildSnapshot, detectAnomalies } from "../app/app/js/audit-model.js";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

function help() {
  console.log(`Usage: node scripts/run_checks.mjs [--apply]

Re-derives statuses/aging from Busabase's orders/invoices/payments Bases,
runs the deterministic anomaly rules (missing_invoice, amount_mismatch,
overdue_receivable, duplicate, unmatched_payment, irregular_entry), and
upserts the Anomalies Base. Anomalies whose condition cleared are
auto-resolved to "done". Without --apply this is a dry run.`);
}

const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));
const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
  const rows = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function upsert(client, declared, existing, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-audit-checks",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-audit-checks",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const apply = argv.includes("--apply");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Audit Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [orders, invoices, payments, existingAnomalies, settingsRows] = await Promise.all([
    readAll(client, declared("orders")),
    readAll(client, declared("invoices")),
    readAll(client, declared("payments")),
    readAll(client, declared("anomalies")),
    readAll(client, declared("settings")),
  ]);
  /** @type {Record<string, any>} */
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  if (!orders.length && !invoices.length && !payments.length) {
    throw new Error("No orders/invoices/payments found. Run scripts/import_tables.mjs first.");
  }

  const rules = {
    days_to_invoice: Number(settings.days_to_invoice || DEFAULT_RULES.days_to_invoice),
    amount_tolerance_pct: Number(settings.amount_tolerance_pct || DEFAULT_RULES.amount_tolerance_pct),
    aging_buckets: (() => {
      try {
        return settings.aging_buckets ? JSON.parse(settings.aging_buckets) : DEFAULT_RULES.aging_buckets;
      } catch {
        return DEFAULT_RULES.aging_buckets;
      }
    })(),
    duplicate_window_days: Number(settings.duplicate_window_days || DEFAULT_RULES.duplicate_window_days),
  };
  const now = new Date().toISOString();
  const snapshot = buildSnapshot({ orders, invoices, payments, anomalies: [], settings, now });
  const detected = detectAnomalies(snapshot, rules, now);
  const detectedIds = new Set(detected.map((anomaly) => anomaly.id));
  const existingById = new Map(existingAnomalies.map((row) => [row.anomaly_id, row]));

  let maxRef = existingAnomalies.reduce((max, row) => Math.max(max, Number(row.ref || 0)), 0);
  let addedCount = 0;
  let updatedCount = 0;
  let resolvedCount = 0;
  const writes = [];

  // Auto-resolve anomalies whose flagged condition cleared on this run.
  for (const row of existingAnomalies) {
    if (detectedIds.has(row.anomaly_id)) continue;
    if (row.status === "done") continue;
    resolvedCount += 1;
    writes.push({
      existing: row,
      fields: {
        anomaly_id: row.anomaly_id,
        ref: row.ref,
        rule: row.rule,
        severity: row.severity,
        status: "done",
        title: row.title,
        customer: row.customer,
        amount_at_stake: row.amount_at_stake,
        currency: row.currency,
        aging_bucket: row.aging_bucket || "",
        reason: row.reason,
        evidence: row.evidence || "",
        proposed_action: row.proposed_action,
        draft: row.draft || "",
        agent_notes: [row.agent_notes, `Auto-resolved: the flagged condition cleared on ${now.slice(0, 10)}.`]
          .filter(Boolean)
          .join(" "),
        created_at: row.created_at,
        resolved_at: now,
        decision_action: row.decision_action || "",
        decision_note: row.decision_note || "",
        decided_at: row.decided_at || "",
        execution_status: row.execution_status || "",
        execution_operation: row.execution_operation || "",
        execution_target: row.execution_target || "",
        execution_detail: row.execution_detail || "",
        executed_at: row.executed_at || "",
      },
      message: `Auto-resolve anomaly ${row.anomaly_id}`,
      logLabel: `resolved #${row.ref}`,
    });
  }

  // Upsert every currently-detected anomaly, preserving review state.
  for (const anomaly of detected) {
    const previous = existingById.get(anomaly.id);
    if (previous) {
      updatedCount += 1;
      const hasDecision = Boolean(previous.decision_action);
      writes.push({
        existing: previous,
        fields: {
          anomaly_id: anomaly.id,
          ref: previous.ref,
          rule: anomaly.rule,
          severity: anomaly.severity,
          status: previous.status,
          title: anomaly.title,
          customer: anomaly.customer,
          amount_at_stake: anomaly.amount_at_stake,
          currency: anomaly.currency,
          aging_bucket: anomaly.aging_bucket || "",
          reason: anomaly.reason,
          evidence: JSON.stringify(anomaly.evidence),
          proposed_action: anomaly.proposed_action,
          // A previously-decided anomaly keeps its (possibly user-edited)
          // draft; an untouched one gets the freshly generated draft.
          draft: hasDecision ? previous.draft || "" : anomaly.draft,
          agent_notes: previous.agent_notes || "",
          created_at: previous.created_at,
          resolved_at: previous.resolved_at || "",
          decision_action: previous.decision_action || "",
          decision_note: previous.decision_note || "",
          decided_at: previous.decided_at || "",
          execution_status: previous.execution_status || "",
          execution_operation: previous.execution_operation || "",
          execution_target: previous.execution_target || "",
          execution_detail: previous.execution_detail || "",
          executed_at: previous.executed_at || "",
        },
        message: `Refresh anomaly ${anomaly.id}`,
        logLabel: `refreshed #${previous.ref}`,
      });
    } else {
      maxRef += 1;
      addedCount += 1;
      writes.push({
        existing: null,
        fields: {
          anomaly_id: anomaly.id,
          ref: maxRef,
          rule: anomaly.rule,
          severity: anomaly.severity,
          status: "needs_review",
          title: anomaly.title,
          customer: anomaly.customer,
          amount_at_stake: anomaly.amount_at_stake,
          currency: anomaly.currency,
          aging_bucket: anomaly.aging_bucket || "",
          reason: anomaly.reason,
          evidence: JSON.stringify(anomaly.evidence),
          proposed_action: anomaly.proposed_action,
          draft: anomaly.draft,
          agent_notes: "",
          created_at: now,
          resolved_at: "",
          decision_action: "",
          decision_note: "",
          decided_at: "",
          execution_status: "",
          execution_operation: "",
          execution_target: "",
          execution_detail: "",
          executed_at: "",
        },
        message: `New anomaly ${anomaly.id}: ${anomaly.title}`,
        logLabel: `new #${maxRef}`,
      });
    }
  }

  for (const write of writes) {
    await upsert(client, declared("anomalies"), write.existing, write.fields, write.message, apply);
    console.log(`  Anomaly ${write.fields.anomaly_id} [${write.fields.rule}] ${write.logLabel}`);
  }

  console.log(`${apply ? "Wrote" : "Dry run for"} the Busabase anomalies Base`);
  console.log(`  anomalies: +${addedCount} new, ${updatedCount} refreshed, ${resolvedCount} auto-resolved`);
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
