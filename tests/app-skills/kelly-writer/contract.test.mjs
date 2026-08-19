import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-writer");
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
  assert.doesNotMatch(source, /KELLY_WRITER_DATA_PROVIDER|local-file-provider/);
  assert.match(source, /createBusabaseClient/);
});

test("the AirApp never generates content or writes a local export itself", async () => {
  const sources = await Promise.all(
    ["app.js", "js/providers/busabase-provider.js", "js/providers/demo-provider.js", "js/writer-model.js"].map((path) =>
      readFile(join(browserRoot, path), "utf8"),
    ),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /child_process|execFile|\bexeca\b/);
  assert.doesNotMatch(source, /node:fs|node:zlib|writeZipFile|createZip/);
});

test("retires the pre-Busabase local-file provider layer", async () => {
  for (const path of [
    "lib",
    "config.example.json",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/server",
    "app/start.sh",
    "scripts/validate_batch.ts",
    "scripts/validate_ui_schema.ts",
    "scripts/generate_batch.ts",
    "scripts/export_decisions.ts",
    "tests/distribution-export.test.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("ships both trusted scripts: batch generation and export", async () => {
  const generateSource = await readFile(join(skillRoot, "scripts", "generate_batch.mjs"), "utf8");
  assert.match(generateSource, /createBusabaseClient/);
  assert.match(generateSource, /BUSABASE_BASE_URL/);
  assert.match(generateSource, /bases\.createChangeRequest/);
  assert.match(generateSource, /--apply/);

  const exportSource = await readFile(join(skillRoot, "scripts", "export_decisions.mjs"), "utf8");
  assert.match(exportSource, /createBusabaseClient/);
  assert.match(exportSource, /BUSABASE_BASE_URL/);
  assert.match(exportSource, /writeZipFile/);
  assert.match(exportSource, /--apply/);
  assert.match(exportSource, /"done"/);

  const pkg = await readJson(join(skillRoot, "package.json"));
  assert.equal(pkg.dependencies["busabase-sdk"], "0.17.2");
});
