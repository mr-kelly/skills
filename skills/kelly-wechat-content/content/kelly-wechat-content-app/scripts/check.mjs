import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { appConfig } from "../app/js/config.js";
import { editorialAssertions } from "./check-editorial.mjs";
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk("app/js");
for (const path of ["server.js", ...files.filter((file) => file.endsWith(".js"))]) {
  assert.equal(spawnSync(process.execPath, ["--check", path]).status, 0, `Syntax error in ${path}`);
  const text = await readFile(path, "utf8");
  assert(!text.includes("location.hostname"), `Hostname runtime detection in ${path}`);
}
const html = await readFile("app/index.html", "utf8");
const themeSource = await readFile("app/styles/editorial.css", "utf8");
const otherCss = await readFile("app/styles.css", "utf8");
for (const finding of editorialAssertions(themeSource, otherCss, html)) assert(finding.ok, finding.message);
assert(!/(?:src|href)=["']\//.test(html), "Assets must use relative paths");
const server = await readFile("server.js", "utf8");
assert(server.includes("describeBusabaseAirAppRuntime"));
assert(server.includes("createBusabaseAirAppLocalGateway"));
assert.equal(appConfig.bases.length, 2);
assert.deepEqual(appConfig.permissions.writeProcedures, []);
for (const base of appConfig.bases) assert(base.readLimit > 0 && base.readLimit <= 50);
const fixture = JSON.parse(await readFile("app/demo-data.json", "utf8"));
for (const key of ["sources", "articles"]) {
  assert(fixture[key].length > 0, `${key} needs demo records`);
  assert(fixture[key].length <= 50);
  try {
    const seeds = (await readFile(`../${key}/records.ndjson`, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(fixture[key], seeds, "Demo data drift: run pnpm sync:demo");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
console.log("AirApp checks passed: runtime, bounded reads, readonly permissions, syntax and deterministic seeds.");
