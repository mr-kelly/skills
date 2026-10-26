import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "../content/kelly-appsec-app/app/js/config.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const blueprint = JSON.parse(await read("blueprint.json"));
const manifest = JSON.parse(await read("busabase.json"));
assert.equal(manifest.name, appConfig.appId);
assert.equal(blueprint.distribution.scope_approved, true);
assert.deepEqual(
  appConfig.bases.map((base) => base.key),
  ["projects", "endpoints", "rules", "runs", "checks", "findings", "evidence"],
);
for (const file of [
  "references/audit.md",
  "references/resource-map.md",
  "references/upstream.md",
  "references/upstream-sources.json",
  "references/skill-prompts.json",
  "LICENSES/Apache-2.0.txt",
  "SKILL.md",
  "content/operating-guide.md",
])
  assert.ok((await read(file)).length > 0);
const seeds = (await read("content/projects/records.ndjson"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
assert.equal(seeds.length, 3);
assert.ok(
  seeds.every((row) => row.key && row.fields["is-example"] === true && row.fields["onboarding-state"] === "incomplete"),
);
execFileSync(process.execPath, ["scripts/sync-content.mjs", "--check"], { cwd: root, stdio: "inherit" });
console.log(
  "Kelly AppSec: approved seven-resource package, inert seed records, audit manual and source attribution passed.",
);
