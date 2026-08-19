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

import { inspectProvisionedResources, provisionDeclaredResources, publishAirApp } from "busabase-sdk/airapp";
import { appConfig, createTrustedClient, dryRunBanner, fail, parseFlags, readAirAppFiles } from "./lib.mjs";

const { apply } = parseFlags(process.argv.slice(2));
const client = createTrustedClient();

const describe = (resources) => {
  const byKey = new Map(resources.bases.map((base) => [base.key, base]));
  for (const declared of appConfig.bases) {
    const found = byKey.get(declared.key);
    console.log(`  ${declared.slug.padEnd(22)} ${found ? `已就绪 · ${found.baseId}` : "缺失"}`);
  }
  console.log(`  ${"AirApp".padEnd(22)} ${resources.airApp ? `已就绪 · ${resources.airApp.nodeId}` : "缺失"}`);
};

let current;
try {
  current = await inspectProvisionedResources(client, appConfig);
} catch (error) {
  // A name collision with another app is the one failure worth stopping on: the
  // safe move is to report it, never to rename or adopt someone else's Folder.
  fail(`读取 Busabase 工作区失败：${error instanceof Error ? error.message : error}`);
}

process.stdout.write(dryRunBanner(apply));
console.log(`Space ${process.env.BUSABASE_SPACE_ID || "（未指定，使用账户默认）"}`);
console.log(`Folder ${appConfig.folder.name}（${appConfig.folder.slug}）${current.folder ? "已存在" : "将创建"}`);
describe(current);

const dataReady = current.folder && !current.missing.length && !current.repairs.length;
if (dataReady && current.airApp) {
  console.log("\n工作区已经就绪（数据层 + AirApp 均已存在），这次不需要创建任何东西。");
  console.log("下一步：/kelly-jobhunt profile");
  process.exit(0);
}

if (!apply) {
  if (!dataReady) {
    const names = current.missing.map((base) => base.slug).join("、") || "（无）";
    console.log(`\n将创建：${current.folder ? "" : "Folder + "}${names}`);
    if (current.repairs.length) console.log(`将补写 ${current.repairs.length} 处应用归属标记（不改数据）。`);
  }
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
}

if (!current.airApp) {
  console.log("\n发布 AirApp…");
  const files = await readAirAppFiles();
  const result = await publishAirApp(client, appConfig, files);
  console.log(`AirApp ${result.status === "created" ? "创建" : "更新"}请求已提交：${result.changeRequestId}（待审核）`);
  console.log("请在 Busabase 里审核并合并这个 ChangeRequest 后，再打开工作台。");
} else {
  console.log("\nAirApp 已就绪。");
}

console.log("\n下一步：合并所有待审核 CR 后，/kelly-jobhunt profile");
