#!/usr/bin/env node
// Single write-path for cloud billing data. The agent gathers a payload JSON
// (from billing skills/exports), this script validates it, merges it into
// app/.data/ops_snapshot.json, and flags anomalies.
//
// Usage: node scripts/ingest_spend.mjs /path/to/spend_payload.json
//
// Payload shape:
// {
//   "currency": "USD",
//   "providers": [
//     { "provider_id": "gcp", "name": "Google Cloud", "mtd": 812.4, "last_month": 501.42, "note": "optional" }
//   ],
//   "products": [
//     { "product_id": "relayapi", "product": "RelayAPI", "mtd": 1244.48, "last_month": 987.87 }
//   ]
// }
import { SNAPSHOT_PATH } from "../app/server/paths.ts";
import {
  acquireLock,
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  pushEvent,
  readConfig,
  readJson,
  readSnapshot,
  recomputeMetrics,
  releaseLock,
  round2,
  writeJson,
} from "../app/server/store.ts";

const OWNER = "kelly-devops-ingest-spend";

function fail(message) {
  console.error(`ingest_spend: ${message}`);
  process.exit(1);
}

function requireNumber(obj, key, path) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    console.log("Usage: node scripts/ingest_spend.mjs /path/to/spend_payload.json");
    console.log("The payload is billing data the agent gathered from cloud billing tools or exports.");
    return;
  }
  await ensureDirs();
  await loadDotenvFiles(envSearchPaths());
  const payload = await readJson(payloadPath, null);
  if (!payload) fail(`cannot read payload JSON at ${payloadPath}`);
  if (!Array.isArray(payload.providers) || !payload.providers.length)
    fail("payload.providers must be a non-empty array");
  payload.providers.forEach((row, index) => {
    if (!row.provider_id) fail(`payload.providers[${index}].provider_id is required`);
    requireNumber(row, "mtd", `payload.providers[${index}]`);
    requireNumber(row, "last_month", `payload.providers[${index}]`);
  });
  (payload.products || []).forEach((row, index) => {
    if (!row.product) fail(`payload.products[${index}].product is required`);
    requireNumber(row, "mtd", `payload.products[${index}]`);
    requireNumber(row, "last_month", `payload.products[${index}]`);
  });

  const configResult = await readConfig();
  const config = configResult.config || {};
  const anomalyPct = Number(config.thresholds?.spend_anomaly_pct || 40);

  try {
    await acquireLock(OWNER, "Ingesting cloud spend payload");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  try {
    const snapshot = await readSnapshot();
    snapshot.actions = Array.isArray(snapshot.actions) ? snapshot.actions : [];
    const now = new Date().toISOString();
    const currency = payload.currency || snapshot.spend?.currency || config.currency || "USD";
    const anomalies = [];

    const providers = payload.providers.map((row) => {
      const mtd = round2(row.mtd);
      const lastMonth = round2(row.last_month);
      const deltaPct = lastMonth > 0 ? round2(((mtd - lastMonth) / lastMonth) * 100) : 0;
      const anomaly = lastMonth > 0 && mtd > lastMonth * (1 + anomalyPct / 100);
      const providerId = String(row.provider_id);
      let actionId = snapshot.spend?.providers?.find((item) => item.provider_id === providerId)?.action_id || "";
      if (anomaly) {
        if (!actionId || !snapshot.actions.some((action) => action.action_id === actionId)) {
          actionId = `act-spend-${providerId}`;
          if (!snapshot.actions.some((action) => action.action_id === actionId)) {
            const ref = snapshot.actions.reduce((max, action) => Math.max(max, Number(action.ref || 0)), 0) + 1;
            snapshot.actions.push({
              action_id: actionId,
              ref,
              type: "investigate_spend",
              title: `Investigate ${row.name || providerId} spend spike (${deltaPct > 0 ? "+" : ""}${deltaPct}% MTD)`,
              status: "needs_review",
              reason: `${row.name || providerId} month-to-date is ${currency} ${mtd.toFixed(2)} vs ${currency} ${lastMonth.toFixed(2)} last month, above the ${anomalyPct}% anomaly threshold.`,
              evidence: [
                `Month-to-date: ${currency} ${mtd.toFixed(2)}.`,
                `Last month total: ${currency} ${lastMonth.toFixed(2)}.`,
                `Delta: ${deltaPct > 0 ? "+" : ""}${deltaPct}% against a ${anomalyPct}% threshold.`,
              ],
              plan: [
                `Pull a per-service cost breakdown for ${row.name || providerId}.`,
                "Identify which service or deploy drives the increase.",
                "Propose a budget alert or remediation.",
              ],
              target: { kind: "spend", id: providerId, provider: providerId },
              note: "",
              created_at: now,
              decision: null,
            });
          }
        }
        anomalies.push({ providerId, deltaPct });
      }
      return {
        provider_id: providerId,
        name: row.name || providerId,
        currency,
        mtd,
        last_month: lastMonth,
        delta_pct: deltaPct,
        anomaly,
        action_id: anomaly ? actionId : "",
        note: row.note || "",
      };
    });

    const totalMtd = round2(providers.reduce((sum, row) => sum + row.mtd, 0));
    const products = (payload.products || []).map((row) => ({
      product_id:
        row.product_id ||
        String(row.product)
          .toLowerCase()
          .replaceAll(/[^a-z0-9]+/g, "-"),
      product: row.product,
      currency,
      mtd: round2(row.mtd),
      last_month: round2(row.last_month),
      share_pct: totalMtd > 0 ? Math.round((round2(row.mtd) / totalMtd) * 100) : 0,
    }));

    snapshot.spend = { currency, providers, products };
    for (const anomaly of anomalies) {
      pushEvent(snapshot, {
        event_id: `evt-spend-${anomaly.providerId}-${Date.now()}`,
        at: now,
        severity: "warning",
        kind: "spend",
        message: `${anomaly.providerId} month-to-date spend is ${anomaly.deltaPct > 0 ? "+" : ""}${anomaly.deltaPct}% vs last month; anomaly flagged.`,
        service_id: "",
      });
    }
    pushEvent(snapshot, {
      event_id: `evt-spend-ingest-${Date.now()}`,
      at: now,
      severity: anomalies.length ? "warning" : "info",
      kind: "spend",
      message: `Spend ingest completed: ${providers.length} provider(s), ${anomalies.length} anomaly(ies).`,
      service_id: "",
    });
    snapshot.generated_at = now;
    snapshot.source = "kelly-devops";
    snapshot.currency = currency;
    snapshot.checks = { ...(snapshot.checks || {}), spend_ingested_at: now };
    snapshot.warnings = (snapshot.warnings || []).filter((warning) => warning.id !== "no-snapshot");
    recomputeMetrics(snapshot, config.thresholds || {});
    await writeJson(SNAPSHOT_PATH, snapshot);
    console.log(`Ingested ${providers.length} provider(s), flagged ${anomalies.length} anomaly(ies).`);
    console.log(`Wrote ${SNAPSHOT_PATH}`);
  } finally {
    await releaseLock();
  }
}

await main();
