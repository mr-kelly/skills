import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-portfolio-health", "app");
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
  assert.doesNotMatch(source, /KELLY_PORTFOLIO_HEALTH_DATA_PROVIDER|local-file-provider/);
  assert.match(source, /createBusabaseClient/);
});

test("this is a direct-manipulation dashboard: the browser is allowed to write the flag/note decision directly", async () => {
  // Unlike a review/approval-queue skill, kelly-portfolio-health's flag/clear
  // flag/note action has no separate approval step: SKILL.md says the human
  // action is "flag a contract for review, clear a flag, or leave a note"
  // and there is no transaction path in this skill by design. The decision
  // is written straight through records.changeRequest onto the contract's
  // own record (flagged/note/decision_updated_at), matching kelly-llm-gateway's
  // and kelly-behavior-predict's direct-write precedent rather than
  // kelly-money's read-only-provider precedent.
  const providerSource = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(providerSource, /records\.changeRequest/);
  assert.match(providerSource, /async decideContract\(/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, false);
  assert.ok(appConfig.permissions.writeProcedures.includes("records.changeRequest"));
});

test("demo mode never writes anywhere", async () => {
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.match(demoSource, /Demo mode is read-only/);
  assert.doesNotMatch(demoSource, /records\.changeRequest|bases\.createChangeRequest/);
});

test("retires the pre-Busabase local-file provider layer", async () => {
  const skillRoot = join(repoRoot, "skills", "kelly-portfolio-health");
  for (const path of [
    "lib",
    "config.example.json",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/server",
    "app/start.sh",
    "scripts/generate_demo_snapshot.ts",
    "scripts/validate_ui_schema.ts",
    "package.json",
    "package-lock.json",
    ".gitignore",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("no skill-root trusted script: the retired fixture generator and schema validator were folded into demo-provider.js", async () => {
  const skillRoot = join(repoRoot, "skills", "kelly-portfolio-health");
  await assert.rejects(readFile(join(skillRoot, "scripts", "generate_demo_snapshot.mjs")));
  await assert.rejects(readFile(join(skillRoot, "package.json")));
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.match(demoSource, /mulberry32/);
});
