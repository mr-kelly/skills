import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
// Template layout: the AirApp is the package node under content/, not app/.
const skillRoot = join(repoRoot, "skills", "kelly-email");
const appRoot = join(skillRoot, "content", "kelly-email-app");
const browserRoot = join(appRoot, "app");
const requiredFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "server.js",
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
  assert.equal(pkg.dependencies["busabase-sdk"], "0.30.1");
});

// kelly-email is laid out as a busabase TEMPLATE, so the invariant this file
// used to check through `resource-map.json` is now carried by the package.
//
// That file recorded the node ids of whichever workspace last ran setup —
// runtime state, and exactly what a published template must not ship, since it
// would hand one person's workspace layout to everyone who installs. The
// package expresses the same "declaration and resources agree" guarantee
// instead: `busabase.json` names the app, and `content/` holds the resources it
// declares.
test("keeps the package manifest and runtime declarations aligned", async () => {
  const manifest = await readJson(join(skillRoot, "busabase.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(manifest.name, appConfig.appId);
  assert.equal(manifest.template.schemaVersion, appConfig.schemaVersion);
  assert.equal(manifest.template.airapp, appConfig.airApp.slug);
  // The AirApp addresses its own node by the slug the package ships it under —
  // install stamps it with exactly that, and a mismatch would make the app fail
  // to recognise its own AirApp after a Template Center install.
  assert.equal(appConfig.airApp.resourceKey, appConfig.airApp.slug);
});

test("ships a Base under content/ for every one the app declares", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  for (const base of appConfig.bases) {
    const declared = await readJson(join(skillRoot, "content", base.key, "base.json"));
    assert.equal(declared.name, base.name, base.key);
    assert.equal(declared.fields.length, base.fields.length, base.key);
  }
});

test("declares itself a template, and names only resources it ships", async () => {
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  // Explicit opt-in, never inferred: publishing a template means accepting that
  // installers run its code and hand this file to their agent.
  assert.match(skill, /^\s*template: true$/m);
  const resources = [...skill.matchAll(/^\s{6}- (\S+)$/gm)].map((match) => match[1]);
  assert.ok(resources.length > 0, "SKILL.md should list its resources");
  for (const key of resources) {
    await readFile(join(skillRoot, "content", key, "base.json"));
  }
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
  for (const name of ["local-file-provider.ts", "local-reply-store.ts", "launcher.ts", "start.sh"]) {
    const matches = await import("node:fs/promises").then(({ readdir }) =>
      readdir(skillRoot, { recursive: true }).then((files) => files.filter((file) => file.endsWith(name))),
    );
    assert.deepEqual(matches, [], `retired file remains: ${name}`);
  }
});
