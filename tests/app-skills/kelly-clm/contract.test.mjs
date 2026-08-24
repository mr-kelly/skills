import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-clm");
const appRoot = join(skillRoot, "content", "kelly-clm-app");
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
  "app/js/clm-model.js",
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
  const templateRoot = join(repoRoot, "skills", "kelly-clm");
  const manifest = await readJson(join(templateRoot, "busabase.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(manifest.name, appConfig.appId);
  assert.equal(manifest.template.schemaVersion, appConfig.schemaVersion);
  assert.equal(manifest.template.airapp, appConfig.airApp.slug);
  assert.equal(appConfig.airApp.resourceKey, appConfig.airApp.slug);
  for (const base of appConfig.bases) {
    assert.equal(base.slug, `kelly-clm-${base.key}`, base.key);
    assert.equal("nodeId" in base, false, base.key);
    assert.equal("baseId" in base, false, base.key);
    const declared = await readJson(join(templateRoot, "content", base.key, "base.json"));
    assert.equal(declared.name, base.name, base.key);
    assert.equal(declared.fields.length, (base.fields ?? []).length, base.key);
  }
});

test("declares itself a template and names only resources it ships", async () => {
  const templateRoot = join(repoRoot, "skills", "kelly-clm");
  const skill = await readFile(join(templateRoot, "SKILL.md"), "utf8");
  assert.match(skill, /^\s*template: true$/m);
  const resources = [...skill.matchAll(/^\s{6}- (\S+)$/gm)].map((match) => match[1]);
  assert.ok(resources.length > 0, "SKILL.md should list its resources");
  for (const key of resources) await readFile(join(templateRoot, "content", key, "base.json"));
});

test("every declared Base stays within the records.list limit=100 server cap", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.bases.length, 3, "expected contracts/obligations/approvals");
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
  assert.doesNotMatch(source, /KELLY_CLM_CONFIG|KELLY_CLM_DATA_PROVIDER|local-file-provider|config\.local\.json/);
  assert.match(source, /createBusabaseClient/);
});

test("this is a direct-manipulation control panel: contract create/edit, obligation mark-done, renewal acknowledge, and approval decision are all direct writes, not a review queue", async () => {
  const providerSource = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(providerSource, /records\.changeRequest/);
  assert.match(providerSource, /bases\.createChangeRequest/);
  assert.match(providerSource, /async createContract\(/);
  assert.match(providerSource, /async updateContract\(/);
  assert.match(providerSource, /async markObligationDone\(/);
  assert.match(providerSource, /async acknowledgeRenewal\(/);
  assert.match(providerSource, /async saveApprovalDecision\(/);
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

test("decisions/status are direct field writes on the owning record -- no decisions.json-equivalent bucket", async () => {
  const modelSource = await readFile(join(browserRoot, "js", "clm-model.js"), "utf8");
  assert.match(modelSource, /export function computeMetrics/);
  assert.match(modelSource, /export function normalizeContractRow/);
  assert.match(modelSource, /export function normalizeObligationRow/);
  assert.match(modelSource, /export function normalizeApprovalRow/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  const approvalsBase = appConfig.bases.find((base) => base.key === "approvals");
  const fieldSlugs = approvalsBase.fields.map((field) => field.slug);
  assert.ok(fieldSlugs.includes("status"));
  assert.ok(fieldSlugs.includes("decision-note"));
  assert.ok(fieldSlugs.includes("decided-at"));
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
    "app/i18n",
    "app/styles.css",
    "app/accent-theme.js",
    "app/accent-theme.css",
    "app/demo-visuals.js",
    "app/demo-visuals.css",
    "scripts/validate_ui_schema.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("the skill-root package.json exists only to publish the AirApp, not to run any external-side-effect script — every record write is still a pure Busabase write", async () => {
  const pkg = JSON.parse(await readFile(join(skillRoot, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies), ["busabase-sdk"]);
  const scripts = await readdir(join(skillRoot, "scripts")).catch(() => []);
  assert.deepEqual(scripts.sort(), ["publish_airapp.mjs", "setup.mjs", "sync-content.mjs"]);
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  // The retired app/server/demo.ts's four contracts (Nimbus/Orbit/Luma/Acme)
  // are ported verbatim into the demo dataset.
  assert.match(demoSource, /Nimbus Analytics MSA/);
  assert.match(demoSource, /Orbit Processor DPA/);
  assert.match(demoSource, /Luma Implementation SOW/);
  assert.match(demoSource, /Acme Mutual NDA/);
});
