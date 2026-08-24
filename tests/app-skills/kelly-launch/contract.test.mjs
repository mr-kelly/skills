import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-launch", "content", "kelly-launch-app");
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
  const templateRoot = join(repoRoot, "skills", "kelly-launch");
  const manifest = await readJson(join(templateRoot, "busabase.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(manifest.name, appConfig.appId);
  assert.equal(manifest.template.schemaVersion, appConfig.schemaVersion);
  assert.equal(manifest.template.airapp, appConfig.airApp.slug);
  assert.equal(appConfig.airApp.resourceKey, appConfig.airApp.slug);
  for (const base of appConfig.bases) {
    assert.equal(base.slug, `kelly-launch-${base.key}`, base.key);
    assert.equal("nodeId" in base, false, base.key);
    assert.equal("baseId" in base, false, base.key);
    const declared = await readJson(join(templateRoot, "content", base.key, "base.json"));
    assert.equal(declared.name, base.name, base.key);
    assert.equal(declared.fields.length, (base.fields ?? []).length, base.key);
  }
});

test("declares itself a template and names only resources it ships", async () => {
  const templateRoot = join(repoRoot, "skills", "kelly-launch");
  const skill = await readFile(join(templateRoot, "SKILL.md"), "utf8");
  assert.match(skill, /^\s*template: true$/m);
  const resources = [...skill.matchAll(/^\s{6}- (\S+)$/gm)].map((match) => match[1]);
  assert.ok(resources.length > 0, "SKILL.md should list its resources");
  for (const key of resources) await readFile(join(templateRoot, "content", key, "base.json"));
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
  assert.doesNotMatch(source, /KELLY_LAUNCH_DATA_PROVIDER|local-file-provider/);
  assert.match(source, /createBusabaseClient/);
});

test("retires the pre-Busabase local-file provider layer", async () => {
  const skillRoot = join(repoRoot, "skills", "kelly-launch");
  for (const path of ["lib", "config.example.json", "app/setup-gate.js", "app/server", "app/start.sh"]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});
