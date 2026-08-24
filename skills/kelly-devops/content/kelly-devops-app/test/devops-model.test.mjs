import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConfigSummary,
  buildSnapshot,
  certExpiriesFromServices,
  daysLeftFrom,
  normalizeExpiry,
  normalizeService,
  operationFor,
  recomputeMetrics,
  round2,
  statusForVerdict,
} from "../app/js/devops-model.js";

test("statusForVerdict maps every action verdict, ported from local-file-provider.ts's applyDecision", () => {
  assert.equal(statusForVerdict("approve"), "approved");
  assert.equal(statusForVerdict("request_changes"), "changes_requested");
  assert.equal(statusForVerdict("block"), "blocked");
  // "note" never changes status: it stays whatever it was.
  assert.equal(statusForVerdict("note", "needs_review"), "needs_review");
  assert.equal(statusForVerdict("note", "approved"), "approved");
});

test("round2 rounds to two decimal places like the retired lib/common.ts", () => {
  assert.equal(round2(812.4019999), 812.4);
  assert.equal(round2(), 0);
});

test("daysLeftFrom computes calendar days remaining, ceil-rounded, matching sync_domains.ts's day math", () => {
  const now = Date.parse("2026-07-02T09:30:00.000Z");
  // 2026-07-11T12:00 is 9 days 2.5 hours after now: ceil rounds up to 10.
  assert.equal(daysLeftFrom("2026-07-11T12:00:00.000Z", now), 10);
  // An overdue key rotation (due date already passed) is negative.
  assert.equal(daysLeftFrom("2026-06-20T00:00:00.000Z", now), -12);
  assert.equal(daysLeftFrom("", now), 9999);
});

test("certExpiriesFromServices derives an ssl_cert expiry row from a service's ssl field, not a stored duplicate", () => {
  const now = Date.parse("2026-07-02T09:30:00.000Z");
  const services = [
    normalizeService({
      service_id: "relayapi-status",
      url: "https://status.relayapi.dev",
      ssl_issuer: "Let's Encrypt R10",
      ssl_valid_to: "2026-07-22T12:00:00.000Z",
    }),
    normalizeService({ service_id: "no-cert", url: "http://plain.example" }),
  ];
  const certs = certExpiriesFromServices(services, now);
  assert.equal(certs.length, 1);
  assert.equal(certs[0].expiry_id, "cert-relayapi-status");
  assert.equal(certs[0].type, "ssl_cert");
  assert.equal(certs[0].item, "status.relayapi.dev");
  assert.equal(certs[0].days_left, 21);
});

test("normalizeExpiry parses auto_renew from a Busabase text field", () => {
  assert.equal(normalizeExpiry({ auto_renew: "true" }).auto_renew, true);
  assert.equal(normalizeExpiry({ auto_renew: "false" }).auto_renew, false);
  assert.equal(normalizeExpiry({}).auto_renew, false);
});

test("buildSnapshot flags a spend anomaly above the configured threshold and links its action card", () => {
  const snapshot = buildSnapshot({
    spend_providers: [
      { provider_id: "gcp", name: "Google Cloud", currency: "USD", mtd: 812.4, last_month: 501.42 },
      { provider_id: "aws", name: "AWS", currency: "USD", mtd: 1243.18, last_month: 1310.45 },
    ],
    actions: [
      {
        action_id: "act-investigate-gcp",
        ref: 1,
        type: "investigate_spend",
        status: "needs_review",
        target: JSON.stringify({ kind: "spend", id: "gcp", provider: "gcp" }),
      },
    ],
    settings: { spend_anomaly_pct: 40 },
    now: Date.parse("2026-07-02T09:30:00.000Z"),
  });
  const gcp = snapshot.spend.providers.find((row) => row.provider_id === "gcp");
  const aws = snapshot.spend.providers.find((row) => row.provider_id === "aws");
  // (812.4 - 501.42) / 501.42 * 100 = 62.02%, above the 40% threshold.
  assert.equal(gcp.delta_pct, 62.02);
  assert.equal(gcp.anomaly, true);
  assert.equal(gcp.action_id, "act-investigate-gcp");
  // AWS spent LESS than last month: never an anomaly regardless of threshold.
  assert.equal(aws.anomaly, false);
  assert.equal(aws.action_id, "");
  assert.equal(snapshot.metrics.spend_anomalies, 1);
});

test("buildSnapshot computes services_up/degraded/down and certs_ok/expiring from the merged snapshot", () => {
  const now = Date.parse("2026-07-02T09:30:00.000Z");
  // buildSnapshot takes RAW Busabase rows (snake_cased ssl_issuer/ssl_valid_to
  // fields), not pre-normalized service objects — normalizeService is for
  // rows already read one-at-a-time, buildSnapshot re-normalizes internally.
  const snapshot = buildSnapshot({
    services: [
      {
        service_id: "a",
        status: "up",
        url: "https://a.example",
        ssl_issuer: "LE",
        ssl_valid_to: "2026-09-03T12:00:00.000Z",
      },
      { service_id: "b", status: "degraded", url: "https://b.example" },
      {
        service_id: "c",
        status: "down",
        url: "https://c.example",
        ssl_issuer: "LE",
        ssl_valid_to: "2026-07-10T12:00:00.000Z",
      },
    ],
    settings: { expiry_warning_days: 30 },
    now,
  });
  assert.equal(snapshot.metrics.services_total, 3);
  assert.equal(snapshot.metrics.services_up, 1);
  assert.equal(snapshot.metrics.services_degraded, 1);
  assert.equal(snapshot.metrics.services_down, 1);
  // service "a"'s cert is ~63 days out (ok), service "c"'s is ~8 days out (expiring, <=30).
  assert.equal(snapshot.metrics.certs_ok, 1);
  assert.equal(snapshot.metrics.certs_expiring, 1);
});

test("buildSnapshot emits a no-snapshot warning only when nothing is configured yet", () => {
  const empty = buildSnapshot({});
  assert.equal(empty.warnings.length, 1);
  assert.equal(empty.warnings[0].id, "no-snapshot");

  const withServices = buildSnapshot({ services: [normalizeService({ service_id: "a", url: "https://a.example" })] });
  assert.equal(withServices.warnings.length, 0);
});

test("recomputeMetrics matches the retired lib/common.ts formula for domains/expiring_14d/actions_needing_review", () => {
  const snapshot = {
    services: [],
    expiries: [
      { type: "domain", days_left: 9 },
      { type: "domain", days_left: 92 },
      { type: "api_key_rotation", days_left: -42 },
    ],
    actions: [{ status: "needs_review" }, { status: "approved" }],
    spend: { providers: [] },
  };
  recomputeMetrics(snapshot, { expiry_warning_days: 30 });
  assert.equal(snapshot.metrics.domains_ok, 1);
  assert.equal(snapshot.metrics.domains_expiring, 1);
  // Both the 9-day domain and the -42-day (overdue) key rotation count toward expiring_14d.
  assert.equal(snapshot.metrics.expiring_14d, 2);
  assert.equal(snapshot.metrics.actions_needing_review, 1);
});

test("operationFor maps every action type to its concrete outside-the-app operation, ported from execute_decisions.ts", () => {
  assert.deepEqual(
    operationFor({ type: "renew_domain", target: { id: "formkit.io", registrar: "Namecheap" } }).operation,
    "renew_domain",
  );
  assert.deepEqual(
    operationFor({ type: "rotate_key", target: { id: "RELAYAPI_SENDGRID_KEY", provider: "sendgrid" } }).target,
    {
      env_var: "RELAYAPI_SENDGRID_KEY",
      provider: "sendgrid",
    },
  );
  assert.equal(
    operationFor({ type: "restart_service", target: { id: "relayapi-hooks", host: "fly.io" } }).operation,
    "restart_service",
  );
  assert.equal(operationFor({ type: "ack_incident", target: {} }).operation, "ack_incident");
  assert.equal(operationFor({ type: "unknown_type", target: {} }).operation, "unknown_type");
});

test("buildConfigSummary derives the domain/key-rotation rosters from the same expiries rows the ledger uses, never a second config store", () => {
  const summary = buildConfigSummary({
    services: [{ service_id: "a", name: "A", product: "FormKit", url: "https://a.example" }],
    expiries: [
      { type: "domain", item: "formkit.io", product: "FormKit", registrar: "Namecheap", auto_renew: true },
      {
        type: "api_key_rotation",
        item: "RELAYAPI_SENDGRID_KEY",
        expiry_id: "key-relayapi-sendgrid",
        detail: "Rotate.",
      },
    ],
    settings: { expiry_warning_days: 14 },
  });
  assert.equal(summary.services.length, 1);
  assert.equal(summary.domains.length, 1);
  assert.equal(summary.domains[0].domain, "formkit.io");
  assert.equal(summary.domains[0].auto_renew, true);
  assert.equal(summary.key_rotation.length, 1);
  assert.equal(summary.key_rotation[0].env, "RELAYAPI_SENDGRID_KEY");
  assert.equal(summary.thresholds.expiry_warning_days, 14);
});
