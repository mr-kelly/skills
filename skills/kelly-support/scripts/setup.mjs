#!/usr/bin/env node
// Creates (or adopts) this skill's Busabase workspace and reads it back:
// Folder + Bases (data layer, autoMerge-eligible) and, once those exist, the
// AirApp itself. The AirApp is always a separate, always-review-first
// ChangeRequest — see the note on AirAppNodeDeclaration in busabase-sdk's
// airapp.ts for why it can never ride along on the data layer's request.
//
// Usage:
//   node scripts/setup.mjs           # dry run: reports what exists and what is missing
//   node scripts/setup.mjs --apply   # creates whatever is missing, then verifies
//
// Idempotent by construction: provisioning inspects first and only proposes the
// resources that are absent, so re-running is safe and a second run creates
// nothing — including the AirApp: once it exists, setup only reports its
// status. To push local edits to an already-deployed AirApp, use
// scripts/publish_airapp.mjs instead.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources, provisionDeclaredResources, publishAirApp } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-support-app/app/js/config.js";
import { settingsRecord, supportSettingsComplete } from "../content/kelly-support-app/app/js/support-settings.js";

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content", "kelly-support-app");

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

// Everything the deployed AirApp needs to `npm install && npm run dev` — the
// whole project except local/generated noise. publishAirApp only ever
// creates/updates paths from this list (see buildAirAppFileOperations), so
// omitting a directory here just means it never reaches the deployed AirApp,
// not that anything gets deleted there.
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

const apply = process.argv.includes("--apply");

const describe = (resources) => {
  const byKey = new Map(resources.bases.map((base) => [base.key, base]));
  for (const declared of appConfig.bases) {
    const found = byKey.get(declared.key);
    console.log(`  ${declared.slug.padEnd(28)} ${found ? `已就绪 · ${found.baseId}` : "缺失"}`);
  }
  console.log(`  ${"AirApp".padEnd(28)} ${resources.airApp ? `已就绪 · ${resources.airApp.nodeId}` : "缺失"}`);
};

async function findSettingsRecord(resources) {
  const settingsBase = resources.bases.find((base) => base.key === "settings");
  if (!settingsBase) return null;
  try {
    return await client.records.get({ baseId: settingsBase.baseId, fieldSlug: "record-id", valueText: "config" });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

async function proposeDefaultSettings(resources) {
  const settingsBase = resources.bases.find((base) => base.key === "settings");
  if (!settingsBase) fail("Settings Base 尚未就绪，无法创建默认策略。");
  return client.bases.createChangeRequest({
    baseId: settingsBase.baseId,
    fields: Object.fromEntries(
      Object.entries(settingsRecord({ updatedAt: new Date().toISOString() })).map(([key, value]) => [
        key.replaceAll("_", "-"),
        value,
      ]),
    ),
    message: "Initialize conservative Kelly Support defaults for human review",
    submittedBy: "kelly-support-setup",
    idempotencyKey: "kelly-support-default-settings-v1",
    autoMerge: false,
  });
}

let current;
try {
  current = await inspectProvisionedResources(client, appConfig);
} catch (error) {
  // A name collision with another app is the one failure worth stopping on: the
  // safe move is to report it, never to rename or adopt someone else's Folder.
  fail(`读取 Busabase 工作区失败：${error instanceof Error ? error.message : error}`);
}

console.log(apply ? "正在初始化…" : "预演模式（未写入任何数据）。确认无误后加 --apply 真正执行。");
console.log(`Space ${process.env.BUSABASE_SPACE_ID || "（未指定，使用账户默认）"}`);
console.log(`Folder ${appConfig.folder.name}（${appConfig.folder.slug}）${current.folder ? "已存在" : "将创建"}`);
describe(current);

let dataReady = current.folder && !current.missing.length && !current.repairs.length;
let currentSettingsRecord = dataReady ? await findSettingsRecord(current) : null;
let settingsReady = supportSettingsComplete(
  currentSettingsRecord?.headCommit?.payload ||
    currentSettingsRecord?.headCommit?.fields ||
    currentSettingsRecord?.fields,
);
console.log(
  `  ${"Support policy".padEnd(28)} ${settingsReady ? "已配置" : currentSettingsRecord ? "存在，待操作员确认" : "缺失（将提交安全默认值供审核）"}`,
);
if (dataReady && current.airApp && settingsReady) {
  console.log("\n工作区已经就绪（数据层 + AirApp 均已存在），这次不需要创建任何东西。");
  process.exit(0);
}

if (!apply) {
  if (!dataReady) {
    const names = current.missing.map((base) => base.slug).join("、") || "（无）";
    console.log(`\n将创建：${current.folder ? "" : "Folder + "}${names}`);
    if (current.repairs.length) console.log(`将补写 ${current.repairs.length} 处应用归属标记（不改数据）。`);
  }
  if (!currentSettingsRecord) console.log("将提交一条默认支持策略 ChangeRequest；合并并确认前不会允许批准或执行回复。");
  else if (!settingsReady) console.log("现有支持策略尚未完成确认；请在 Settings 中检查并提交配置。");
  if (!current.airApp) {
    console.log(
      "将发布 AirApp（提交待审核 ChangeRequest——执行代码，不会自动合并，需要人工在 Busabase 里审核并合并）。",
    );
  }
  console.log("确认无误后加 --apply。");
  process.exit(0);
}

if (!dataReady) {
  try {
    current = await provisionDeclaredResources(client, appConfig);
  } catch (error) {
    // A Space where the operator cannot merge their own ChangeRequest leaves the
    // request pending rather than failing; say which one, so it can be approved.
    fail(`数据层初始化未完成：${error instanceof Error ? error.message : error}`);
  }
  console.log("\n数据层创建完成，回读结果：");
  describe(current);
  if (current.missing.length) fail("回读发现仍有资源缺失，没有继续。");
  dataReady = current.folder && !current.missing.length && !current.repairs.length;
}

currentSettingsRecord = await findSettingsRecord(current);
settingsReady = supportSettingsComplete(
  currentSettingsRecord?.headCommit?.payload ||
    currentSettingsRecord?.headCommit?.fields ||
    currentSettingsRecord?.fields,
);
if (!currentSettingsRecord) {
  const result = await proposeDefaultSettings(current);
  console.log(`\n默认支持策略请求已提交：${result.id}（待审核）`);
  console.log("请确认 SLA、服务时间、退款/承诺规则、回复语言和签名后再合并；配置完成前真实执行保持阻止状态。");
} else if (!settingsReady) console.log("\n支持策略已存在但尚未确认；请在 Settings 中完成配置后再执行客户回复。");

if (!current.airApp) {
  console.log("\n发布 AirApp…");
  const files = await readAirAppFiles();
  const result = await publishAirApp(client, appConfig, files);
  console.log(`AirApp ${result.status === "created" ? "创建" : "更新"}请求已提交：${result.changeRequestId}（待审核）`);
  console.log("请在 Busabase 里审核并合并这个 ChangeRequest 后，再打开工作台。");
} else {
  console.log("\nAirApp 已就绪。");
}
