import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-products");
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
  "app/js/products-model.js",
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
  assert.deepEqual(appConfig.bases.map((base) => base.key).sort(), [
    "channels",
    "inventory",
    "products",
    "review",
    "settings",
  ]);
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
  assert.doesNotMatch(
    source,
    /KELLY_PRODUCTS_CONFIG|KELLY_PRODUCTS_DATA_PROVIDER|local-file-provider|config\.local\.json/,
  );
  assert.match(source, /createBusabaseClient/);
});

test("the AirApp itself never reads a local file or performs the real follow-up", async () => {
  const sources = await Promise.all(
    ["app.js", "js/providers/busabase-provider.js", "js/providers/demo-provider.js", "js/products-model.js"].map(
      (path) => readFile(join(browserRoot, path), "utf8"),
    ),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /child_process|execFile|\bexeca\b/);
  assert.doesNotMatch(source, /node:fs|readFile\(/);
});

test("this is a decision-only AirApp: the browser only ever decides on a review item, never creates a product/channel/inventory row", async () => {
  const providerSource = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(providerSource, /records\.changeRequest/);
  assert.match(providerSource, /async decideReview\(/);
  assert.doesNotMatch(
    providerSource,
    /async createProduct|async updateProduct|async createChannel|async createInventory/,
  );
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, false);
  assert.ok(appConfig.permissions.writeProcedures.includes("records.changeRequest"));
});

test("no delete operation exists in this skill's AirApp UI", async () => {
  const providerSource = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.doesNotMatch(providerSource, /operation:\s*"delete"/);
  assert.doesNotMatch(providerSource, /changeRequests\.review|changeRequests\.merge/);
});

test("demo mode never writes anywhere", async () => {
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.match(demoSource, /Demo mode is read-only/);
  assert.doesNotMatch(demoSource, /records\.changeRequest|bases\.createChangeRequest/);
});

test("decisions/status are direct field writes on the owning review record -- no decisions.json-equivalent bucket", async () => {
  const modelSource = await readFile(join(browserRoot, "js", "products-model.js"), "utf8");
  assert.match(modelSource, /export function computeMetrics/);
  assert.match(modelSource, /export function normalizeReviewRow/);
  assert.match(modelSource, /export function statusForVerdict/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  const reviewBase = appConfig.bases.find((base) => base.key === "review");
  const fieldSlugs = reviewBase.fields.map((field) => field.slug);
  assert.ok(fieldSlugs.includes("status"));
  assert.ok(fieldSlugs.includes("decision-note"));
  assert.ok(fieldSlugs.includes("decided-at"));
});

test("retires the pre-Busabase local-file/server layer", async () => {
  for (const path of [
    "config.example.json",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/server",
    "app/start.sh",
    "app/index.html",
    "app/app.js",
    "app/i18n",
    "app/styles.css",
    "app/accent-theme.js",
    "app/accent-theme.css",
    "app/demo-visuals.js",
    "app/demo-visuals.css",
    "scripts/validate_ui_schema.ts",
    "scripts/generate_demo_assets.ts",
    "scripts/generate_demo_snapshot.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("real product images ship as static files served under app/app/assets, not the retired skill-root assets/ dir", async () => {
  await assert.rejects(readFile(join(skillRoot, "assets", "product-images", "aurora-lamp.png")));
  await readFile(join(browserRoot, "assets", "product-images", "aurora-lamp.png"));
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.match(demoSource, /\/assets\/product-images\/aurora-lamp\.png/);
});

test("ships both trusted scripts: ingest_products and execute_decisions", async () => {
  const ingestSource = await readFile(join(skillRoot, "scripts", "ingest_products.mjs"), "utf8");
  assert.match(ingestSource, /createBusabaseClient/);
  assert.match(ingestSource, /BUSABASE_BASE_URL/);
  assert.match(ingestSource, /--apply/);

  const executeSource = await readFile(join(skillRoot, "scripts", "execute_decisions.mjs"), "utf8");
  assert.match(executeSource, /createBusabaseClient/);
  assert.match(executeSource, /BUSABASE_BASE_URL/);
  assert.match(executeSource, /--apply/);
  assert.match(executeSource, /reviewExecution/);
  // The planner never flips a review item's decision status itself -- only
  // an execution marker (execution-status/execution-detail/executed-at).
  assert.doesNotMatch(executeSource, /status:\s*"approved"|status:\s*"blocked"/);

  const pkg = await readJson(join(skillRoot, "package.json"));
  assert.equal(pkg.dependencies["busabase-sdk"], "0.17.2");
});
