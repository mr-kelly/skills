import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-digital-human");
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
  "app/js/digital-human-model.js",
  "app/js/demo-visuals-data.js",
  "app/js/studio-views.js",
  "app/js/providers/index.js",
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
  "app/demo-visuals.css",
  "app/demo-visuals.js",
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

test("declares exactly one Base (qa-decisions) within the records.list limit=100 server cap", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.bases.length, 1, "expected only qa-decisions -- everything else is static reference content");
  for (const base of appConfig.bases) {
    assert.ok(base.readLimit <= 100, `${base.key} readLimit ${base.readLimit} exceeds 100`);
  }
  const fieldSlugs = appConfig.bases[0].fields.map((field) => field.slug);
  assert.deepEqual(fieldSlugs, ["check-id", "action", "note", "decided-at"]);
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
    /KELLY_DIGITAL_HUMAN_CONFIG|KELLY_DIGITAL_HUMAN_DATA_PROVIDER|local-file-provider|config\.local\.json/,
  );
  assert.match(source, /createBusabaseClient/);
});

test("the QA gate is a direct field write on the decision's own record -- no separate decisions.json-equivalent bucket", async () => {
  const providerSource = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(providerSource, /records\.changeRequest/);
  assert.match(providerSource, /bases\.createChangeRequest/);
  assert.match(providerSource, /async saveDecision\(/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, false);
  assert.ok(appConfig.permissions.writeProcedures.includes("records.changeRequest"));
  assert.ok(appConfig.permissions.writeProcedures.includes("bases.createChangeRequest"));
});

test("no delete operation exists in this skill, so the review+merge-on-delete fix from kelly-revshare-simulator does not apply", async () => {
  const providerSource = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.doesNotMatch(providerSource, /operation:\s*"delete"/);
  assert.doesNotMatch(providerSource, /changeRequests\.review|changeRequests\.merge/);
});

test("demo mode never writes anywhere", async () => {
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.match(demoSource, /Demo mode is read-only/);
  assert.doesNotMatch(demoSource, /records\.changeRequest|bases\.createChangeRequest/);
});

test("the project/persona/pipeline/vendor/QA-checklist content is curated reference data, not a Busabase resource", async () => {
  const modelSource = await readFile(join(browserRoot, "js", "digital-human-model.js"), "utf8");
  assert.match(modelSource, /export const QA_CHECKS/);
  assert.match(modelSource, /export const PERSONAS/);
  assert.match(modelSource, /export const PIPELINES/);
  assert.match(modelSource, /export const VENDORS/);
  assert.match(modelSource, /export function computeMetrics/);
  assert.match(modelSource, /export function effectiveStatus/);
});

test("retires the pre-Busabase local-file/server layer", async () => {
  for (const path of [
    "config.example.json",
    "package-lock.json",
    ".gitignore",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/server",
    "app/start.sh",
    "app/index.html",
    "app/app.js",
    "app/styles.css",
    "app/demo-visuals.js",
    "app/demo-visuals.css",
    "app/js",
    "lib",
    "scripts/generate_demo_snapshot.ts",
    "scripts/validate_ui_schema.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("the skill-root package.json exists only to publish the AirApp, not to run any external-side-effect script — every record write is still a pure Busabase write", async () => {
  const pkg = JSON.parse(await readFile(join(skillRoot, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies), ["busabase-sdk"]);
  const scripts = await readdir(join(skillRoot, "scripts")).catch(() => []);
  assert.deepEqual(scripts.sort(), ["publish_airapp.mjs", "setup.mjs"]);
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  const modelSource = await readFile(join(browserRoot, "js", "digital-human-model.js"), "utf8");
  // The retired app/server/demo.ts's project name and all 8 QA check ids are
  // ported verbatim into the demo dataset via digital-human-model.js.
  assert.match(demoSource, /buildSnapshot/);
  assert.match(modelSource, /Kelly AI Product Host/);
  for (const id of [
    "lip-sync",
    "latency",
    "ai-disclosure",
    "voice-consent",
    "script-safety",
    "fallback",
    "privacy",
    "mobile",
  ]) {
    assert.match(modelSource, new RegExp(`id: "${id}"`));
  }
});
