import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-agent-observability", "app");
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
  "app/js/fleet-model.js",
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

test("every Base readLimit stays within the records.list ceiling", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
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
  assert.doesNotMatch(source, /KELLY_AGENT_OBS_UI_PORT|KELLY_AGENT_OBSERVABILITY_DATA_PROVIDER|local-file-provider/);
  assert.match(source, /createBusabaseClient/);
});

test("agents and traces are trusted-script-owned: the browser provider never writes those two Bases", async () => {
  // Unlike a review/approval-queue skill, this app never generates or edits
  // agent/trace rows — SKILL.md says they "enter Busabase only through the
  // trusted scripts/generate_fleet_data.mjs seed script", the same
  // read-only-for-the-AirApp precedent as kelly-portfolio-health's contracts.
  // The browser provider imports only the row/field encoders it actually
  // needs to write (handoffs) — importing baseAgentFields/baseTraceFields at
  // all would be a signal it's trying to write agents/traces too.
  const providerSource = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.doesNotMatch(providerSource, /baseAgentFields|baseTraceFields/);
  assert.doesNotMatch(providerSource, /records\.changeRequest/);
});

test("the one human action (handoffs) writes a brand-new row, never a field update", async () => {
  const providerSource = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(providerSource, /async submitHandoff\(/);
  assert.match(providerSource, /bases\.createChangeRequest/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, false);
  assert.ok(appConfig.permissions.writeProcedures.includes("bases.createChangeRequest"));
});

test("demo mode never writes anywhere", async () => {
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.match(demoSource, /Demo mode is read-only/);
  assert.doesNotMatch(demoSource, /records\.changeRequest|bases\.createChangeRequest/);
});

test("a trusted skill-root generator script exists and never touches handoffs", async () => {
  const skillRoot = join(repoRoot, "skills", "kelly-agent-observability");
  const scriptSource = await readFile(join(skillRoot, "scripts", "generate_fleet_data.mjs"), "utf8");
  assert.match(scriptSource, /createBusabaseClient/);
  assert.match(scriptSource, /generateFleetData/);
  assert.doesNotMatch(scriptSource, /handoffsBase/);
  const pkg = await readJson(join(skillRoot, "package.json"));
  assert.equal(pkg.dependencies["busabase-sdk"], "0.11.0");
});

test("retires the pre-Busabase local-file/TS-server layer", async () => {
  const skillRoot = join(repoRoot, "skills", "kelly-agent-observability");
  for (const path of [
    "lib",
    "config.example.json",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/server",
    "app/start.sh",
    "scripts/validate_ui_schema.ts",
    "scripts/generate_fleet_data.ts",
    ".gitignore",
    "app/i18n/en.json",
    "app/i18n/zh-CN.json",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)), `expected ${path} to be gone`);
  }
});
