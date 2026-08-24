#!/usr/bin/env node
import { readFile } from "node:fs/promises";
// Real health checks: HTTP(S) GET each configured endpoint (status + latency)
// and read TLS certificate expiry via node:tls — the AirApp browser cannot do
// this (no outbound network probes). probeHttp/probeTls/uptimeFrom are
// ported verbatim from the retired scripts/check_services.ts; only the write
// target changed, from content/kelly-devops-app/.data/ops_snapshot.json to Busabase's
// services/expiries/events Bases.
//
// The service (and key-rotation) roster used to live in config.local.json;
// in the Busabase-only shape the roster IS the Services/Expiries Bases
// themselves (config fields and live check results share one row, mirroring
// kelly-messenger's accounts Base). To register a NEW service or key
// rotation policy, pass a roster JSON file as the first argument — existing
// rows are always re-checked whether or not a roster file is given:
//
//   node scripts/check_services.mjs [roster.json] [--apply]
//
// roster.json shape:
// {
//   "services": [{ "service_id": "formkit-web", "name": "...", "product": "...", "url": "https://..." }],
//   "key_rotation": [{ "key_id": "relayapi-sendgrid", "name": "...", "env": "RELAYAPI_SENDGRID_KEY", "product": "...", "rotate_every_days": 90, "last_rotated_on": "2026-02-20" }],
//   "thresholds": { "expiry_warning_days": 30, "degraded_latency_ms": 1500 }
// }
//
// Without --apply this is a dry run that only prints what would change.
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import tls from "node:tls";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-devops-app/app/js/config.js";

const HISTORY_CAP = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function help() {
  console.log(`Usage: node scripts/check_services.mjs [roster.json] [--apply]

Re-checks every service already registered in Busabase's Services Base (HTTP
status/latency + TLS certificate expiry) and every key-rotation row already
in the Expiries Base. Pass a roster JSON file to register NEW services or
key-rotation policies at the same time. Without --apply this is a dry run.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

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

async function upsertRow(client, declared, existing, idField, idValue, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-devops-check-services",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-devops-check-services",
    autoMerge: true,
  });
  return "created";
}

function idFor(service, index) {
  return service.service_id || service.name?.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || `service-${index + 1}`;
}

// ---- Ported verbatim from the retired scripts/check_services.ts ----

async function probeHttp(url, degradedLatencyMs) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "kelly-devops-check/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    await res.arrayBuffer().catch(() => {});
    const latency = Date.now() - started;
    let status = "up";
    if (res.status >= 500) status = "down";
    else if (res.status >= 400 || latency > degradedLatencyMs) status = "degraded";
    return {
      status,
      latency_ms: latency,
      http_status: res.status,
      server: res.headers.get("server") || "",
      note: "",
    };
  } catch (error) {
    return {
      status: "down",
      latency_ms: Date.now() - started,
      http_status: 0,
      server: "",
      note: `Request failed: ${error.cause?.code || error.name || error.message}`,
    };
  }
}

function probeTls(url) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve(null);
      return;
    }
    if (parsed.protocol !== "https:") {
      resolve(null);
      return;
    }
    const port = Number(parsed.port || 443);
    const socket = tls.connect(
      { host: parsed.hostname, port, servername: parsed.hostname, timeout: 10000, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) {
          resolve(null);
          return;
        }
        resolve({
          issuer: String(cert.issuer?.O || cert.issuer?.CN || ""),
          valid_to: new Date(cert.valid_to).toISOString(),
        });
      },
    );
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
    socket.on("error", () => resolve(null));
  });
}

function uptimeFrom(history) {
  if (!history.length) return 0;
  const up = history.filter((entry) => entry.status === "up").length;
  return Math.round((up / history.length) * 10000) / 100;
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith("--")));
  if (flags.has("--help") || flags.has("-h")) return help();
  const apply = flags.has("--apply");
  const rosterPath = args[0];

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly DevOps Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const roster = rosterPath ? JSON.parse(await readFile(rosterPath, "utf8")) : {};
  const rosterServices = Array.isArray(roster.services) ? roster.services : [];
  const rosterKeys = Array.isArray(roster.key_rotation) ? roster.key_rotation : [];
  const thresholds = roster.thresholds || {};

  const [serviceRows, expiryRows, settingsRows] = await Promise.all([
    readAll(client, declared("services")),
    readAll(client, declared("expiries")),
    readAll(client, declared("settings")),
  ]);
  const settings = settingsRows.find((row) => row.record_id === "config") || null;

  if (Object.keys(thresholds).length) {
    await upsertRow(
      client,
      declared("settings"),
      settings,
      "record-id",
      "config",
      {
        record_id: "config",
        expiry_warning_days: Number(thresholds.expiry_warning_days ?? settings?.expiry_warning_days ?? 30),
        expiry_critical_days: Number(thresholds.expiry_critical_days ?? settings?.expiry_critical_days ?? 7),
        degraded_latency_ms: Number(thresholds.degraded_latency_ms ?? settings?.degraded_latency_ms ?? 1500),
        spend_anomaly_pct: Number(thresholds.spend_anomaly_pct ?? settings?.spend_anomaly_pct ?? 40),
      },
      "Update ops thresholds",
      apply,
    );
  }
  const degradedLatencyMs = Number(thresholds.degraded_latency_ms ?? settings?.degraded_latency_ms ?? 1500);

  const byServiceId = new Map(serviceRows.map((row) => [row.service_id, row]));
  for (const [index, entry] of rosterServices.entries()) {
    const serviceId = idFor(entry, index);
    if (byServiceId.has(serviceId)) continue;
    byServiceId.set(serviceId, {
      service_id: serviceId,
      name: entry.name || serviceId,
      product: entry.product || "",
      url: entry.url || "",
    });
  }

  const targets = [...byServiceId.values()].filter((row) => row.url);
  if (!targets.length) {
    console.log("No services registered yet. Pass a roster JSON file with services[] to register one.");
    return;
  }

  const counts = { up: 0, degraded: 0, down: 0 };
  const now = new Date().toISOString();
  const events = [];

  for (const row of targets) {
    const [result, ssl] = await Promise.all([probeHttp(row.url, degradedLatencyMs), probeTls(row.url)]);
    counts[result.status] = (counts[result.status] || 0) + 1;
    let previousHistory = [];
    try {
      const parsed = JSON.parse(row.history || "[]");
      if (Array.isArray(parsed)) previousHistory = parsed;
    } catch {}
    const history = [
      ...previousHistory,
      { at: now, status: result.status, latency_ms: result.latency_ms, http_status: result.http_status },
    ].slice(-HISTORY_CAP);
    const previousStatus = row.status;
    const fields = {
      service_id: row.service_id,
      name: row.name || row.service_id,
      product: row.product || "",
      url: row.url,
      status: result.status,
      latency_ms: result.latency_ms,
      uptime_7d: uptimeFrom(history),
      ssl_issuer: ssl?.issuer || row.ssl_issuer || "",
      ssl_valid_to: ssl?.valid_to || row.ssl_valid_to || "",
      last_check_at: now,
      history: JSON.stringify(history),
      meta: JSON.stringify({ http_status: result.http_status, server: result.server, note: result.note }),
      warnings: JSON.stringify(
        result.status === "down"
          ? [result.note || `Endpoint returned HTTP ${result.http_status}.`]
          : result.status === "degraded"
            ? [`Slow or client-error response: HTTP ${result.http_status} in ${result.latency_ms} ms.`]
            : [],
      ),
    };
    const outcome = await upsertRow(
      client,
      declared("services"),
      row.__recordId ? row : null,
      "service-id",
      row.service_id,
      fields,
      `Check ${row.service_id}`,
      apply,
    );
    if (previousStatus && previousStatus !== result.status) {
      events.push({
        event_id: `evt-${row.service_id}-${Date.now()}`,
        at: now,
        severity: result.status === "up" ? "info" : result.status === "down" ? "error" : "warning",
        kind: "incident",
        message: `${row.name || row.service_id} changed from ${previousStatus} to ${result.status}.`,
        service_id: row.service_id,
      });
    }
    console.log(
      `${apply ? outcome : "would check"} ${row.service_id}: ${result.status} (HTTP ${result.http_status || "n/a"}, ${result.latency_ms} ms${ssl ? ", cert found" : ""})`,
    );
  }

  const expiryById = new Map(expiryRows.map((row) => [row.expiry_id, row]));
  for (const key of rosterKeys) {
    if (!key.last_rotated_on || !key.rotate_every_days) continue;
    const expiryId = `key-${key.key_id || key.env}`;
    const due = new Date(Date.parse(key.last_rotated_on) + Number(key.rotate_every_days) * DAY_MS);
    const fields = {
      expiry_id: expiryId,
      type: "api_key_rotation",
      item: key.env || key.name || key.key_id,
      product: key.product || "",
      expires_on: due.toISOString().slice(0, 10),
      auto_renew: "false",
      registrar: "",
      source: "config",
      detail: `Rotation policy is every ${key.rotate_every_days} days; last rotated ${key.last_rotated_on}. Rotate the key at the provider, then update ${key.env || "the env var"}.`,
      updated_at: now,
    };
    const outcome = await upsertRow(
      client,
      declared("expiries"),
      expiryById.get(expiryId),
      "expiry-id",
      expiryId,
      fields,
      `Key rotation due date for ${expiryId}`,
      apply,
    );
    console.log(`${apply ? outcome : "would upsert"} key rotation ${expiryId}: due ${fields.expires_on}`);
  }

  events.push({
    event_id: `evt-service-check-${Date.now()}`,
    at: now,
    severity: counts.down ? "error" : counts.degraded ? "warning" : "info",
    kind: "check",
    message: `Service check completed: ${counts.up || 0} up, ${counts.degraded || 0} degraded, ${counts.down || 0} down across ${targets.length} endpoints.`,
    service_id: "",
  });
  for (const event of events) {
    const outcome = await upsertRow(
      client,
      declared("events"),
      null,
      "event-id",
      event.event_id,
      event,
      `Event ${event.event_id}`,
      apply,
    );
    console.log(`${apply ? outcome : "would log"} event: ${event.message}`);
  }

  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
