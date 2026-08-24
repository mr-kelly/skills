import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-revshare-simulator");
const appRoot = join(skillRoot, "content", "kelly-revshare-simulator-app");
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
  "app/js/simulator-model.js",
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

test("keeps the package manifest and runtime declarations aligned", async () => {
  const templateRoot = join(repoRoot, "skills", "kelly-revshare-simulator");
  const manifest = await readJson(join(templateRoot, "busabase.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(manifest.name, appConfig.appId);
  assert.equal(manifest.template.schemaVersion, appConfig.schemaVersion);
  assert.equal(manifest.template.airapp, appConfig.airApp.slug);
  assert.equal(appConfig.airApp.resourceKey, appConfig.airApp.slug);
  for (const base of appConfig.bases) {
    assert.equal(base.slug, `kelly-revshare-simulator-${base.key}`, base.key);
    assert.equal("nodeId" in base, false, base.key);
    assert.equal("baseId" in base, false, base.key);
    const declared = await readJson(join(templateRoot, "content", base.key, "base.json"));
    assert.equal(declared.name, base.name, base.key);
    assert.equal(declared.fields.length, (base.fields ?? []).length, base.key);
  }
});

test("declares itself a template and names only resources it ships", async () => {
  const templateRoot = join(repoRoot, "skills", "kelly-revshare-simulator");
  const skill = await readFile(join(templateRoot, "SKILL.md"), "utf8");
  assert.match(skill, /^\s*template: true$/m);
  const resources = [...skill.matchAll(/^\s{6}- (\S+)$/gm)].map((match) => match[1]);
  assert.ok(resources.length > 0, "SKILL.md should list its resources");
  for (const key of resources) await readFile(join(templateRoot, "content", key, "base.json"));
});

test("every declared Base stays within the records.list limit=100 server cap", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.bases.length, 2, "expected scenarios/settings");
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
    /KELLY_REVSHARE_SIMULATOR_CONFIG|KELLY_REVSHARE_SIMULATOR_DATA_PROVIDER|local-file-provider|config\.local\.json/,
  );
  assert.match(source, /createBusabaseClient/);
});

test("the AirApp never fetches live revenue/banking/payment data or moves money", async () => {
  // SKILL.md's Boundary section: "Pure deterministic math over analyst-
  // supplied inputs. The app never fetches live revenue, banking, or payment
  // data, and never disburses, transfers, or moves money."
  const sources = await Promise.all(
    ["app.js", "js/providers/busabase-provider.js", "js/providers/demo-provider.js", "js/simulator-model.js"].map(
      (path) => readFile(join(browserRoot, path), "utf8"),
    ),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /child_process|execFile|\bexeca\b/);
  assert.doesNotMatch(source, /node:fs|readFile\(/);
  // "payment" itself is legitimate domain vocabulary here (the monthly
  // revenue-share payment field) -- check for an actual money-movement side
  // effect instead of the word. Math.random() is fine (only used for local
  // scenario id generation, never inside the deterministic simulation math
  // itself -- see the worked-example unit tests in app/test/).
  assert.doesNotMatch(source, /stripe|plaid|\bdisburse|\btransfer\(|\bwire\(|\bach\(/i);
});

test("this is a direct-manipulation control panel: create/edit/delete/decision are all direct writes, not a review queue", async () => {
  const providerSource = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(providerSource, /records\.changeRequest/);
  assert.match(providerSource, /bases\.createChangeRequest/);
  assert.match(providerSource, /async createScenario\(/);
  assert.match(providerSource, /async updateScenario\(/);
  assert.match(providerSource, /async saveDecision\(/);
  assert.match(providerSource, /async deleteScenario\(/);
  assert.match(providerSource, /operation:\s*"delete"/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, false);
  assert.ok(appConfig.permissions.writeProcedures.includes("records.changeRequest"));
  assert.ok(appConfig.permissions.writeProcedures.includes("bases.createChangeRequest"));
});

test("demo mode never writes anywhere", async () => {
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.match(demoSource, /Demo mode is read-only/);
  assert.doesNotMatch(demoSource, /records\.changeRequest|bases\.createChangeRequest/);
});

test("scenario result (cash-flow projection, payout multiple, effective cost, risk flags) is never stored, always recomputed", async () => {
  // references/ui-schema.md's field notes: `result` is fully derived from
  // `input` and recomputed on every read -- the Busabase `scenarios` Base
  // only stores the raw analyst inputs plus the decision fields.
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  const scenariosBase = appConfig.bases.find((base) => base.key === "scenarios");
  const fieldSlugs = scenariosBase.fields.map((field) => field.slug);
  for (const forbidden of [
    "result",
    "monthly",
    "cash-flow-payout-multiple",
    "effective-annual-cost-pct",
    "risk-flags",
  ]) {
    assert.ok(!fieldSlugs.includes(forbidden), `scenarios Base should not persist derived field "${forbidden}"`);
  }
  const modelSource = await readFile(join(browserRoot, "js", "simulator-model.js"), "utf8");
  assert.match(modelSource, /export function simulateScenario/);
  assert.match(modelSource, /export function normalizeScenarioRow/);
});

test("retires the pre-Busabase local-file provider layer", async () => {
  for (const path of [
    "lib",
    "config.example.json",
    "package-lock.json",
    ".gitignore",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/server",
    "app/start.sh",
    "app/index.html",
    "app/app.js",
    "app/i18n",
    "app/styles.css",
    "scripts/generate_batch.ts",
    "scripts/validate_ui_schema.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("no skill-root trusted script: scripts/generate_batch.ts was purely a demo-fixture seeder, folded into demo-provider.js", async () => {
  // The retired scripts/generate_batch.ts wrote the exact same four-scenario
  // fixture app/server/demo.ts also served -- there was no real external
  // batch-scenario intake path, so it is not carried forward as a trusted
  // .mjs script.
  await assert.rejects(readFile(join(skillRoot, "scripts", "generate_batch.mjs")));
  // The skill-root package.json that does exist is scoped to publishing the
  // AirApp, not to generating batch fixtures from outside it.
  const pkg = JSON.parse(await readFile(join(skillRoot, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies), ["busabase-sdk"]);
  const scripts = await readdir(join(skillRoot, "scripts")).catch(() => []);
  assert.deepEqual(scripts.sort(), ["publish_airapp.mjs", "setup.mjs", "sync-content.mjs"]);
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.match(demoSource, /Bubble Tea Chain/);
  assert.match(demoSource, /Discount Mart/);
});
