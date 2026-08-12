import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-drama");
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
  "app/js/drama-model.js",
  "app/js/drama-client.js",
  "app/js/busabase-client.js",
  "app/js/state.js",
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
  assert.equal(pkg.dependencies["busabase-sdk"], "0.15.0");
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
  assert.deepEqual(appConfig.bases.map((b) => b.key).sort(), [
    "characters",
    "episodes",
    "project",
    "relationships",
    "settings",
    "shots",
    "tasks",
  ]);
  for (const base of appConfig.bases) {
    assert.ok(base.readLimit <= 100, `${base.key} readLimit ${base.readLimit} exceeds 100`);
  }
});

test("does not persist secrets or a second data provider in browser storage", async () => {
  const sources = await Promise.all(
    [
      "app.js",
      "js/busabase-client.js",
      "js/drama-client.js",
      "js/providers/busabase-provider.js",
      "js/resource-provisioning.js",
      "js/connect-gate.js",
    ].map((path) => readFile(join(browserRoot, path), "utf8")),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /localStorage\.setItem\("busabase|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer/i);
  assert.doesNotMatch(source, /KELLY_DRAMA_DATA_PROVIDER|local-file-provider|config\.local\.json/);
  assert.match(source, /createBusabaseClient/);
});

test("binary media (reference cards/voices/shot images/video) go through busabase-sdk's real assets client, not raw fetch", async () => {
  const source = await readFile(join(browserRoot, "js", "drama-client.js"), "utf8");
  assert.match(source, /client\.assets\.createUploadUrl/);
  assert.match(source, /client\.assets\.confirm/);
  assert.match(source, /client\.assets\.get/);
  assert.doesNotMatch(source, /fetch\(["'`]\/api\/v1\/assets/);
});

test("has a live write surface: series/character/relationship/episode/shot edits go through records.changeRequest", async () => {
  const source = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(source, /records\.changeRequest|bases\.createChangeRequest/);
  for (const method of [
    "saveSeries",
    "saveItem",
    "deleteItem",
    "setShotActive",
    "setCharacterVoiceActive",
    "saveImageConfig",
  ]) {
    assert.match(source, new RegExp(`async ${method}\\(`), `busabase-provider must implement ${method}`);
  }
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.readOnly, false);
  assert.ok(appConfig.permissions.writeProcedures.includes("records.changeRequest"));
});

test("AI generation is request-only from the browser — never a direct model call, API key, or subprocess", async () => {
  const source = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(source, /requestCharacterCardGeneration/);
  assert.match(source, /requestCharacterVoiceGeneration/);
  assert.match(source, /requestStoryboardImageGeneration/);
  assert.match(source, /requestShotVideoGeneration/);
  assert.doesNotMatch(source, /images\/generations|images\/edits|KELLY_DRAMA_IMAGE_API_KEY|KELLY_DRAMA_ARK_API_KEY/);
  assert.doesNotMatch(source, /child_process|spawn\(/);
});

test("HyperFrame status is a cached read from the project record — the browser never touches the local filesystem", async () => {
  const providerSource = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.doesNotMatch(providerSource, /node:fs|readFile|readdir/);
  const overviewSource = await readFile(join(browserRoot, "js", "overview.js"), "utf8");
  assert.match(overviewSource, /hyperframe_status/);
  assert.doesNotMatch(overviewSource, /fetch\(/);
});

test("retires the pre-Busabase local-file/legacy-busabase provider layer", async () => {
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

test("ships trusted generation/hyperframe/seed/validate/export scripts using busabase-sdk with --apply dry-run gating where they write", async () => {
  const pkg = await readJson(join(skillRoot, "package.json"));
  assert.equal(pkg.dependencies["busabase-sdk"], "0.11.0");
  const libSource = await readFile(join(skillRoot, "scripts", "lib", "drama-busabase.mjs"), "utf8");
  assert.match(libSource, /createBusabaseClient/);
  assert.match(libSource, /BUSABASE_BASE_URL/);
  for (const name of ["execute_generation_requests.mjs", "read_hyperframe_status.mjs", "create_sample_project.mjs"]) {
    const source = await readFile(join(skillRoot, "scripts", name), "utf8");
    assert.match(source, /--apply/, `${name} must gate writes behind --apply`);
  }
});

test("scripts/gen_voice.py stays real Python (Qwen3-TTS/mlx-audio), wrapped (not replaced) by the trusted generation dispatcher for the Busabase write", async () => {
  const pyContent = await readFile(join(skillRoot, "scripts", "gen_voice.py"), "utf8");
  assert.match(pyContent, /mlx_audio/);
  const dispatcher = await readFile(join(skillRoot, "scripts", "execute_generation_requests.mjs"), "utf8");
  assert.match(dispatcher, /gen_voice\.py/);
  assert.match(dispatcher, /uploadAssetFromFile/);
});

test("draft shot video generation is real local generation (LTX), prod is real cloud generation (Seedance/Ark) — neither is a stub", async () => {
  const source = await readFile(join(skillRoot, "scripts", "gen_draft_video.mjs"), "utf8");
  assert.match(source, /LTX/);
  const dispatcher = await readFile(join(skillRoot, "scripts", "execute_generation_requests.mjs"), "utf8");
  assert.match(dispatcher, /seedance|ark/i);
  assert.match(dispatcher, /KELLY_DRAMA_ARK_API_KEY/);
});

test("server.js proxies the real Busabase Drive/Asset REST surface (/api/storage/*) beyond the shared /api/v1/* template", async () => {
  const source = await readFile(join(appRoot, "server.js"), "utf8");
  assert.match(source, /api\/storage/);
  assert.match(source, /AIRAPP_ID = "kelly-drama"/);
});
