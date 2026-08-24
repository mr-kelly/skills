import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-portfolio-health", "content", "kelly-portfolio-health-app");
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

test("keeps the package manifest and runtime declarations aligned", async () => {
  const templateRoot = join(repoRoot, "skills", "kelly-portfolio-health");
  const manifest = await readJson(join(templateRoot, "busabase.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(manifest.name, appConfig.appId);
  assert.equal(manifest.template.schemaVersion, appConfig.schemaVersion);
  assert.equal(manifest.template.airapp, appConfig.airApp.slug);
  assert.equal(appConfig.airApp.resourceKey, appConfig.airApp.slug);
  for (const base of appConfig.bases) {
    assert.equal(base.slug, `kelly-portfolio-health-${base.key}`, base.key);
    assert.equal("nodeId" in base, false, base.key);
    assert.equal("baseId" in base, false, base.key);
    const declared = await readJson(join(templateRoot, "content", base.key, "base.json"));
    assert.equal(declared.name, base.name, base.key);
    assert.equal(declared.fields.length, (base.fields ?? []).length, base.key);
  }
});

test("declares itself a template and names only resources it ships", async () => {
  const templateRoot = join(repoRoot, "skills", "kelly-portfolio-health");
  const skill = await readFile(join(templateRoot, "SKILL.md"), "utf8");
  assert.match(skill, /^\s*template: true$/m);
  const resources = [...skill.matchAll(/^\s{6}- (\S+)$/gm)].map((match) => match[1]);
  assert.ok(resources.length > 0, "SKILL.md should list its resources");
  for (const key of resources) await readFile(join(templateRoot, "content", key, "base.json"));
});

test("every Base readLimit stays within the records.list ceiling", async () => {
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
    "package-lock.json",
    ".gitignore",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("no skill-root trusted script: the retired fixture generator and schema validator were folded into demo-provider.js", async () => {
  const skillRoot = join(repoRoot, "skills", "kelly-portfolio-health");
  await assert.rejects(readFile(join(skillRoot, "scripts", "generate_demo_snapshot.mjs")));
  // The skill-root package.json that does exist is scoped to publishing the
  // AirApp, not to generating fixtures from outside it.
  const pkg = JSON.parse(await readFile(join(skillRoot, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies), ["busabase-sdk"]);
  const scripts = await readdir(join(skillRoot, "scripts")).catch(() => []);
  assert.deepEqual(scripts.sort(), ["publish_airapp.mjs", "setup.mjs", "sync-content.mjs"]);
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.match(demoSource, /mulberry32/);
});
