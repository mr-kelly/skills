import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-education-intel", "app");
const browserRoot = join(appRoot, "app");
const requiredFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "server.js",
  "resource-map.json",
  "scripts/check.mjs",
  "app/index.html",
  "app/app.js",
  "app/styles.css",
  "app/js/config.js",
  "app/js/education-model.js",
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
  assert.equal(pkg.dependencies["busabase-sdk"], "0.17.1");
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

test("every Base readLimit stays within the records.list ceiling", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.deepEqual(appConfig.bases.map((base) => base.key).sort(), [
    "actions",
    "drafts",
    "settings",
    "signals",
    "sources",
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
  assert.doesNotMatch(source, /KELLY_ECOMMERCE_INTEL_UI_PORT|KELLY_ECOMMERCE_INTEL_DATA_PROVIDER|local-file-provider/);
  assert.match(source, /createBusabaseClient/);
});

test("decisions write directly onto the item's own record via records.changeRequest, autoMerge gated on standalone-local", async () => {
  const providerSource = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(providerSource, /async saveDecision\(/);
  assert.match(providerSource, /records\.changeRequest|bases\.createChangeRequest/);
  assert.match(providerSource, /isStandaloneLocalRuntime/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, false);
  assert.ok(appConfig.permissions.writeProcedures.includes("records.changeRequest"));
  assert.ok(appConfig.permissions.writeProcedures.includes("bases.createChangeRequest"));
});

test("demo mode never touches Busabase but still lets the reviewer decide on the in-memory batch", async () => {
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.doesNotMatch(demoSource, /records\.changeRequest|bases\.createChangeRequest|createBusabaseClient/);
  assert.match(demoSource, /async saveDecision\(/);
  assert.match(demoSource, /Demo mode is read-only/);
});

test("a trusted skill-root decision-execution script exists, dry-run gated by --apply", async () => {
  const skillRoot = join(repoRoot, "skills", "kelly-education-intel");
  const scriptSource = await readFile(join(skillRoot, "scripts", "execute_decisions.mjs"), "utf8");
  assert.match(scriptSource, /createBusabaseClient/);
  assert.match(scriptSource, /operationForDecision/);
  assert.match(scriptSource, /--apply/);
  assert.match(scriptSource, /BUSABASE_BASE_URL/);
  const pkg = await readJson(join(skillRoot, "package.json"));
  assert.equal(pkg.dependencies["busabase-sdk"], "0.17.1");
});

test("retires the pre-Busabase local-file/TS-server layer", async () => {
  const skillRoot = join(repoRoot, "skills", "kelly-education-intel");
  for (const path of [
    "app/server",
    "config.example.json",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/start.sh",
    "scripts/validate_ui_schema.ts",
    "scripts/generate_batch.ts",
    "scripts/execute_decisions.ts",
    ".gitignore",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)), `expected ${path} to be gone`);
  }
});
