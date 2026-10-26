#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "../content/kelly-compliance-app/app/js/config.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
assert.equal(appConfig.bases.length, 8);
assert.equal(appConfig.binding, "runtime");
assert.equal(appConfig.airApp.resourceKey, "kelly-compliance-app");
const manifest = await json("busabase.json");
assert.equal(manifest.name, "kelly-compliance");
assert.equal(manifest.template.airapp, "kelly-compliance-app");
for (const base of appConfig.bases) {
  assert.ok(base.agentPrompts.length >= 2);
  let relations = false;
  for (const f of base.fields) {
    if (f.type === "relation") {
      relations = true;
      assert.ok(appConfig.bases.some((b) => b.slug === f.options.targetBaseSlug));
    } else assert.ok(!relations, "Scalar fields must precede relation fields");
  }
  assert.deepEqual(
    (await json(`content/${base.key}/base.json`)).fields.map((f) => f.slug),
    base.fields.map((f) => f.slug),
  );
}
for (const file of [
  "content/_folder.json",
  "content/kelly-compliance-files/_node.json",
  "content/kelly-compliance-app/_node.json",
]) {
  const data = await json(file);
  assert.ok(data.agentPrompts.length >= 2);
  assert.ok(!JSON.stringify(data.agentPrompts).includes("入侵"));
}
assert.ok((await json("references/skill-prompts.json")).length >= 3);
for (const file of ["package.json", "content/kelly-compliance-app/package.json"])
  assert.equal((await json(file)).dependencies["busabase-sdk"], "0.99.1");
execFileSync(process.execPath, ["scripts/sync-content.mjs", "--check"], { cwd: root, stdio: "inherit" });
console.log(
  "Kelly Compliance: typed resource graph, relation ordering, scenario prompts and synchronized canonical package passed.",
);
