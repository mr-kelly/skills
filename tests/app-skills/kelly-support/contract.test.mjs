import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-support");
const appRoot = join(skillRoot, "content", "kelly-support-app");
const browserRoot = join(appRoot, "app");
const requiredFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "server.js",
  "_node.json",
  ".busabaseignore",
  "scripts/check.mjs",
  "app/index.html",
  "app/app.js",
  "app/js/config.js",
  "app/js/support-model.js",
  "app/js/support-settings.js",
  "app/js/service-views.js",
  "app/js/providers/index.js",
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
];

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("has the canonical app project and deterministic commands", async () => {
  await Promise.all(requiredFiles.map((path) => readFile(join(appRoot, path))));
  const pkg = await readJson(join(appRoot, "package.json"));
  assert.equal(pkg.engines.node, ">=24.18.0");
  assert.equal(pkg.scripts.dev, "node server.js");
  assert.equal(pkg.scripts.start, "node server.js");
  assert.match(pkg.scripts.check, /node --test/);
  assert.equal(pkg.dependencies["busabase-sdk"], "0.30.1");
});

test("keeps the package manifest and runtime declarations aligned", async () => {
  const templateRoot = join(repoRoot, "skills", "kelly-support");
  const manifest = await readJson(join(templateRoot, "busabase.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(manifest.name, appConfig.appId);
  assert.equal(manifest.template.schemaVersion, appConfig.schemaVersion);
  assert.equal(manifest.template.airapp, appConfig.airApp.slug);
  assert.equal(appConfig.airApp.resourceKey, appConfig.airApp.slug);
  for (const base of appConfig.bases) {
    assert.equal(base.slug, `kelly-support-${base.key}`, base.key);
    assert.equal("nodeId" in base, false, base.key);
    assert.equal("baseId" in base, false, base.key);
    const declared = await readJson(join(templateRoot, "content", base.key, "base.json"));
    assert.equal(declared.name, base.name, base.key);
    assert.equal(declared.fields.length, (base.fields ?? []).length, base.key);
  }
});

test("keeps every schema upgrade additive so existing workspaces can migrate", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  const slugs = (key) => appConfig.bases.find((base) => base.key === key).fields.map((field) => field.slug);
  const v2TicketFields = [
    "execution-idempotency-key",
    "execution-provider-message-id",
    "execution-attempt",
    "execution-started-at",
    "execution-completed-at",
  ];
  const v3TicketFields = [
    "execution-last-error",
    "execution-next-retry-at",
    "execution-claim-expires-at",
    "execution-retryable",
  ];
  const currentTickets = slugs("tickets");
  const v1Tickets = currentTickets.slice(0, -(v2TicketFields.length + v3TicketFields.length));
  const v1Settings = ["record-id", "sla-policy", "risk-policy", "reply-style", "kb-source-path"];
  const v1Messages = ["message-id", "ticket-id", "direction", "sender", "text", "sent-at", "attachment"];
  assert.deepEqual(currentTickets, [...v1Tickets, ...v2TicketFields, ...v3TicketFields]);
  assert.deepEqual(slugs("settings").slice(0, v1Settings.length), v1Settings);
  assert.deepEqual(slugs("messages").slice(0, v1Messages.length), v1Messages);
  assert.deepEqual(slugs("messages").slice(v1Messages.length), ["provider-message-id", "provider-references"]);
});

test("declares itself a template and names only resources it ships", async () => {
  const templateRoot = join(repoRoot, "skills", "kelly-support");
  const skill = await readFile(join(templateRoot, "SKILL.md"), "utf8");
  assert.match(skill, /^\s*template: true$/m);
  const resources = [...skill.matchAll(/^\s{6}- (\S+)$/gm)].map((match) => match[1]);
  assert.ok(resources.length > 0, "SKILL.md should list its resources");
  for (const key of resources) await readFile(join(templateRoot, "content", key, "base.json"));
});

test("every declared Base stays within the records.list limit=100 server cap", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.ok(appConfig.bases.length >= 6, "expected accounts/tickets/messages/knowledge_base/sync_log/settings");
  for (const base of appConfig.bases) {
    assert.ok(base.readLimit <= 100, `${base.key} readLimit ${base.readLimit} exceeds 100`);
  }
});

test("does not persist secrets or a second data provider in browser storage", async () => {
  const sources = await Promise.all(
    ["app.js", "js/busabase-client.js", "js/providers/busabase-provider.js", "js/connect-gate.js"].map((path) =>
      readFile(join(browserRoot, path), "utf8"),
    ),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /localStorage\.setItem\("busabase|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer/i);
  assert.doesNotMatch(source, /KELLY_SUPPORT_DATA_PROVIDER|local-file-provider|config\.local\.json/);
  assert.match(source, /createBusabaseClient/);
});

test("has a live decision workflow: the ticket review write path goes through records.changeRequest", async () => {
  const source = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(source, /records\.changeRequest|bases\.createChangeRequest/);
  assert.match(source, /decideApproval/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, false);
  assert.ok(appConfig.permissions.writeProcedures.includes("records.changeRequest"));
});

test("the support-qa quality gate is computed live, never trusted from a stored field", async () => {
  const modelSource = await readFile(join(browserRoot, "js", "support-model.js"), "utf8");
  assert.match(modelSource, /export function runQualityGate/);
  const configSource = await readFile(join(browserRoot, "js", "config.js"), "utf8");
  assert.doesNotMatch(configSource, /"quality-gate"/);
});

test("retires the pre-Busabase local-file provider layer", async () => {
  for (const path of [
    "lib",
    "config.example.json",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/server",
    "app/start.sh",
    "scripts/generate_demo_snapshot.ts",
    "scripts/validate_ui_schema.ts",
    "scripts/execute_decisions.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("ships a trusted execute-decisions script that performs no external send itself", async () => {
  const [source, runtime] = await Promise.all([
    readFile(join(skillRoot, "scripts", "execute_decisions.mjs"), "utf8"),
    readFile(join(skillRoot, "scripts", "lib", "runtime.mjs"), "utf8"),
  ]);
  assert.match(runtime, /createBusabaseClient/);
  assert.match(runtime, /BUSABASE_BASE_URL/);
  assert.match(source, /--apply/);
  assert.doesNotMatch(source, /nodemailer|smtp|sendMail|graph\.facebook\.com|api\.telegram\.org|slack\.com\/api/i);
  assert.match(source, /let status = args\.apply \? "queued" : "dry_run"/);
  assert.doesNotMatch(source, /args\.apply \? "sent"/);
  assert.match(source, /supportSettingsComplete/);
  assert.match(source, /process_email_queue\.mjs/);
  const pkg = await readJson(join(skillRoot, "package.json"));
  assert.equal(pkg.dependencies["busabase-sdk"], "0.30.1");
});

test("finalizes only SMTP-accepted delivery and keeps the submitted RFC Message-ID separate", async () => {
  const source = await readFile(join(skillRoot, "scripts", "finalize_delivery.mjs"), "utf8");
  assert.match(source, /--provider-receipt-id/);
  assert.match(source, /--submitted-message-id/);
  assert.match(source, /direction: "outgoing"/);
  assert.match(source, /status: "done"/);
  assert.match(source, /execution_status: "sent"/);
  assert.match(source, /sla_first_response_at/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /execution_provider_message_id: receiptId/);
  assert.match(source, /provider_message_id: rfcMessageId/);
  assert.match(source, /execution_last_error: ""/);
});

test("ships a bounded email worker with failure and retry state", async () => {
  const source = await readFile(join(skillRoot, "scripts", "process_email_queue.mjs"), "utf8");
  assert.match(source, /send_support_reply\.ts/);
  assert.match(source, /execution_status: "sending"/);
  assert.match(source, /execution_claim_expires_at/);
  assert.match(source, /execution_next_retry_at/);
  assert.match(source, /Ambiguous SMTP outcome/);
  assert.match(source, /providerReceiptId: result\.providerReceiptId/);
  assert.match(source, /submittedMessageId: result\.submittedMessageId/);
  assert.match(source, /finalizeDelivery/);
});

test("initializes reviewable support defaults and exposes approval-first settings editing", async () => {
  const [setup, provider, app] = await Promise.all([
    readFile(join(skillRoot, "scripts", "setup.mjs"), "utf8"),
    readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8"),
    readFile(join(browserRoot, "app.js"), "utf8"),
  ]);
  assert.match(setup, /settingsRecord/);
  assert.match(setup, /autoMerge: false/);
  assert.match(setup, /idempotencyKey: "kelly-support-default-settings-v1"/);
  assert.match(provider, /saveSettings/);
  assert.match(provider, /SUPPORT_SETTINGS_REQUIRED/);
  assert.match(app, /settingsReady/);
  assert.match(app, /save-settings/);
});
