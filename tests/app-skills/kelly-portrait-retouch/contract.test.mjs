import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-portrait-retouch");
const appRoot = join(skillRoot, "app");
const browserRoot = join(appRoot, "app");
const required = [
  "package.json",
  "pnpm-lock.yaml",
  "server.js",
  "resource-map.json",
  "scripts/check.mjs",
  "app/index.html",
  "app/app.js",
  "app/styles.css",
  "app/js/config.js",
  "app/js/retouch-model.js",
  "app/js/providers/index.js",
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
  "app/assets/demo/portrait-source.jpg",
  "app/assets/demo/portrait-retouched.jpg",
];

test("contains a complete canonical app and frozen lockfile", async () => {
  await Promise.all(required.map((file) => readFile(join(appRoot, file))));
  const pkg = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
  assert.equal(pkg.engines.node, ">=24.18.0");
  assert.equal(pkg.dependencies["busabase-sdk"], "0.15.0");
  assert.equal(pkg.scripts.dev, "node server.js");
});

test("aligns Base declarations with the resource map", async () => {
  const map = JSON.parse(await readFile(join(appRoot, "resource-map.json"), "utf8"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  const mappedBases = map.resources.filter((resource) => resource.type === "base");
  assert.equal(map.appId, appConfig.appId);
  assert.equal(map.schemaVersion, appConfig.schemaVersion);
  assert.deepEqual(
    map.resources.map(({ key, slug }) => ({ key, slug })),
    appConfig.bases.map(({ key, slug }) => ({ key, slug })),
  );
  assert.equal(mappedBases.length, appConfig.bases.length);
  assert.deepEqual(
    appConfig.bases.map((base) => base.key),
    ["jobs", "candidates", "settings"],
  );
  assert.ok(
    appConfig.bases.find((base) => base.key === "candidates").fields.some((field) => field.slug === "output-asset-id"),
  );
});

test("keeps image processing and credentials out of browser business source", async () => {
  const files = [
    "app.js",
    "js/busabase-client.js",
    "js/connect-gate.js",
    "js/providers/busabase-provider.js",
    "js/providers/demo-provider.js",
  ];
  const source = (await Promise.all(files.map((file) => readFile(join(browserRoot, file), "utf8")))).join("\n");
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer/i);
  assert.doesNotMatch(source, /child_process|node:fs|sharp\(|multipart\/form-data/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.match(source, /records\.changeRequest/);
  assert.match(source, /readiness/);
  assert.match(source, /saveOnboarding/);
});

test("keeps the trusted asset upload and Agent writes outside browser source", async () => {
  const trusted = await readFile(join(skillRoot, "scripts", "sync-candidate.mjs"), "utf8");
  const helper = await readFile(join(skillRoot, "scripts", "lib", "portrait-busabase.mjs"), "utf8");
  assert.match(trusted, /--apply/);
  assert.match(trusted, /idempotencyKey/);
  assert.match(helper, /assets\.createUploadUrl/);
  assert.match(helper, /autoMerge:\s*true/);
});

test("uses deterministic demo assets and no external image URLs", async () => {
  const { demoSnapshot } = await import(join(browserRoot, "js", "retouch-model.js"));
  const snapshot = demoSnapshot();
  assert.ok(snapshot.candidates.length >= 2);
  for (const candidate of snapshot.candidates) {
    assert.match(candidate.source_url, /^\.\/assets\/demo\//);
    assert.match(candidate.output_url, /^\.\/assets\/demo\//);
  }
});
