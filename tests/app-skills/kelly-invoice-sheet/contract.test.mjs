import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-invoice-sheet");
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
  "app/js/invoice-model.js",
  "app/js/providers/index.js",
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
  "app/connect-gate.css",
];

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("has the canonical app project and deterministic commands", async () => {
  await Promise.all(requiredFiles.map((path) => readFile(join(appRoot, path))));
  const pkg = await readJson(join(appRoot, "package.json"));
  assert.equal(pkg.engines.node, ">=24.18.0");
  assert.equal(pkg.scripts.dev, "node server.js");
  assert.equal(pkg.scripts.start, "node server.js");
  assert.match(pkg.scripts.check, /node --test/);
  assert.equal(pkg.dependencies["busabase-sdk"], "0.15.0");
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
  assert.ok(appConfig.bases.length >= 2, "expected invoices/settings");
  for (const base of appConfig.bases) {
    assert.ok(base.readLimit <= 100, `${base.key} readLimit ${base.readLimit} exceeds 100`);
  }
});

test("the demo dataset stays within the invoices Base's readLimit", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  const { demoInvoices } = await import(join(browserRoot, "js", "invoice-model.js"));
  const invoices = demoInvoices();
  const byKey = Object.fromEntries(appConfig.bases.map((base) => [base.key, base]));
  assert.ok(invoices.length <= byKey.invoices.readLimit);
});

test("does not persist secrets or a second data provider in browser storage", async () => {
  const sources = await Promise.all(
    [
      "app.js",
      "js/busabase-client.js",
      "js/providers/busabase-provider.js",
      "js/resource-provisioning.js",
      "js/connect-gate.js",
    ].map((path) => readFile(join(browserRoot, path), "utf8")),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /localStorage\.setItem\("busabase|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer/i);
  assert.doesNotMatch(source, /KELLY_INVOICE_SHEET_DATA_PROVIDER|local-file-provider|config\.local\.json/);
  assert.match(source, /createBusabaseClient/);
});

test("the AirApp itself never reads a local file", async () => {
  const sources = await Promise.all(
    ["app.js", "js/providers/busabase-provider.js", "js/providers/demo-provider.js", "js/invoice-model.js"].map(
      (path) => readFile(join(browserRoot, path), "utf8"),
    ),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /child_process|execFile|\bexeca\b/);
  assert.doesNotMatch(source, /node:fs|readFile\(/);
});

test("has a live decision workflow: the review verdict goes through records.changeRequest", async () => {
  const source = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(source, /records\.changeRequest|bases\.createChangeRequest/);
  assert.match(source, /submitDecision/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, false);
  assert.ok(appConfig.permissions.writeProcedures.includes("records.changeRequest"));
});

test("deterministic domain math: invoice-model never calls a real LLM/HTTP judge", async () => {
  const source = await readFile(join(browserRoot, "js", "invoice-model.js"), "utf8");
  assert.doesNotMatch(source, /fetch\(|openai|anthropic|XMLHttpRequest/i);
  assert.match(source, /recomputeMetrics/);
  assert.match(source, /demoInvoices/);
});

test("this skill never uploads an invoice file from the browser", async () => {
  const sources = await Promise.all(
    ["app.js", "js/providers/busabase-provider.js", "js/providers/demo-provider.js", "js/invoice-model.js"].map(
      (path) => readFile(join(browserRoot, path), "utf8"),
    ),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /new FormData\(\)|\/api\/upload|multipart\/form-data/i);
});

test("retires the pre-Busabase local-file provider layer", async () => {
  for (const path of [
    "lib",
    "config.example.json",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/server",
    "app/start.sh",
    "app/i18n",
    "app/index.html",
    "app/demo-visuals.js",
    "app/demo-visuals.css",
    "app/styles.css",
    "app/app.js",
    "scripts/validate_ui_schema.ts",
    "scripts/generate_demo_batch.ts",
    "scripts/export_decisions.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("wraps invoice ingestion and export in trusted .mjs scripts", async () => {
  const importSource = await readFile(join(skillRoot, "scripts", "import_batch.mjs"), "utf8");
  assert.match(importSource, /createBusabaseClient/);
  assert.match(importSource, /BUSABASE_BASE_URL/);
  assert.match(importSource, /--apply/);
  assert.match(importSource, /validateInvoicesShape/);

  const exportSource = await readFile(join(skillRoot, "scripts", "export_decisions.mjs"), "utf8");
  assert.match(exportSource, /createBusabaseClient/);
  assert.match(exportSource, /BUSABASE_BASE_URL/);
  assert.match(exportSource, /--apply/);
  assert.match(exportSource, /invoices\.csv/);
  assert.match(exportSource, /line_items\.csv/);
  assert.match(exportSource, /approved_invoices\.json/);

  const pkg = await readJson(join(skillRoot, "package.json"));
  assert.equal(pkg.dependencies["busabase-sdk"], "0.11.0");
});
