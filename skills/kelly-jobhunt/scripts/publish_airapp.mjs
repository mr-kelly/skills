#!/usr/bin/env node
// Push this skill's current local content/kelly-jobhunt-app/ code to its deployed AirApp: creates it
// if this Space has never had one, or proposes an update if it does. Always a
// pending, always-review-first ChangeRequest — merge it in Busabase before the
// change takes effect. Use this after editing content/kelly-jobhunt-app/ files; scripts/setup.mjs
// only ever creates the AirApp once and does not re-push edits.
//
// Usage: node scripts/publish_airapp.mjs

import { publishAirApp } from "busabase-sdk/airapp";
import { appConfig, createTrustedClient, fail, readAirAppFiles } from "./lib.mjs";

const client = createTrustedClient();
const files = await readAirAppFiles();

let result;
try {
  result = await publishAirApp(client, appConfig, files);
} catch (error) {
  fail(`发布 AirApp 失败：${error instanceof Error ? error.message : error}`);
}

console.log(`AirApp ${result.status === "created" ? "创建" : "更新"}请求已提交：${result.changeRequestId}（待审核）`);
console.log("请在 Busabase 里审核并合并这个 ChangeRequest 后，改动才会生效。");
