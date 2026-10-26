import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hash = (value) => createHash("sha256").update(value).digest("hex");

export const registerContract = (skill, expectedBases) => {
  const root = path.join(repoRoot, "skills", skill);
  const appRoot = path.join(root, "content", `${skill}-app`);
  const read = (relative) => readFile(path.join(root, relative), "utf8");
  const json = async (relative) => JSON.parse(await read(relative));
  const config = async () => (await import(pathToFileURL(path.join(appRoot, "app/js/config.js")).href)).appConfig;

  test(`${skill}: package, manual and runtime declare the same installable app`, async () => {
    const [manifest, cfg, manual, folder] = await Promise.all([
      json("busabase.json"),
      config(),
      read("SKILL.md"),
      json("content/_folder.json"),
    ]);
    assert.equal(manifest.format, "busabase-package@1");
    assert.equal(manifest.name, skill);
    assert.equal(manifest.template.airapp, `${skill}-app`);
    assert.match(manual, new RegExp(`^name: ${skill}$`, "m"));
    assert.match(manual, /template: true/);
    assert.equal(cfg.appId, skill);
    assert.equal(cfg.schemaVersion, manifest.template.schemaVersion);
    assert.equal(cfg.folder.slug, skill);
    assert.equal(cfg.folder.name, folder.name);
    assert.equal(cfg.airApp.resourceKey, `${skill}-app`);
    assert.ok(!cfg.spaceId && !cfg.folder.nodeId);
    assert.deepEqual(new Set(cfg.bases.map((base) => base.key)), new Set(expectedBases));
  });

  test(`${skill}: installed field and ownership shapes match the canonical declaration`, async () => {
    const cfg = await config();
    const targets = new Map(cfg.bases.map((base) => [base.slug, base.key]));
    for (const base of cfg.bases) {
      const packaged = await json(`content/${base.key}/base.json`);
      assert.equal(packaged.fields[0].type, "text");
      assert.equal(packaged.fields[0].required, true);
      assert.equal(packaged.fields.length, base.fields.length, base.key);
      assert.ok(!base.nodeId && !base.baseId, "Distribution must not pin another customer's resource ids");
      assert.ok(base.readLimit >= 1 && base.readLimit <= 50);
      assert.ok(packaged.views.length >= 1);
      let relationSeen = false;
      for (const field of base.fields) {
        const actual = packaged.fields.find((entry) => entry.slug === field.slug);
        assert.ok(actual, `${base.key}.${field.slug}`);
        assert.equal(actual.type, field.type);
        assert.equal(actual.required, field.required);
        if (field.type === "relation") {
          relationSeen = true;
          assert.equal(actual.options.targetBaseSlug, targets.get(field.options.targetBaseSlug));
        } else assert.equal(relationSeen, false, "Installer materializes scalar fields before relations");
      }
      assert.ok(packaged.agentPrompts.length >= 2 && packaged.agentPrompts.length <= 5);
      assert.ok(packaged.agentPrompts.every((prompt) => String(prompt.body).includes(skill)));
    }
  });

  test(`${skill}: trusted publisher sends exactly the reviewed runtime tree`, async () => {
    const { appFiles } = await import(pathToFileURL(path.join(root, "lib/publish.mjs")).href);
    const files = await appFiles();
    const names = new Set(files.map((file) => file.path));
    for (const name of [
      "package.json",
      "server.js",
      "app/index.html",
      "app/js/config.js",
      "app/vendor/busabase-sdk.js",
      "app/vendor/busabase-airapp.js",
      "app/vendor/busabase-airapp-gate.js",
    ])
      assert.ok(names.has(name), name);
    for (const file of files) {
      assert.ok(!/(?:^|\/)(?:node_modules|test|scripts|\.env[^/]*|\.git)(?:\/|$)|\.log$/.test(file.path), file.path);
      assert.equal(hash(file.content), hash(await readFile(path.join(appRoot, file.path), "utf8")), file.path);
    }
    const appPackage = JSON.parse(files.find((file) => file.path === "package.json").content);
    const skillPackage = await json("package.json");
    assert.equal(appPackage.scripts.dev, "node server.js");
    assert.equal(appPackage.scripts.start, "node server.js");
    assert.equal(appPackage.dependencies["busabase-sdk"], "0.99.1");
    assert.equal(skillPackage.dependencies["busabase-sdk"], appPackage.dependencies["busabase-sdk"]);
    for (const relative of ["", `content/${skill}-app/`]) {
      assert.match(await read(`${relative}pnpm-workspace.yaml`), /busabase-sdk@0\.99\.1/);
      assert.match(await read(`${relative}pnpm-lock.yaml`), /busabase-sdk@0\.99\.1:/);
    }
  });

  test(`${skill}: gallery references resolve to actual hydrated image and video content`, async () => {
    const manifest = await json("busabase.json");
    assert.equal(manifest.template.screenshots[0], "assets/screenshots/cover.webp");
    const references = new Set(
      [
        ...manifest.template.screenshots,
        manifest.template.video,
        ...Object.values(manifest.template.locales || {}).flatMap((locale) => [
          ...(locale.screenshots || []),
          locale.video,
        ]),
      ].filter(Boolean),
    );
    for (const relative of references) {
      const bytes = await readFile(path.join(root, relative));
      assert.ok(bytes.length > 1000, relative);
      assert.ok(!bytes.subarray(0, 70).toString().includes("git-lfs.github.com/spec"), `${relative}: hydrate LFS`);
      if (relative.endsWith(".webp")) assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
      if (relative.endsWith(".mp4")) assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
    }
    assert.ok((await readdir(path.join(root, "content"))).includes(`${skill}-app`));
  });
};
