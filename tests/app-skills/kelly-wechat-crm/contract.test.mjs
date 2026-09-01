import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-wechat-crm");
const appRoot = join(skillRoot, "content", "kelly-wechat-crm-app");
const browserRoot = join(appRoot, "app");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

test("ships the canonical installable Node AirApp project", async () => {
  const required = [
    "busabase.json",
    "content/_folder.json",
    "content/people/base.json",
    "content/relationship-snapshots/base.json",
    "content/goals/base.json",
    "content/actions/base.json",
    "content/worklog/base.json",
    "content/settings/base.json",
    "content/kelly-wechat-crm-app/_node.json",
    "content/kelly-wechat-crm-app/.busabaseignore",
    "content/kelly-wechat-crm-app/package.json",
    "content/kelly-wechat-crm-app/server.js",
    "content/kelly-wechat-crm-app/wechat-status.mjs",
  ];
  await Promise.all(required.map((file) => readFile(join(skillRoot, file))));
  await assert.rejects(readFile(join(appRoot, "server.py")));
  await assert.rejects(readFile(join(appRoot, "airapp.json.template")));
  const pkg = await readJson(join(appRoot, "package.json"));
  assert.equal(pkg.engines.node, ">=24.18.0");
  assert.equal(pkg.scripts.dev, "node server.js");
  assert.equal(pkg.scripts.start, "node server.js");
  assert.equal(pkg.dependencies["busabase-sdk"], "0.30.1");
});

test("aligns manifest, skill resources, config, and generated content", async () => {
  const manifest = await readJson(join(skillRoot, "busabase.json"));
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(manifest.name, appConfig.appId);
  assert.equal(manifest.template.schemaVersion, appConfig.schemaVersion);
  assert.equal(manifest.template.airapp, appConfig.airApp.slug);
  assert.match(skill, /^\s*template: true$/m);
  const resources = [...skill.matchAll(/^\s{6}- (\S+)$/gm)].map((match) => match[1]);
  assert.deepEqual(
    resources,
    appConfig.bases.map((base) => base.key),
  );
  for (const base of appConfig.bases) {
    assert.equal(base.slug, `${appConfig.appId}-${base.key}`);
    assert.equal("nodeId" in base, false);
    assert.equal("baseId" in base, false);
    const packaged = await readJson(join(skillRoot, "content", base.key, "base.json"));
    assert.equal(packaged.name, base.name);
    assert.deepEqual(
      packaged.fields.map((field) => field.slug),
      base.fields.map((field) => field.slug),
    );
  }
});

test("keeps credentials out while limiting auto-merge to explicit app writes", async () => {
  const files = [
    "js/app.js",
    "js/config.js",
    "js/busabase-client.js",
    "js/providers/busabase-provider.js",
    "js/providers/demo-provider.js",
  ];
  const source = [
    ...(await Promise.all(files.map((file) => readFile(join(browserRoot, file), "utf8")))),
    await readFile(join(appRoot, "server.js"), "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization\s*:\s*[`'"]Bearer|__busabase_api__/i);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.match(source, /createBusabaseClient/);
  assert.match(source, /window\.location\.origin/);
  assert.match(source, /autoMerge:\s*true/);
  assert.doesNotMatch(source, /changeRequests\.(?:review|merge)/);
  assert.doesNotMatch(source, /await gate\.status\(\)/);
  assert.match(source, /state\.runtime\.hosted[\s\S]*local_companion_required/);
  assert.match(source, /updateWithConfirmation/);
  assert.match(source, /requestTimeoutMs:\s*30_000/);
  assert.match(source, /fetch\("__wechat\/status"/);
});

test("declares versioned onboarding in a real Busabase resource", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.onboarding.version, 4);
  assert.equal(appConfig.onboarding.completionResource, "settings");
  assert.deepEqual(appConfig.onboarding.requiredFields, []);
  assert.ok(appConfig.onboarding.rationale.length > 0);
  assert.ok(appConfig.bases.some((base) => base.key === appConfig.onboarding.completionResource));
});
