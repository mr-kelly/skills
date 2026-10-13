#!/usr/bin/env node
// Push this skill's local content/kelly-dog-walk-app/ to the 遛狗日历 AirApp in the installed folder:
// creates it if the folder has none, or proposes a file update if it does. Executable code always
// goes through review — merge the ChangeRequest in Busabase before the change takes effect.
// A fresh template install already carries the AirApp; use this only after editing the app.
//
// Usage: node scripts/publish_airapp.mjs
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL, BUSABASE_API_KEY,
// BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishAirApp } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-dog-walk-app/app/js/config.js";
import { connect } from "./lib/busabase.mjs";
import { run } from "./lib/cli.mjs";

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content", appConfig.airApp.slug);

// Mirrors content/kelly-dog-walk-app/.busabaseignore: what the running AirApp does not need.
const SKIP_NAMES = new Set([
  "node_modules",
  ".git",
  ".DS_Store",
  "coverage",
  "test",
  "test-results",
  "playwright-report",
]);
const SKIP_FILES = new Set([
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "scripts/check.mjs",
  "scripts/check-editorial.mjs",
  "_node.json",
  ".busabaseignore",
]);

const readAirAppFiles = async (dir = appRoot, prefix = "") => {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_NAMES.has(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (SKIP_FILES.has(rel)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await readAirAppFiles(abs, rel)));
    else files.push({ path: rel, content: await readFile(abs, "utf8") });
  }
  return files;
};

run(async () => {
  const result = await publishAirApp(connect(), appConfig, await readAirAppFiles());
  // `=== true`, not truthiness: this repo typechecks non-strict, where only the comparison narrows
  // the result union to the members that carry `changeRequestId`.
  if (result.merged === true) console.log(`遛狗日历已${result.status === "created" ? "创建" : "更新"}并生效。`);
  else {
    console.log(
      `遛狗日历${result.status === "created" ? "创建" : "更新"}请求已提交：${result.changeRequestId}（待审核）`,
    );
    console.log("请在 Busabase 里审核并合并这个变更请求后，改动才会生效。");
  }
});
