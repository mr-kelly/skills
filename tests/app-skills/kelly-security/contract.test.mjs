import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { appConfig } from "../../../skills/kelly-security/content/kelly-security-app/app/js/config.js";
import { appFiles, appRoot } from "../../../skills/kelly-security/lib/publish.mjs";

const root = fileURLToPath(new URL("../../../skills/kelly-security/", import.meta.url));
const json = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const digest = (content) => createHash("sha256").update(content).digest("hex");

test("the SSH lab Docker build context includes every declared COPY input", async () => {
  const context = path.resolve(fileURLToPath(new URL("./fixtures/ssh-lab/", import.meta.url)));
  const dockerfile = await readFile(path.join(context, "Dockerfile"), "utf8");
  const copies = [...dockerfile.matchAll(/^COPY\s+(.+)$/gm)];
  assert.ok(copies.length > 0, "The lab must declare its runtime fixture inputs");
  for (const [, argumentsText] of copies) {
    const inputs = argumentsText.trim().split(/\s+/).slice(0, -1);
    for (const input of inputs) {
      const source = path.resolve(context, input);
      assert.ok(source.startsWith(`${context}${path.sep}`), `COPY input escapes the lab context: ${input}`);
      const details = await stat(source).catch(() => null);
      assert.ok(details?.isFile() && details.size > 0, `Missing SSH lab Docker COPY input: ${input}`);
    }
  }
});

test("the installable package and runtime declaration identify the same isolated app", async () => {
  const [manifest, blueprint, folder] = await Promise.all([
    json("busabase.json"),
    json("blueprint.json"),
    json("content/_folder.json"),
  ]);
  assert.equal(manifest.format, "busabase-package@1");
  assert.equal(manifest.name, appConfig.appId);
  assert.equal(manifest.template.airapp, "kelly-security-app");
  assert.equal(manifest.template.schemaVersion, appConfig.schemaVersion);
  assert.equal(folder.name, appConfig.folder.name);
  assert.equal(blueprint.distribution.approval_state, "approved");
  assert.equal(appConfig.binding, "runtime");
  assert.equal(appConfig.spaceId, undefined);
  assert.equal(appConfig.folder.nodeId, undefined);
  assert.ok(appConfig.bases.every((base) => !base.nodeId && !base.baseId));
  assert.deepEqual(
    new Set(appConfig.bases.map((base) => base.key)),
    new Set(["hosts", "runs", "checks", "evidence", "findings", "settings"]),
  );
  assert.ok(folder.agentPrompts.length >= 2);
});

test("installer sidecars retain the app's typed fields, relation targets and node prompts", async () => {
  const bySlug = new Map(appConfig.bases.map((base) => [base.slug, base.key]));
  for (const base of appConfig.bases) {
    const packaged = await json(`content/${base.key}/base.json`);
    assert.equal(packaged.name, base.name);
    assert.equal(packaged.fields[0].slug, "title");
    assert.equal(packaged.fields[0].required, true);
    assert.equal(packaged.fields.length, base.fields.length, base.key);
    for (const field of base.fields) {
      const actual = packaged.fields.find((entry) => entry.slug === field.slug);
      assert.ok(actual, `${base.key}.${field.slug} is missing from installation`);
      assert.equal(actual.type, field.type);
      assert.equal(actual.required, field.required);
      if (field.type === "relation") {
        assert.equal(actual.options.targetBaseSlug, bySlug.get(field.options.targetBaseSlug));
      }
    }
    assert.ok(packaged.agentPrompts.length >= 2 && packaged.agentPrompts.length <= 5, base.key);
    assert.ok(
      packaged.agentPrompts.every((prompt) => prompt.body.includes("kelly-security")),
      base.key,
    );
    assert.ok(Number.isInteger(base.readLimit) && base.readLimit > 0 && base.readLimit <= 50, base.key);
  }
});

test("relationship ownership and scalar query references travel together", () => {
  for (const [key, relation, scalar] of [
    ["checks", "run", "run-reference"],
    ["findings", "run", "run-reference"],
    ["evidence", "check", "check-reference"],
  ]) {
    const base = appConfig.bases.find((entry) => entry.key === key);
    assert.equal(base.fields.find((field) => field.slug === relation)?.type, "relation");
    assert.equal(base.fields.find((field) => field.slug === scalar)?.type, "text");
  }
});

test("installation seeds inert hosts and incomplete onboarding, not executable investigation requests", async () => {
  const parseRows = async (relative) => {
    const content = await readFile(path.join(root, relative), "utf8").catch(() => "");
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  };
  const hosts = await parseRows("content/hosts/records.ndjson");
  assert.ok(hosts.length >= 3 && hosts.length <= 50);
  assert.ok(hosts.every((row) => row.fields["is-example"] === true));
  assert.equal(new Set(hosts.map((row) => row.key)).size, hosts.length);
  assert.equal((await parseRows("content/runs/records.ndjson")).length, 0);
  const settings = await parseRows("content/settings/records.ndjson");
  assert.equal(settings.length, 1);
  assert.equal(settings[0].fields["onboarding-state"], "incomplete");
});

test("publication uses the reviewed canonical source and excludes developer/credential material", async () => {
  const files = await appFiles();
  const paths = new Set(files.map((file) => file.path));
  for (const required of [
    "package.json",
    "server.js",
    "app/index.html",
    "app/js/app.js",
    "app/js/config.js",
    "app/js/runtime.js",
    "app/vendor/busabase-sdk.js",
    "app/vendor/busabase-airapp.js",
    "app/vendor/busabase-airapp-gate.js",
  ])
    assert.ok(paths.has(required), required);
  assert.ok(files.length > 15);
  for (const file of files) {
    assert.ok(!/(?:^|\/)(?:node_modules|test|scripts|\.env[^/]*|\.git)(?:\/|$)|\.log$/.test(file.path), file.path);
    assert.equal(digest(file.content), digest(await readFile(path.join(appRoot, file.path), "utf8")), file.path);
  }
  const packageJson = JSON.parse(files.find((file) => file.path === "package.json").content);
  assert.equal(packageJson.scripts.dev, "node server.js");
  assert.equal(packageJson.scripts.start, "node server.js");
  assert.match(packageJson.dependencies["busabase-sdk"], /^\d+\.\d+\.\d+$/);
  assert.equal(packageJson.dependencies["busabase-sdk"], (await json("package.json")).dependencies["busabase-sdk"]);
  assert.ok(
    (await readFile(path.join(appRoot, "pnpm-lock.yaml"), "utf8")).includes(packageJson.dependencies["busabase-sdk"]),
  );
});

test("the recorded upstream sources and shipped media resolve to real package files", async () => {
  const manifest = await json("busabase.json");
  const sources = await json("references/upstream-sources.json");
  assert.equal(sources.length, 6);
  assert.ok(sources.every((source) => /^[a-f0-9]{40}$/.test(source.commit) && /^[a-f0-9]{64}$/.test(source.sha256)));
  assert.ok((await readFile(path.join(root, "LICENSES/Apache-2.0.txt"), "utf8")).includes("Apache License"));
  for (const relative of manifest.template.screenshots || []) {
    const bytes = await readFile(path.join(root, relative));
    assert.ok(bytes.length > 1000, relative);
  }
  const resources = await readdir(path.join(root, "content"));
  assert.ok(resources.includes(manifest.template.airapp));
});
