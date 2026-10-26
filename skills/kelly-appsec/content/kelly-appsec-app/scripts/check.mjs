import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkAirApp } from "busabase-sdk/airapp-check";
import { appConfig } from "../app/js/config.js";
import { editorialAssertions } from "./check-editorial.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const walk = async (directory, prefix = "") => {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "vendor") continue;
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) output.push(...(await walk(path.join(directory, entry.name), `${name}/`)));
    else output.push({ path: name, content: await readFile(path.join(directory, entry.name), "utf8") });
  }
  return output;
};
const sources = await walk(path.join(root, "app"), "app/");
const js = sources.filter((file) => file.path.endsWith(".js"));
const logic = js
  .filter((file) => !/demo-provider|messages|style-picker/.test(file.path))
  .map((file) => file.content)
  .join("\n");
const html = await read("app/index.html");
const findings = checkAirApp({
  packageJson: await read("package.json"),
  server: await read("server.js"),
  browserLogic: logic,
  browserDownloads: sources.map((file) => file.content).join("\n"),
  config: await read("app/js/config.js"),
  shippedSlug: "kelly-appsec-app",
  appSources: sources,
});
for (const finding of findings) console.log(`${finding.severity}: ${finding.rule}: ${finding.message}`);
assert.equal(findings.filter((finding) => finding.severity === "error").length, 0, "SDK AirApp contract errors");
for (const rule of editorialAssertions(
  await read("app/styles/editorial.css"),
  `${await read("app/styles.css")}\n${await read("app/styles/style-picker.css")}`,
  html,
))
  assert.ok(rule.ok, rule.message);
assert.equal(appConfig.binding, "runtime");
assert.equal(appConfig.bases.length, 7);
assert.ok(appConfig.bases.every((base) => base.views.some((view) => view.type === "table")));
for (const base of appConfig.bases) {
  assert.ok(base.readLimit > 0 && base.readLimit <= 50);
  assert.ok(!("baseId" in base) && !("nodeId" in base), "A distributable must not pin deployment ids");
  assert.ok(base.agentPrompts.length >= 2);
}
for (const file of js) execFileSync(process.execPath, ["--check", path.join(root, file.path)]);
execFileSync(process.execPath, ["--check", path.join(root, "server.js")]);
for (const file of ["busabase-sdk.js", "busabase-airapp.js", "busabase-airapp-gate.js", "busabase-airapp-gate.css"])
  assert.ok((await read(`app/vendor/${file}`)).length > 0);
console.log(
  `Kelly AppSec app: SDK contract, editorial tokens, runtime resources and ${js.length} browser modules passed.`,
);
