#!/usr/bin/env node
// Real health checks: HTTP(S) GET each configured endpoint (status + latency)
// and read TLS certificate expiry via node:tls. Merges results into
// app/.data/ops_snapshot.json. Zero npm dependencies.
import tls from "node:tls";
import { SNAPSHOT_PATH } from "../app/server/paths.ts";
import {
  acquireLock,
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  pushEvent,
  readConfig,
  readSnapshot,
  recomputeMetrics,
  releaseLock,
  writeJson,
} from "../app/server/store.ts";
import type { SslCert } from "../app/server/types.ts";

const OWNER = "kelly-devops-check-services";
const HISTORY_CAP = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function idFor(service, index) {
  return service.service_id || service.name?.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || `service-${index + 1}`;
}

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

function probeTls(url: string): Promise<SslCert | null> {
  return new Promise((resolve) => {
    let parsed: URL;
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
        const validTo = new Date(cert.valid_to);
        resolve({
          issuer: String(cert.issuer?.O || cert.issuer?.CN || ""),
          valid_to: validTo.toISOString(),
          days_left: Math.ceil((validTo.getTime() - Date.now()) / DAY_MS),
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

function mergeService(snapshot, configured, result, ssl, now) {
  const services = snapshot.services;
  const existing = services.find((service) => service.service_id === configured.service_id);
  const history = [
    ...(existing?.history || []),
    {
      at: now,
      status: result.status,
      latency_ms: result.latency_ms,
      http_status: result.http_status,
    },
  ].slice(-HISTORY_CAP);
  const next = {
    service_id: configured.service_id,
    name: configured.name,
    product: configured.product || "",
    url: configured.url,
    status: result.status,
    latency_ms: result.latency_ms,
    uptime_7d: uptimeFrom(history),
    ssl: ssl || existing?.ssl || null,
    last_check_at: now,
    history,
    meta: { http_status: result.http_status, server: result.server, note: result.note },
    warnings: [],
  };
  if (result.status === "down") next.warnings.push(result.note || `Endpoint returned HTTP ${result.http_status}.`);
  if (result.status === "degraded")
    next.warnings.push(`Slow or client-error response: HTTP ${result.http_status} in ${result.latency_ms} ms.`);
  if (next.ssl && Number(next.ssl.days_left) <= 30)
    next.warnings.push(`TLS certificate expires in ${next.ssl.days_left} days.`);
  const previousStatus = existing?.status;
  const index = services.findIndex((service) => service.service_id === configured.service_id);
  if (index >= 0) services[index] = next;
  else services.push(next);
  return { next, previousStatus };
}

function upsertExpiry(snapshot, entry) {
  const index = snapshot.expiries.findIndex((item) => item.expiry_id === entry.expiry_id);
  if (index >= 0) snapshot.expiries[index] = { ...snapshot.expiries[index], ...entry };
  else snapshot.expiries.push(entry);
}

function mergeCertExpiries(snapshot, warningDays) {
  for (const service of snapshot.services) {
    const expiryId = `cert-${service.service_id}`;
    const days = Number(service.ssl?.days_left);
    if (service.ssl && Number.isFinite(days) && days <= warningDays) {
      upsertExpiry(snapshot, {
        expiry_id: expiryId,
        type: "ssl_cert",
        item: safeHost(service.url),
        product: service.product || "",
        expires_on: String(service.ssl.valid_to || "").slice(0, 10),
        days_left: days,
        auto_renew: false,
        action_id: snapshot.expiries.find((item) => item.expiry_id === expiryId)?.action_id || "",
        source: "tls",
        registrar: "",
        detail: `TLS certificate issued by ${service.ssl.issuer || "unknown CA"} expires in ${days} days. Check the automated renewal on this host.`,
      });
    } else {
      snapshot.expiries = snapshot.expiries.filter((item) => item.expiry_id !== expiryId);
    }
  }
}

function mergeKeyRotationExpiries(snapshot, config, now) {
  const keys = Array.isArray(config.key_rotation) ? config.key_rotation : [];
  for (const key of keys) {
    if (!key.last_rotated_on || !key.rotate_every_days) continue;
    const due = new Date(Date.parse(key.last_rotated_on) + Number(key.rotate_every_days) * DAY_MS);
    const daysLeft = Math.ceil((due.getTime() - Date.parse(now)) / DAY_MS);
    upsertExpiry(snapshot, {
      expiry_id: `key-${key.key_id || key.env}`,
      type: "api_key_rotation",
      item: key.env || key.name || key.key_id,
      product: key.product || "",
      expires_on: due.toISOString().slice(0, 10),
      days_left: daysLeft,
      auto_renew: false,
      action_id: snapshot.expiries.find((item) => item.expiry_id === `key-${key.key_id || key.env}`)?.action_id || "",
      source: "config",
      registrar: "",
      detail: `Rotation policy is every ${key.rotate_every_days} days; last rotated ${key.last_rotated_on}. Rotate the key at the provider, then update ${key.env || "the env var"}.`,
    });
  }
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function main() {
  await ensureDirs();
  await loadDotenvFiles(envSearchPaths());
  const configResult = await readConfig();
  const config = configResult.config || {};
  const services = Array.isArray(config.services) ? config.services : [];
  if (configResult.is_example) {
    console.log("No private config found; only the template config.example.json exists.");
    console.log(
      "Create config.local.json (or set KELLY_DEVOPS_CONFIG) with your services[] before running real checks.",
    );
    return;
  }
  if (!services.length) {
    console.log("No services configured. Add services[] to config.local.json (see config.example.json), then re-run.");
    return;
  }
  const thresholds = config.thresholds || {};
  const degradedLatencyMs = Number(thresholds.degraded_latency_ms || 1500);
  const warningDays = Number(thresholds.expiry_warning_days || 30);

  try {
    await acquireLock(OWNER, "Checking service health and TLS certificates");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  try {
    const snapshot = await readSnapshot();
    snapshot.services = Array.isArray(snapshot.services) ? snapshot.services : [];
    snapshot.expiries = Array.isArray(snapshot.expiries) ? snapshot.expiries : [];
    const now = new Date().toISOString();
    const counts = { up: 0, degraded: 0, down: 0 };

    for (const [index, entry] of services.entries()) {
      const configured = { ...entry, service_id: idFor(entry, index), name: entry.name || idFor(entry, index) };
      if (!configured.url) {
        console.log(`- ${configured.name}: skipped (no url configured)`);
        continue;
      }
      const [result, ssl] = await Promise.all([probeHttp(configured.url, degradedLatencyMs), probeTls(configured.url)]);
      counts[result.status] = (counts[result.status] || 0) + 1;
      const { previousStatus } = mergeService(snapshot, configured, result, ssl, now);
      if (previousStatus && previousStatus !== result.status) {
        pushEvent(snapshot, {
          event_id: `evt-${configured.service_id}-${Date.now()}`,
          at: now,
          severity: result.status === "up" ? "info" : result.status === "down" ? "error" : "warning",
          kind: "incident",
          message: `${configured.name} changed from ${previousStatus} to ${result.status}.`,
          service_id: configured.service_id,
        });
      }
      console.log(
        `- ${configured.name}: ${result.status} (HTTP ${result.http_status || "n/a"}, ${result.latency_ms} ms${ssl ? `, cert ${ssl.days_left}d` : ""})`,
      );
    }

    mergeCertExpiries(snapshot, warningDays);
    mergeKeyRotationExpiries(snapshot, config, now);
    pushEvent(snapshot, {
      event_id: `evt-service-check-${Date.now()}`,
      at: now,
      severity: counts.down ? "error" : counts.degraded ? "warning" : "info",
      kind: "check",
      message: `Service check completed: ${counts.up || 0} up, ${counts.degraded || 0} degraded, ${counts.down || 0} down.`,
      service_id: "",
    });
    snapshot.generated_at = now;
    snapshot.source = "kelly-devops";
    snapshot.currency = config.currency || snapshot.currency || "USD";
    snapshot.checks = { ...(snapshot.checks || {}), services_checked_at: now };
    snapshot.warnings = (snapshot.warnings || []).filter((warning) => warning.id !== "no-snapshot");
    recomputeMetrics(snapshot, thresholds);
    await writeJson(SNAPSHOT_PATH, snapshot);
    console.log(`Wrote ${SNAPSHOT_PATH}`);
  } finally {
    await releaseLock();
  }
}

await main();
