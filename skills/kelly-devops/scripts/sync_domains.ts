#!/usr/bin/env node
// Domain expiry sync via RDAP (https://rdap.org/domain/<name>).
// Merges domain expiries into app/.data/ops_snapshot.json.
// Fails gracefully per domain. Zero npm dependencies.
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

const OWNER = "kelly-devops-sync-domains";
const DAY_MS = 24 * 60 * 60 * 1000;

function expiryIdFor(domain) {
  return `domain-${domain.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

async function rdapExpiration(domain) {
  const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    headers: { accept: "application/rdap+json, application/json", "user-agent": "kelly-devops-check/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RDAP responded HTTP ${res.status}`);
  const body = await res.json();
  const event = (body.events || []).find((item) => item.eventAction === "expiration");
  if (!event?.eventDate) throw new Error("RDAP response has no expiration event");
  return new Date(event.eventDate);
}

function upsertExpiry(snapshot, entry) {
  const index = snapshot.expiries.findIndex((item) => item.expiry_id === entry.expiry_id);
  if (index >= 0) snapshot.expiries[index] = { ...snapshot.expiries[index], ...entry };
  else snapshot.expiries.push(entry);
}

async function main() {
  await ensureDirs();
  await loadDotenvFiles(envSearchPaths());
  const configResult = await readConfig();
  const config = configResult.config || {};
  const domains = Array.isArray(config.domains) ? config.domains : [];
  if (configResult.is_example) {
    console.log("No private config found; only the template config.example.json exists.");
    console.log(
      "Create config.local.json (or set KELLY_DEVOPS_CONFIG) with your domains[] before syncing real expiry dates.",
    );
    return;
  }
  if (!domains.length) {
    console.log("No domains configured. Add domains[] to config.local.json (see config.example.json), then re-run.");
    return;
  }

  try {
    await acquireLock(OWNER, "Syncing domain expiry dates via RDAP");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  try {
    const snapshot = await readSnapshot();
    snapshot.expiries = Array.isArray(snapshot.expiries) ? snapshot.expiries : [];
    const now = new Date().toISOString();
    let failures = 0;
    let soonest = null;

    for (const entry of domains) {
      const domain = String(entry.domain || "").trim();
      if (!domain) continue;
      const expiryId = expiryIdFor(domain);
      const existing = snapshot.expiries.find((item) => item.expiry_id === expiryId);
      try {
        const expires = await rdapExpiration(domain);
        const daysLeft = Math.ceil((expires.getTime() - Date.now()) / DAY_MS);
        upsertExpiry(snapshot, {
          expiry_id: expiryId,
          type: "domain",
          item: domain,
          product: entry.product || "",
          expires_on: expires.toISOString().slice(0, 10),
          days_left: daysLeft,
          auto_renew: Boolean(entry.auto_renew),
          action_id: existing?.action_id || "",
          source: "rdap",
          registrar: entry.registrar || "",
          detail: entry.auto_renew
            ? `Auto-renew is on${entry.registrar ? ` at ${entry.registrar}` : ""}. Confirm the payment method stays valid.`
            : `Auto-renew is off. Renew ${domain}${entry.registrar ? ` at ${entry.registrar}` : ""} before ${expires.toISOString().slice(0, 10)}.`,
        });
        if (soonest === null || daysLeft < soonest.daysLeft) soonest = { domain, daysLeft };
        console.log(`- ${domain}: expires ${expires.toISOString().slice(0, 10)} (${daysLeft} days)`);
      } catch (error) {
        failures += 1;
        console.log(`- ${domain}: RDAP lookup failed (${error.message}); keeping previous data if any.`);
        if (existing) {
          existing.detail =
            `${existing.detail || ""} RDAP refresh failed on ${now.slice(0, 10)}: ${error.message}.`.trim();
        } else {
          upsertExpiry(snapshot, {
            expiry_id: expiryId,
            type: "domain",
            item: domain,
            product: entry.product || "",
            expires_on: "",
            days_left: 9999,
            auto_renew: Boolean(entry.auto_renew),
            action_id: "",
            source: "rdap",
            registrar: entry.registrar || "",
            detail: `RDAP lookup failed: ${error.message}. Verify the domain manually at the registrar.`,
          });
        }
      }
    }

    pushEvent(snapshot, {
      event_id: `evt-domain-check-${Date.now()}`,
      at: now,
      severity: failures ? "warning" : "info",
      kind: "expiry",
      message: soonest
        ? `Domain check completed: soonest expiry is ${soonest.domain} in ${soonest.daysLeft} days.${failures ? ` ${failures} lookup(s) failed.` : ""}`
        : `Domain check completed with ${failures} failed lookup(s).`,
      service_id: "",
    });
    snapshot.generated_at = now;
    snapshot.source = "kelly-devops";
    snapshot.checks = { ...(snapshot.checks || {}), domains_checked_at: now };
    snapshot.warnings = (snapshot.warnings || []).filter((warning) => warning.id !== "no-snapshot");
    recomputeMetrics(snapshot, config.thresholds || {});
    await writeJson(SNAPSHOT_PATH, snapshot);
    console.log(`Wrote ${SNAPSHOT_PATH}`);
  } finally {
    await releaseLock();
  }
}

await main();
