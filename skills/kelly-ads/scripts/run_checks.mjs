#!/usr/bin/env node
// Trusted hand-off step. Re-reads campaigns straight from Busabase, runs the
// deterministic anomaly-detection rule set (detectAnomalies, ported verbatim
// from the retired scripts/run_checks.ts into content/kelly-ads-app/app/js/ads-model.js — the
// same pure function the AirApp could call to preview), and upserts the
// Anomalies Base. New critical anomalies without a linked adjustment card
// get a skeleton adjustment card (skeletonAdjustment, also ported verbatim)
// drafted into the Adjustments Base.
//
// Anomaly ids are stable (anm-<type>-<campaign_id>[-<target_id>]), so
// re-runs upsert instead of duplicating: re-detection refreshes
// evidence/severity/detected_at, a cleared condition auto-resolves
// open/actioned to resolved, and dismissed stays dismissed. Idempotent:
// re-running without data changes produces the same anomalies and no
// duplicate cards.
//
// Usage: node scripts/run_checks.mjs [--apply]
// Without --apply this is a dry run that only prints what would change.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import {
  configFromSettings,
  detectAnomalies,
  normalizeCampaign,
  skeletonAdjustment,
} from "../content/kelly-ads-app/app/js/ads-model.js";
import { appConfig } from "../content/kelly-ads-app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/run_checks.mjs [--apply]

Re-derives anomalies from Busabase's campaigns Base (ACOS breach, budget
exhausted, zero-conversion spend, CPC spike, rejected) and upserts the
Anomalies Base. New critical anomalies without a linked adjustment card get
a skeleton adjustment card drafted into the Adjustments Base. Anomalies
whose condition cleared are auto-resolved. Without --apply this is a dry
run.`);
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
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
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
      author: "kelly-ads-checks",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-ads-checks",
    autoMerge: true,
  });
  return "created";
}

function parseJsonValue(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
    throw new Error("Kelly Ads Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [campaignRows, existingAnomalies, existingAdjustments, settingsRows] = await Promise.all([
    readAll(client, declared("campaigns")),
    readAll(client, declared("anomalies")),
    readAll(client, declared("adjustments")),
    readAll(client, declared("settings")),
  ]);
  if (!campaignRows.length) {
    throw new Error("No campaigns found. Run scripts/ingest_reports.mjs first.");
  }
  /** @type {Record<string, any>} */
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const config = configFromSettings(settings);

  const snapshot = {
    campaigns: campaignRows.map(normalizeCampaign),
    currency: settings.currency || "USD",
  };
  const found = detectAnomalies(snapshot, config.thresholds, config.targets.default_acos_pct);
  const foundIds = new Set(found.map((item) => item.anomaly_id));
  const existingById = new Map(existingAnomalies.map((row) => [row.anomaly_id, row]));

  let created = 0;
  let updated = 0;
  let resolved = 0;
  let drafted = 0;
  const now = new Date().toISOString();
  /** @type {Array<{ existing: Record<string, any> | null, fields: Record<string, any>, message: string }>} */
  const anomalyWrites = [];

  // Auto-resolve anomalies whose flagged condition cleared on this run.
  for (const row of existingAnomalies) {
    if (foundIds.has(row.anomaly_id)) continue;
    if (!["open", "actioned"].includes(row.state)) continue;
    resolved += 1;
    anomalyWrites.push({
      existing: row,
      fields: { ...row, state: "resolved", detected_at: now },
      message: `Auto-resolve anomaly ${row.anomaly_id}`,
    });
  }

  // Upsert every currently-detected anomaly, preserving dismissed/actioned state.
  const finalAnomalyById = new Map(existingAnomalies.map((row) => [row.anomaly_id, { ...row }]));
  for (const item of found) {
    const existing = existingById.get(item.anomaly_id);
    if (existing) {
      updated += 1;
      const nextState = existing.state === "resolved" ? "open" : existing.state;
      const fields = {
        ...existing,
        evidence: item.evidence,
        severity: item.severity,
        state: nextState,
        detected_at: now,
      };
      anomalyWrites.push({ existing, fields, message: `Refresh anomaly ${item.anomaly_id}` });
      finalAnomalyById.set(item.anomaly_id, fields);
    } else {
      created += 1;
      const fields = { ...item, state: "open", detected_at: now, first_seen_at: now, adjustment_id: "" };
      anomalyWrites.push({ existing: null, fields, message: `New anomaly ${item.anomaly_id}: ${item.evidence}` });
      finalAnomalyById.set(item.anomaly_id, fields);
    }
  }

  for (const write of anomalyWrites) {
    await upsert(client, declared("anomalies"), write.existing, write.fields, write.message, apply);
    console.log(
      `  Anomaly ${write.fields.anomaly_id} [${write.fields.type}] ${write.existing ? "updated" : "created"}`,
    );
  }

  // Draft skeleton adjustment cards for new critical anomalies without one.
  let nextRef = existingAdjustments.reduce((max, row) => Math.max(max, Number(row.ref || 0)), 0) + 1;
  const existingAdjustmentIds = new Set(existingAdjustments.map((row) => row.adjustment_id));
  const skeletonSnapshot = { campaigns: campaignRows.map(normalizeCampaign) };
  for (const anomaly of finalAnomalyById.values()) {
    if (anomaly.state !== "open" || anomaly.severity !== "critical" || anomaly.adjustment_id) continue;
    const card = skeletonAdjustment(skeletonSnapshot, anomaly, nextRef);
    if (existingAdjustmentIds.has(card.adjustment_id)) {
      await upsert(
        client,
        declared("anomalies"),
        existingById.get(anomaly.anomaly_id) || null,
        { ...anomaly, adjustment_id: card.adjustment_id },
        `Link anomaly ${anomaly.anomaly_id} to existing adjustment ${card.adjustment_id}`,
        apply,
      );
      continue;
    }
    const fields = {
      adjustment_id: card.adjustment_id,
      ref: card.ref,
      type: card.type,
      title: card.title,
      status: card.status,
      campaign_id: card.campaign_id,
      platform: card.platform,
      reason: card.reason,
      evidence: JSON.stringify(card.evidence),
      target: JSON.stringify(card.target),
      current_value: card.current_value,
      proposed_value: card.proposed_value,
      expected_impact: card.expected_impact,
      anomaly_id: card.anomaly_id,
      note: card.note,
      created_at: card.created_at,
    };
    await upsert(client, declared("adjustments"), null, fields, `New adjustment #${card.ref}: ${card.title}`, apply);
    await upsert(
      client,
      declared("anomalies"),
      existingById.get(anomaly.anomaly_id) || null,
      { ...anomaly, adjustment_id: card.adjustment_id },
      `Link anomaly ${anomaly.anomaly_id} to new adjustment ${card.adjustment_id}`,
      apply,
    );
    console.log(`  Adjustment #${card.ref} drafted: ${card.title}`);
    nextRef += 1;
    drafted += 1;
  }

  const criticalOpen = [...finalAnomalyById.values()].filter(
    (item) => item.state === "open" && item.severity === "critical",
  ).length;
  const syncId = `sync-checks-${now.slice(0, 10)}`;
  const syncLogRows = await readAll(client, declared("sync-log"));
  const existingSyncRow = syncLogRows.find((row) => row.sync_id === syncId) || null;
  await upsert(
    client,
    declared("sync-log"),
    existingSyncRow,
    {
      sync_id: syncId,
      at: now,
      platform: "",
      kind: "checks",
      message: `Anomaly checks completed: ${found.length} anomaly(ies) active (${criticalOpen} critical), ${created} new, ${resolved} auto-resolved, ${drafted} skeleton adjustment(s) drafted.`,
      rows: found.length,
    },
    `Sync log entry ${syncId}`,
    apply,
  );

  console.log(`${apply ? "Wrote" : "Dry run for"} the Busabase anomalies/adjustments/sync_log Bases`);
  console.log(`  anomalies: +${created} new, ${updated} refreshed, ${resolved} auto-resolved`);
  console.log(`  adjustments: +${drafted} skeleton card(s) drafted`);
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
