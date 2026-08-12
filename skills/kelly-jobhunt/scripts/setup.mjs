#!/usr/bin/env node
// Creates (or adopts) this skill's Busabase workspace and reads it back.
//
// Usage:
//   node scripts/setup.mjs           # dry run: reports what exists and what is missing
//   node scripts/setup.mjs --apply   # creates whatever is missing, then verifies
//
// Idempotent by construction: provisioning inspects first and only proposes the
// resources that are absent, so re-running is safe and a second run creates
// nothing. Running it before `profile` means nobody has to copy a Node or Base
// ID by hand — every other script resolves them from the Folder by slug.

import { inspectProvisionedResources, provisionDeclaredResources } from "../app/app/js/resource-provisioning.js";
import { appConfig, createTrustedClient, dryRunBanner, fail, parseFlags } from "./lib.mjs";

const { apply } = parseFlags(process.argv.slice(2));
const client = createTrustedClient();

const describe = (resources) => {
  const byKey = new Map(resources.bases.map((base) => [base.key, base]));
  for (const declared of appConfig.bases) {
    const found = byKey.get(declared.key);
    console.log(`  ${declared.slug.padEnd(22)} ${found ? `已就绪 · ${found.baseId}` : "缺失"}`);
  }
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

if (!current.missing.length && current.folder && !current.repairs.length) {
  console.log("\n工作区已经就绪，这次不需要创建任何东西。");
  console.log("下一步：/kelly-jobhunt profile");
  process.exit(0);
}

if (!apply) {
  const names = current.missing.map((base) => base.slug).join("、") || "（无）";
  console.log(`\n将创建：${current.folder ? "" : "Folder + "}${names}`);
  if (current.repairs.length) console.log(`将补写 ${current.repairs.length} 处应用归属标记（不改数据）。`);
  console.log("确认无误后加 --apply。");
  process.exit(0);
}

let provisioned;
try {
  provisioned = await provisionDeclaredResources(client, appConfig);
} catch (error) {
  // A Space where the operator cannot merge their own ChangeRequest leaves the
  // request pending rather than failing; say which one, so it can be approved.
  fail(`初始化未完成：${error instanceof Error ? error.message : error}`);
}

console.log("\n创建完成，回读结果：");
describe(provisioned);

if (provisioned.missing.length) fail("回读发现仍有资源缺失，没有继续。");

console.log("\n工作区就绪。下一步：/kelly-jobhunt profile");
