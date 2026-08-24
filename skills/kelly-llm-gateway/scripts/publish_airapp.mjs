#!/usr/bin/env node
// Push this skill's current local content/kelly-llm-gateway-app/ code to its deployed AirApp: creates it
// if this Space has never had one, or proposes an update if it does. Always a
// pending, always-review-first ChangeRequest — merge it in Busabase before the
// change takes effect. Use this after editing content/kelly-llm-gateway-app/ files; scripts/setup.mjs
// only ever creates the AirApp once and does not re-push edits.
//
// Usage: node scripts/publish_airapp.mjs
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { publishAirApp } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-llm-gateway-app/app/js/config.js";

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content", "kelly-llm-gateway-app");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const required = (name) => {
  const value = process.env[name];
  if (!value) fail(`缺少环境变量 ${name}。可信脚本需要自己的 Busabase 凭据，不会借用 AirApp 会话。`);
  return value;
};

const client = createBusabaseClient({
  baseUrl: required("BUSABASE_BASE_URL"),
  apiKey: required("BUSABASE_API_KEY"),
  ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
});

const SKIP_NAMES = new Set(["node_modules", ".git", ".DS_Store", "coverage", "test-results", "playwright-report"]);
async function readAirAppFiles(dir = appRoot, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (SKIP_NAMES.has(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readAirAppFiles(abs, rel)));
    } else {
      files.push({ path: rel, content: await readFile(abs, "utf8") });
    }
  }
  return files;
}

const files = await readAirAppFiles();

let result;
try {
  result = await publishAirApp(client, appConfig, files);
} catch (error) {
  fail(`发布 AirApp 失败：${error instanceof Error ? error.message : error}`);
}

console.log(`AirApp ${result.status === "created" ? "创建" : "更新"}请求已提交：${result.changeRequestId}（待审核）`);
console.log("请在 Busabase 里审核并合并这个 ChangeRequest 后，改动才会生效。");
