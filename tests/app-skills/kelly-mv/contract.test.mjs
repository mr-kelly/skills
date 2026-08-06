import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-mv");
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
  "app/js/mv-model.js",
  "app/js/mv-client.js",
  "app/js/busabase-client.js",
  "app/js/workspace-views.js",
  "app/js/providers/index.js",
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
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

test("every declared Base stays within the records.list limit=100 server cap", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.deepEqual(appConfig.bases.map((b) => b.key).sort(), ["cast", "project", "settings", "shots"]);
  for (const base of appConfig.bases) {
    assert.ok(base.readLimit <= 100, `${base.key} readLimit ${base.readLimit} exceeds 100`);
  }
});

test("does not persist secrets or a second data provider in browser storage", async () => {
  const sources = await Promise.all(
    [
      "app.js",
      "js/busabase-client.js",
      "js/mv-client.js",
      "js/providers/busabase-provider.js",
      "js/resource-provisioning.js",
      "js/connect-gate.js",
    ].map((path) => readFile(join(browserRoot, path), "utf8")),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /localStorage\.setItem\("busabase|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer/i);
  assert.doesNotMatch(source, /KELLY_MV_DATA_PROVIDER|local-file-provider|config\.local\.json/);
  assert.match(source, /createBusabaseClient/);
});

test("binary media (song/reference cards/shot images/video) go through busabase-sdk's real assets client, not raw fetch", async () => {
  const source = await readFile(join(browserRoot, "js", "mv-client.js"), "utf8");
  assert.match(source, /client\.assets\.createUploadUrl/);
  assert.match(source, /client\.assets\.confirm/);
  assert.match(source, /client\.assets\.get/);
  // No hand-rolled /api/v1/assets/* fetch calls — the SDK covers this
  // surface (verified against the pinned busabase-sdk@0.11.0's own .d.ts;
  // see js/config.js's header comment), unlike a prior skill in this
  // migration whose vendored SDK snapshot did not.
  assert.doesNotMatch(source, /fetch\(["'`]\/api\/v1\/assets/);
});

test("has a live write surface: concept/song/cast/shot edits and uploads go through records.changeRequest + Asset uploads", async () => {
  const source = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(source, /records\.changeRequest|bases\.createChangeRequest/);
  for (const method of [
    "saveTreatment",
    "saveSongMeta",
    "uploadSong",
    "saveCharacter",
    "deleteCharacter",
    "saveShot",
    "deleteShot",
    "uploadShotAsset",
    "setShotActive",
  ]) {
    assert.match(source, new RegExp(`async ${method}\\(`), `busabase-provider must implement ${method}`);
  }
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, false);
  assert.ok(appConfig.permissions.writeProcedures.includes("records.changeRequest"));
});

test("AI generation is request-only from the browser — never a direct model call or API key", async () => {
  const source = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(source, /requestCharacterCardGeneration/);
  assert.match(source, /requestStoryboardImageGeneration/);
  assert.match(source, /requestShotVideoGeneration/);
  assert.doesNotMatch(source, /images\/generations|images\/edits|KELLY_MV_IMAGE_API_KEY/);
  assert.doesNotMatch(source, /child_process|spawn\(/);
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
    "scripts/create_sample_project.ts",
    "scripts/execute_agent_tasks.ts",
    "scripts/export_story_bible.ts",
    "scripts/gen_draft_video.ts",
    "scripts/validate_shot_readiness.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("ships trusted generation/seed/validate/export scripts using busabase-sdk with --apply dry-run gating where they write", async () => {
  const pkg = await readJson(join(skillRoot, "package.json"));
  assert.equal(pkg.dependencies["busabase-sdk"], "0.11.0");
  const libSource = await readFile(join(skillRoot, "scripts", "lib", "mv-busabase.mjs"), "utf8");
  assert.match(libSource, /createBusabaseClient/);
  assert.match(libSource, /BUSABASE_BASE_URL/);
  for (const name of ["execute_generation_requests.mjs", "create_sample_project.mjs", "generate_song_draft.mjs"]) {
    const source = await readFile(join(skillRoot, "scripts", name), "utf8");
    assert.match(source, /--apply/, `${name} must gate writes behind --apply`);
  }
});

test("scripts/gen_song.py stays a documented Python stub, wrapped (not replaced) by a trusted .mjs helper for the Busabase write", async () => {
  const pyContent = await readFile(join(skillRoot, "scripts", "gen_song.py"), "utf8");
  assert.match(pyContent, /STUB/);
  const wrapper = await readFile(join(skillRoot, "scripts", "generate_song_draft.mjs"), "utf8");
  assert.match(wrapper, /gen_song\.py/);
  assert.match(wrapper, /uploadAssetFromFile/);
});

test("draft shot video generation is real local generation (LTX), not a stub — no cloud video API key", async () => {
  const source = await readFile(join(skillRoot, "scripts", "gen_draft_video.mjs"), "utf8");
  assert.match(source, /LTX/);
  assert.doesNotMatch(source, /seedance|runway|luma\.ai/i);
});

test("server.js proxies the real Busabase Drive/Asset REST surface (/api/storage/*) beyond the shared /api/v1/* template", async () => {
  const source = await readFile(join(appRoot, "server.js"), "utf8");
  assert.match(source, /api\/storage/);
  assert.match(source, /AIRAPP_ID = "kelly-mv"/);
});
