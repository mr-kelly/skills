import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-radar", "app");
const browserRoot = join(appRoot, "app");
const requiredFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "server.js",
  "resource-map.json",
  "scripts/check.mjs",
  "app/index.html",
  "app/app.js",
  "app/connect-gate.css",
  "app/js/config.js",
  "app/js/radar-model.js",
  "app/js/research-views.js",
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
  assert.equal(pkg.dependencies["busabase-sdk"], "0.11.0");
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
  assert.ok(
    appConfig.bases.length >= 9,
    "kelly-radar should declare watchlist/signals/questions/briefs/reports/movers/opportunities/sync_log/settings",
  );
  for (const base of appConfig.bases) {
    assert.ok(base.readLimit <= 100, `${base.key} readLimit ${base.readLimit} exceeds 100`);
  }
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
  assert.doesNotMatch(source, /KELLY_RADAR_DATA_PROVIDER|local-file-provider/);
  assert.match(source, /createBusabaseClient/);
});

test("the AirApp writes verdicts only via records.changeRequest/bases.createChangeRequest, autoMerge gated by isStandaloneLocalRuntime", async () => {
  const source = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(source, /records\.changeRequest/);
  assert.match(source, /bases\.createChangeRequest/);
  assert.match(source, /autoMerge = isStandaloneLocalRuntime\(\)/);
});

test("retires the pre-Busabase local-file provider layer", async () => {
  const skillRoot = join(repoRoot, "skills", "kelly-radar");
  for (const path of [
    "lib",
    "config.example.json",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/server",
    "app/start.sh",
    "scripts/generate_demo_snapshot.ts",
    "scripts/validate_ui_schema.ts",
    "scripts/ingest_signals.ts",
    "scripts/ingest_trends.ts",
    "scripts/file_report.ts",
    "scripts/execute_decisions.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("ships all four trusted scripts, each writing with its own Busabase credentials", async () => {
  const skillRoot = join(repoRoot, "skills", "kelly-radar");
  for (const name of ["ingest_signals.mjs", "ingest_trends.mjs", "file_report.mjs", "execute_decisions.mjs"]) {
    const source = await readFile(join(skillRoot, "scripts", name), "utf8");
    assert.match(source, /createBusabaseClient/, name);
    assert.match(source, /BUSABASE_BASE_URL/, name);
  }
  const pkg = await readJson(join(skillRoot, "package.json"));
  assert.equal(pkg.dependencies["busabase-sdk"], "0.11.0");
});

test("execute_decisions.mjs keeps its --apply dry-run gate and performs no external side effects", async () => {
  const skillRoot = join(repoRoot, "skills", "kelly-radar");
  const source = await readFile(join(skillRoot, "scripts", "execute_decisions.mjs"), "utf8");
  assert.match(source, /--apply/);
  assert.doesNotMatch(source, /writeFile|fs\.write|fetch\(.*kelly-writer|fetch\(.*kelly-feedback/i);
});
