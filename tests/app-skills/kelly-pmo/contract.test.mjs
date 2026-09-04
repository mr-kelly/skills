import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-pmo");
const appRoot = join(skillRoot, "content", "kelly-pmo-app");
const browserRoot = join(appRoot, "app");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("ships the canonical AirApp project", async () => {
  for (const path of [
    "package.json",
    "pnpm-lock.yaml",
    "server.js",
    "_node.json",
    ".busabaseignore",
    "scripts/check.mjs",
    "app/index.html",
    "app/app.js",
    "app/js/runtime.js",
    "app/js/config.js",
    "app/js/pmo-model.js",
    "app/js/providers/busabase-provider.js",
    "app/js/providers/demo-provider.js",
  ])
    await readFile(join(appRoot, path));
  const pkg = await readJson(join(appRoot, "package.json"));
  assert.equal(pkg.engines.node, ">=24.18.0");
  assert.equal(pkg.scripts.dev, "node server.js");
  assert.equal(pkg.scripts.start, "node server.js");
  assert.equal(pkg.dependencies["busabase-sdk"], "0.30.1");
});

test("keeps manifest, taxonomy, app declaration, and sidecars aligned", async () => {
  const manifest = await readJson(join(skillRoot, "busabase.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  assert.equal(manifest.name, appConfig.appId);
  assert.equal(manifest.template.category, "comms");
  assert.deepEqual(manifest.template.tags, ["comms", "risk:local-write", "surface:busabase"]);
  assert.match(skill, /category: comms/);
  assert.match(skill, /risk:local-write/);
  assert.equal(appConfig.bases.length, 16);
  for (const base of appConfig.bases) {
    assert.equal(base.slug, `kelly-pmo-${base.key}`);
    assert.ok(base.readLimit <= 100);
    const sidecar = await readJson(join(skillRoot, "content", base.key, "base.json"));
    assert.equal(sidecar.name, base.name);
    assert.deepEqual(
      sidecar.fields.map(({ slug, name, type, required, options }) => ({
        slug,
        name,
        type,
        required,
        ...(Object.keys(options || {}).length ? { options } : {}),
      })),
      base.fields,
    );
    assert.deepEqual(
      sidecar.views.map((view) => view.type),
      (base.views || []).filter((view) => view.type === "table").map((view) => view.type),
      `${base.key} package sidecar must stay within busabase-package@1's table-view limit`,
    );
  }
  const nativeViews = await readJson(join(skillRoot, "references", "native-views.json"));
  assert.equal(nativeViews.schemaVersion, 2);
  assert.equal(nativeViews.bases.length, 16);
  const projects = nativeViews.bases.find((base) => base.key === "projects");
  assert.deepEqual([...new Set(projects.views.map((view) => view.type))].sort(), [
    "calendar",
    "gallery",
    "gantt",
    "kanban",
    "table",
  ]);
  assert.equal(appConfig.supportNodes.length, 8);
  assert.deepEqual([...new Set(appConfig.supportNodes.map((node) => node.type))].sort(), [
    "doc",
    "drive",
    "file",
    "form",
    "html",
    "skill",
    "whiteboard",
    "workflow",
  ]);
  await Promise.all([
    readFile(join(skillRoot, "content", "kelly-pmo-playbook.md")),
    readFile(join(skillRoot, "content", "kelly-pmo-files", "_node.json")),
    readFile(join(skillRoot, "content", "kelly-pmo-operator", "_node.json")),
    readFile(join(skillRoot, "content", "pmo-import-schema.csv")),
    readFile(join(skillRoot, "scripts", "sync-native-views.mjs")),
    readFile(join(skillRoot, "scripts", "sync-support-nodes.mjs")),
  ]);
});

test("declares a versioned onboarding contract owned by Settings", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(appConfig.onboarding.version, 2);
  assert.equal(appConfig.onboarding.completionResource, "settings");
  assert.deepEqual(appConfig.onboarding.requiredFields, [
    "portfolio-name",
    "timezone",
    "reporting-weekday",
    "decision-policy",
    "resource-capacity-policy",
    "status-freshness-days",
  ]);
  const settings = appConfig.bases.find((base) => base.key === "settings");
  for (const slug of [
    ...appConfig.onboarding.requiredFields,
    "onboarding-version",
    "onboarding-status",
    "completed-at",
  ])
    assert.ok(
      settings.fields.some((field) => field.slug === slug),
      slug,
    );
  assert.ok(appConfig.permissions.setupProcedures.includes("views.changeRequest"));
});

test("uses one Busabase boundary and keeps credentials out of browser code", async () => {
  const sources = await Promise.all(
    ["app.js", "js/busabase-client.js", "js/providers/busabase-provider.js", "js/connect-gate.js"].map((path) =>
      readFile(join(browserRoot, path), "utf8"),
    ),
  );
  const source = sources.join("\n");
  assert.match(source, /createBusabaseClient/);
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer|vault\.list|local-file-provider/i);
  assert.doesNotMatch(
    source,
    /sessionStorage|indexedDB|localStorage\.setItem\(["'](?:projects|milestones|risks|reports|decisions)/,
  );
});

test("writes only reviewed Busabase records and has no external side-effect path", async () => {
  const provider = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(provider, /records\.changeRequest/);
  assert.match(provider, /bases\.createChangeRequest/);
  assert.match(provider, /async saveDecision/);
  assert.match(provider, /baseCommitId/);
  assert.doesNotMatch(provider, /fetch\(["']https?:|sendMessage|calendar|webhook|smtp|payment/i);
});

test("runtime is host-injected and never inferred from URL or iframe nesting", async () => {
  const runtime = await readFile(join(browserRoot, "js", "runtime.js"), "utf8");
  const server = await readFile(join(appRoot, "server.js"), "utf8");
  assert.match(server, /BUSABASE_AIRAPP_RUNTIME/);
  assert.match(server, /\/__airapp\/runtime/);
  assert.match(runtime, /fetch\("__airapp\/runtime"/);
  assert.doesNotMatch(runtime, /location\.hostname|window\.self|window\.top/);
});

test("demo provider is deterministic and read-only at the data boundary", async () => {
  const demo = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.match(demo, /2026-09-04T09:00:00\.000Z/);
  assert.match(demo, /Demo mode is read-only/);
  assert.doesNotMatch(demo, /records\.changeRequest|bases\.createChangeRequest/);
});
