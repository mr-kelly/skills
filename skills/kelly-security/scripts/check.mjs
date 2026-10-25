import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "../content/kelly-security-app/app/js/config.js";
import { CHECKS, buildRecipe } from "../lib/catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blueprint = JSON.parse(await readFile(path.join(root, "blueprint.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(root, "busabase.json"), "utf8"));
assert.equal(manifest.name, appConfig.appId);
assert.equal(blueprint.distribution.approval_state, "approved");
assert.deepEqual(
  appConfig.checks,
  CHECKS.map(({ id, name, kind }) => ({ id, name, kind })),
);
assert.equal(appConfig.onboarding.version, 1);
assert.ok(appConfig.onboarding.required_fields.length > 0);
for (const check of CHECKS) {
  const script = buildRecipe(check.id, { start: "2026-10-19T00:00:00Z", end: "2026-10-26T00:00:00Z" });
  execFileSync("/bin/sh", ["-n"], { input: script });
}
for (const file of [
  "references/investigation.md",
  "references/resource-map.md",
  "references/upstream.md",
  "references/upstream-sources.json",
  "LICENSES/Apache-2.0.txt",
  "SKILL.md",
])
  assert.ok((await readFile(path.join(root, file), "utf8")).length > 0);
execFileSync(process.execPath, ["scripts/sync-content.mjs", "--check"], { cwd: root, stdio: "inherit" });
console.log("Kelly Security package: approved scope, twelve shell recipes, resource drift and references passed.");
