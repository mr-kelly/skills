import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-email", "app");
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
  assert.equal(pkg.dependencies["busabase-sdk"], "0.17.2");
});

test("keeps resource-map and runtime declarations aligned", async () => {
  const resourceMap = await readJson(join(appRoot, "resource-map.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(resourceMap.appId, appConfig.appId);
  assert.equal(resourceMap.schemaVersion, appConfig.schemaVersion);
  assert.equal(resourceMap.folder.slug, appConfig.folder.slug);
  assert.deepEqual(Object.keys(resourceMap.bases).sort(), appConfig.bases.map((base) => base.key).sort());
  for (const base of appConfig.bases) {
    assert.equal(resourceMap.bases[base.key].slug, base.slug, base.key);
  }
  assert.equal(resourceMap.drive.slug, appConfig.drive.slug);
});

test("does not persist secrets or a second data provider in browser storage", async () => {
  const sources = await Promise.all(
    ["app.js", "js/config.js", "js/provider.js", "js/api.js", "js/setup.js"].map((path) =>
      readFile(join(browserRoot, path), "utf8"),
    ),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /localStorage\.setItem\("busabase|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer/i);
  assert.doesNotMatch(source, /KELLY_EMAIL_DATA_PROVIDER|local-file-provider|folders\.get/);
});

test("retires the pre-Busabase local runtime layer", async () => {
  const skillRoot = join(repoRoot, "skills", "kelly-email");
  for (const name of ["local-file-provider.ts", "local-reply-store.ts", "launcher.ts", "start.sh"]) {
    const matches = await import("node:fs/promises").then(({ readdir }) =>
      readdir(skillRoot, { recursive: true }).then((files) => files.filter((file) => file.endsWith(name))),
    );
    assert.deepEqual(matches, [], `retired file remains: ${name}`);
  }
});
