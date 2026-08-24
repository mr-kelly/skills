import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-agent-eval");
const appRoot = join(skillRoot, "content", "kelly-agent-eval-app");
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
  "app/js/eval-model.js",
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
  const templateRoot = join(repoRoot, "skills", "kelly-agent-eval");
  const manifest = await readJson(join(templateRoot, "busabase.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(manifest.name, appConfig.appId);
  assert.equal(manifest.template.schemaVersion, appConfig.schemaVersion);
  assert.equal(manifest.template.airapp, appConfig.airApp.slug);
  assert.equal(appConfig.airApp.resourceKey, appConfig.airApp.slug);
  for (const base of appConfig.bases) {
    assert.equal(base.slug, `kelly-agent-eval-${base.key}`, base.key);
    assert.equal("nodeId" in base, false, base.key);
    assert.equal("baseId" in base, false, base.key);
    const declared = await readJson(join(templateRoot, "content", base.key, "base.json"));
    assert.equal(declared.name, base.name, base.key);
    assert.equal(declared.fields.length, (base.fields ?? []).length, base.key);
  }
});

test("declares itself a template and names only resources it ships", async () => {
  const templateRoot = join(repoRoot, "skills", "kelly-agent-eval");
  const skill = await readFile(join(templateRoot, "SKILL.md"), "utf8");
  assert.match(skill, /^\s*template: true$/m);
  const resources = [...skill.matchAll(/^\s{6}- (\S+)$/gm)].map((match) => match[1]);
  assert.ok(resources.length > 0, "SKILL.md should list its resources");
  for (const key of resources) await readFile(join(templateRoot, "content", key, "base.json"));
});

test("every declared Base stays within the records.list limit=100 server cap", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.ok(appConfig.bases.length >= 2, "expected cases/settings");
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
  assert.doesNotMatch(source, /KELLY_AGENT_EVAL_DATA_PROVIDER|local-file-provider|config\.local\.json/);
  assert.match(source, /createBusabaseClient/);
});

test("the AirApp itself never reads a local file", async () => {
  const sources = await Promise.all(
    ["app.js", "js/providers/busabase-provider.js", "js/providers/demo-provider.js", "js/eval-model.js"].map((path) =>
      readFile(join(browserRoot, path), "utf8"),
    ),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /child_process|execFile|\bexeca\b/);
  assert.doesNotMatch(source, /node:fs|readFile\(/);
});

test("has a live decision workflow: per-case and release verdicts go through records.changeRequest", async () => {
  const source = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(source, /records\.changeRequest|bases\.createChangeRequest/);
  assert.match(source, /decideCase/);
  assert.match(source, /decideRelease/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, false);
  assert.ok(appConfig.permissions.writeProcedures.includes("records.changeRequest"));
});

test("deterministic mock rubric suite: eval-model never calls a real LLM/HTTP judge", async () => {
  const source = await readFile(join(browserRoot, "js", "eval-model.js"), "utf8");
  assert.doesNotMatch(source, /fetch\(|openai|anthropic|XMLHttpRequest/i);
  assert.match(source, /RAW_CASES/);
  assert.match(source, /WEIGHTS/);
});

test("retires the pre-Busabase local-file provider layer", async () => {
  for (const path of [
    "lib",
    "config.example.json",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/server",
    "app/start.sh",
    "scripts/validate_ui_schema.ts",
    "scripts/generate_eval_run.ts",
    "scripts/export_release_report.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("ships both trusted scripts: generate_eval_run and export_release_report", async () => {
  const generateSource = await readFile(join(skillRoot, "scripts", "generate_eval_run.mjs"), "utf8");
  assert.match(generateSource, /createBusabaseClient/);
  assert.match(generateSource, /BUSABASE_BASE_URL/);
  assert.match(generateSource, /--apply/);
  assert.match(generateSource, /RAW_CASES/);

  const exportSource = await readFile(join(skillRoot, "scripts", "export_release_report.mjs"), "utf8");
  assert.match(exportSource, /createBusabaseClient/);
  assert.match(exportSource, /BUSABASE_BASE_URL/);
  assert.match(exportSource, /--apply/);
  assert.match(exportSource, /evaluateReleaseGate/);
  // The exporter never deploys, publishes, or calls an external system.
  assert.doesNotMatch(exportSource, /\.deploy\(|\.publish\(|sendMessage|sendEmail|nodemailer/i);

  const pkg = await readJson(join(skillRoot, "package.json"));
  assert.equal(pkg.dependencies["busabase-sdk"], "0.17.2");
});
