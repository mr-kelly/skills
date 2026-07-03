#!/usr/bin/env node
// Writes a small example ops snapshot to app/.data/ops_snapshot.json so the
// app has something to render before real checks run. Uses placeholder data
// only; never reads private config.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(skillDir, "app", ".data", "ops_snapshot.json");
const now = new Date().toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;

function inDays(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

function history(base) {
  return Array.from({ length: 8 }, (_, index) => ({
    at: new Date(Date.now() - (7 - index) * 30 * 60 * 1000).toISOString(),
    status: "up",
    latency_ms: base + ((index * 13) % 21) - 10,
    http_status: 200
  }));
}

function service(service_id, name, product, url, latency, certDays) {
  return {
    service_id,
    name,
    product,
    url,
    status: "up",
    latency_ms: latency,
    uptime_7d: 99.95,
    ssl: { issuer: "Example CA", valid_to: `${inDays(certDays)}T12:00:00.000Z`, days_left: certDays },
    last_check_at: now,
    history: history(latency),
    meta: { http_status: 200, server: "example", note: "" },
    warnings: []
  };
}

const services = [
  service("example-app-web", "Example App Web", "Example App", "https://app.example.com", 180, 62),
  service("example-app-api", "Example App API", "Example App", "https://api.example.com/health", 110, 62)
];

const expiries = [
  {
    expiry_id: "domain-example-com",
    type: "domain",
    item: "example.com",
    product: "Example App",
    expires_on: inDays(12),
    days_left: 12,
    auto_renew: false,
    action_id: "act-renew-example",
    source: "rdap",
    registrar: "Example Registrar",
    detail: "Auto-renew is off. Renew example.com at Example Registrar."
  },
  {
    expiry_id: "key-example-mail-key",
    type: "api_key_rotation",
    item: "EXAMPLE_MAIL_API_KEY",
    product: "Example App",
    expires_on: inDays(45),
    days_left: 45,
    auto_renew: false,
    action_id: "",
    source: "config",
    registrar: "",
    detail: "Rotation policy is every 90 days."
  }
];

const spend = {
  currency: "USD",
  providers: [
    { provider_id: "aws", name: "AWS", currency: "USD", mtd: 420.5, last_month: 445.1, delta_pct: -5.5, anomaly: false, action_id: "", note: "" },
    { provider_id: "cloudflare", name: "Cloudflare", currency: "USD", mtd: 25, last_month: 25, delta_pct: 0, anomaly: false, action_id: "", note: "" }
  ],
  products: [
    { product_id: "example-app", product: "Example App", currency: "USD", mtd: 445.5, last_month: 470.1, share_pct: 100 }
  ]
};

const actions = [
  {
    action_id: "act-renew-example",
    ref: 1,
    type: "renew_domain",
    title: "Renew example.com before it expires",
    status: "needs_review",
    reason: "example.com expires in 12 days and auto-renew is off.",
    evidence: ["RDAP expiration event in 12 days.", "Auto-renew disabled at Example Registrar."],
    plan: ["Renew example.com for 1 year.", "Re-enable auto-renew."],
    target: { kind: "domain", id: "example.com", registrar: "Example Registrar" },
    note: "",
    created_at: now,
    decision: null
  }
];

const events = [
  {
    event_id: "evt-example-check",
    at: now,
    severity: "info",
    kind: "check",
    message: "Service check completed: 2 up, 0 degraded, 0 down.",
    service_id: ""
  },
  {
    event_id: "evt-example-domain",
    at: now,
    severity: "warning",
    kind: "expiry",
    message: "example.com expires in 12 days and auto-renew is off.",
    service_id: ""
  }
];

const metrics = {
  services_total: services.length,
  services_up: services.length,
  services_degraded: 0,
  services_down: 0,
  certs_ok: services.length,
  certs_expiring: 0,
  domains_ok: 0,
  domains_expiring: 1,
  expiring_14d: 1,
  actions_needing_review: 1,
  spend_mtd: 445.5,
  spend_last_month: 470.1,
  spend_anomalies: 0
};

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, `${JSON.stringify({
  schema_version: "1",
  generated_at: now,
  source: "kelly-devops-demo",
  currency: "USD",
  checks: {
    services_checked_at: now,
    domains_checked_at: now,
    spend_ingested_at: now
  },
  metrics,
  services,
  expiries,
  spend,
  actions,
  events,
  warnings: []
}, null, 2)}\n`);

console.log(`Wrote ${out}`);
