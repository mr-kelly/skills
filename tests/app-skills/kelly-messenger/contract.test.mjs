import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-messenger");
const appRoot = join(skillRoot, "app");
const browserRoot = join(appRoot, "app");
const requiredFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "server.js",
  "resource-map.json",
  "scripts/check.mjs",
  "app/index.html",
  "app/app.js",
  "app/js/config.js",
  "app/js/messenger-model.js",
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
  assert.equal(pkg.dependencies["busabase-sdk"], "0.17.2");
});

test("keeps resource-map and runtime declarations aligned", async () => {
  const resourceMap = await readJson(join(appRoot, "resource-map.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(resourceMap.schemaVersion, appConfig.schemaVersion);
  assert.equal(resourceMap.appRoot.slug, appConfig.folder.slug);
  assert.equal(resourceMap.provisioning.mode, "lazy");
  assert.deepEqual(resourceMap.provisioning.mutations, appConfig.permissions.setupProcedures);
  assert.deepEqual(
    resourceMap.resources.map(({ key, slug, schemaVersion }) => ({ key, slug, schemaVersion })),
    appConfig.bases.map(({ key, slug }) => ({ key, slug, schemaVersion: appConfig.schemaVersion })),
  );
});

test("every declared Base stays within the records.list limit=100 server cap", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.ok(appConfig.bases.length >= 6, "expected accounts/conversations/messages/sync_log/replies/settings");
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
  assert.doesNotMatch(source, /KELLY_MESSENGER_DATA_PROVIDER|local-file-provider|config\.local\.json/);
  assert.match(source, /createBusabaseClient/);
});

test("the AirApp itself never talks to a chat platform", async () => {
  const sources = await Promise.all(
    ["app.js", "js/providers/busabase-provider.js", "js/providers/demo-provider.js", "js/messenger-model.js"].map(
      (path) => readFile(join(browserRoot, path), "utf8"),
    ),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /child_process|execFile|\bexeca\b/);
  assert.doesNotMatch(
    source,
    /hooks\.slack\.com|api\.slack\.com|slack\.com\/api|discord\.com\/api|api\.telegram\.org|graph\.facebook\.com/i,
  );
});

test("has a live decision workflow: the reply review write path goes through records.changeRequest", async () => {
  const source = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(source, /records\.changeRequest|bases\.createChangeRequest/);
  assert.match(source, /queueReply/);
  assert.match(source, /decideReply/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, false);
  assert.ok(appConfig.permissions.writeProcedures.includes("records.changeRequest"));
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
    "scripts/ingest_messages.ts",
    "scripts/sync_messages.ts",
    "scripts/send_outbox.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("ships all three trusted scripts: sync, ingest, and send", async () => {
  const syncSource = await readFile(join(skillRoot, "scripts", "sync_messages.mjs"), "utf8");
  assert.match(syncSource, /createBusabaseClient/);
  assert.match(syncSource, /BUSABASE_BASE_URL/);
  assert.match(syncSource, /--apply/);
  assert.match(syncSource, /slack\.com\/api/);

  const ingestSource = await readFile(join(skillRoot, "scripts", "ingest_messages.mjs"), "utf8");
  assert.match(ingestSource, /createBusabaseClient/);
  assert.match(ingestSource, /BUSABASE_BASE_URL/);
  assert.match(ingestSource, /--apply/);
  assert.match(ingestSource, /message-id|message_id/);

  const sendSource = await readFile(join(skillRoot, "scripts", "send_outbox.mjs"), "utf8");
  assert.match(sendSource, /createBusabaseClient/);
  assert.match(sendSource, /BUSABASE_BASE_URL/);
  assert.match(sendSource, /--send/);
  assert.match(sendSource, /handoff_to_agent/);

  const pkg = await readJson(join(skillRoot, "package.json"));
  assert.equal(pkg.dependencies["busabase-sdk"], "0.17.2");
});
