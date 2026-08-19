import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-demo-video-factory");
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
  "app/js/video-model.js",
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
  assert.equal(pkg.dependencies["busabase-sdk"], "0.17.1");
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
  assert.equal(appConfig.bases.length, 2, "expected videos/video-shots");
  for (const base of appConfig.bases) {
    assert.ok(base.readLimit <= 100, `${base.key} readLimit ${base.readLimit} exceeds 100`);
  }
});

test("declares the richer field types from the retired busabase-schema.ts manifest verbatim", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  const videos = appConfig.bases.find((base) => base.key === "videos");
  const shots = appConfig.bases.find((base) => base.key === "video-shots");
  const typeOf = (base, slug) => base.fields.find((field) => field.slug === slug)?.type;
  assert.equal(typeOf(videos, "series"), "select");
  assert.equal(typeOf(videos, "status"), "select");
  assert.equal(typeOf(videos, "verified-claims"), "markdown");
  assert.equal(typeOf(videos, "final-video-url"), "url");
  assert.equal(typeOf(videos, "shots"), "relation");
  assert.equal(typeOf(shots, "video"), "relation");
  assert.equal(typeOf(shots, "asset"), "attachment");
  // attachment options nest under options.attachment.maxFiles, not a
  // top-level options.maxFiles -- see scripts/lib/busabase-client.mjs's
  // header comment for why the retired script's shape was wrong.
  const assetField = shots.fields.find((field) => field.slug === "asset");
  assert.equal(assetField.options.attachment.maxFiles, 10);
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
  assert.doesNotMatch(source, /KELLY_VIDEO_FACTORY_BUSABASE|local-file-provider|config\.local\.json/);
  assert.match(source, /createBusabaseClient/);
});

test("never writes records from the browser — the AirApp is a read-only dashboard, see SKILL.md Boundary", async () => {
  const source = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.doesNotMatch(source, /records\.changeRequest|bases\.createChangeRequest/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, true);
  assert.deepEqual(appConfig.permissions.writeProcedures, []);
});

test("demo mode never writes anywhere", async () => {
  const demoSource = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.match(demoSource, /Demo mode is read-only/);
  assert.doesNotMatch(demoSource, /records\.changeRequest|bases\.createChangeRequest/);
  // The retired app/server/demo.ts's two videos are ported verbatim into the
  // demo dataset.
  assert.match(demoSource, /demo-video-1/);
  assert.match(demoSource, /demo-video-2/);
});

test("all four trusted skill-root scripts exist and only write with their own credentials", async () => {
  const scriptFiles = ["ensure_schema.mjs", "propose_video.mjs", "set_shot_status.mjs", "status.mjs"];
  const sources = await Promise.all(scriptFiles.map((name) => readFile(join(skillRoot, "scripts", name), "utf8")));
  for (const source of sources) {
    assert.match(source, /busabase-client\.mjs/);
  }
  const clientSource = await readFile(join(skillRoot, "scripts", "lib", "busabase-client.mjs"), "utf8");
  assert.match(clientSource, /loadBusabaseConfig/);
  assert.match(clientSource, /BUSABASE_BASE_URL/);
  // Structure ops only autoMerge after human approval; record proposals
  // always default autoMerge to false so a merge only ever happens through
  // an explicit approveAndMerge() call.
  assert.match(clientSource, /autoMerge = false/);
});

test("ensure_schema.mjs stamps ownership metadata so the AirApp adopts it without a repair step", async () => {
  const source = await readFile(join(skillRoot, "scripts", "ensure_schema.mjs"), "utf8");
  assert.match(source, /metadata:\s*meta\(/);
  assert.match(source, /kelly-demo-video-factory/);
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.schemaVersion, 1);
});

test("retires the pre-Busabase local-file/server layer", async () => {
  for (const path of [
    "config.example.json",
    "lib",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/server",
    "app/start.sh",
    "app/index.html",
    "app/app.js",
    "app/styles.css",
    "app/.cache",
    "scripts/ensure_schema.ts",
    "scripts/propose_video.ts",
    "scripts/set_shot_status.ts",
    "scripts/status.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});
