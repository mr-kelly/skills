#!/usr/bin/env node
// 装好模板之后的收尾，以及给 Agent 开权限的清单。幂等：重复跑不会多建东西。
//
//   npx busabase-cli@latest install skills/kelly-dog-walk          # 第 1 步：装模板（主人的账号）
//   node skills/kelly-dog-walk/scripts/setup.mjs                    # 第 2 步：预演，看缺什么
//   node skills/kelly-dog-walk/scripts/setup.mjs --apply            #          补齐
//   node skills/kelly-dog-walk/scripts/setup.mjs --agent-user <id>  # 第 3 步：打印给 Agent 开权限的命令
//
// --apply 会做三件模板格式本身做不到的事：
//   1. 把安装出来的文件夹改名为「遛狗不淋雨」（安装时文件夹名取的是包名 kelly-dog-walk）；
//   2. 给「裁判规则」文档补上 appId/resourceKey 标记（安装只给 Base、技能、AirApp 打标记）；
//   3. 给「每天的决定」建日历视图（按日期）和看板（按结论）——包格式只能带表格视图，
//      所以这两个视图写在 references/native-views.json 里，由这里创建。
// 这一步用主人（管理员）的凭据跑。之后 Agent 跑脚本，用它自己的成员账号。
import { readFile } from "node:fs/promises";
import path from "node:path";
import { appConfig } from "../content/kelly-dog-walk-app/app/js/config.js";
import { connect, resolveWorkspace } from "./lib/busabase.mjs";
import { SKILL_ROOT, parseArgs, run } from "./lib/cli.mjs";

/** @type {Array<[key: string, label: string, role: string, roleLabel: string, why: string]>} */
const PERMISSIONS = [
  ["playbook", "遛狗手册", "changeRequest", "可提交变更", "改手册只能提变更请求，主人合并才算数"],
  ["judge", "裁判规则", "read", "只读", "裁判不能自己改自己的考卷"],
  ["decisions", "每天的决定", "write", "可写入", "每天写决定、写结论"],
  ["weather", "天气数据", "write", "可写入", "自己抓的天气"],
  ["app", "遛狗日历", "read", "只读", "只看"],
];

run(async () => {
  const args = parseArgs(process.argv.slice(2), { flags: ["apply"], values: ["folder", "agent-user"] });
  const client = connect();
  let ws;
  try {
    ws = await resolveWorkspace(client, { folderId: args.folder });
  } catch (error) {
    console.log(error instanceof Error ? error.message : error);
    console.log(
      `\n先装模板（用主人的账号）：\n  npx busabase-cli@latest install ${path.relative(process.cwd(), SKILL_ROOT) || "."}`,
    );
    console.log(
      "  或者从 GitHub：npx busabase-cli@latest install https://github.com/mr-kelly/skills/tree/main/skills/kelly-dog-walk",
    );
    process.exitCode = 1;
    return;
  }

  const nodeOf = {
    playbook: ws.playbook,
    judge: ws.judge,
    decisions: ws.bases.decisions && { id: ws.bases.decisions.nodeId },
    weather: ws.bases.weather && { id: ws.bases.weather.nodeId },
    app: ws.app,
  };
  console.log(`文件夹：${ws.folder.name}（${ws.folder.id}）`);
  for (const [key, label] of PERMISSIONS)
    console.log(`  ${label.padEnd(6, "　")} ${nodeOf[key] ? nodeOf[key].id : "缺失"}`);
  console.log(`  ${"做事规矩".padEnd(6, "　")} ${ws.manual ? ws.manual.id : "缺失"}（kelly-dog-walk 技能本身）`);
  const missing = PERMISSIONS.filter(([key]) => !nodeOf[key]).map(([, label]) => label);
  if (missing.length) {
    console.log(`\n缺少：${missing.join("、")}。重新安装模板，或者用 --folder 指定正确的文件夹。`);
    process.exitCode = 1;
    return;
  }

  const todo = [];
  if (ws.folder.name !== appConfig.folder.name) todo.push("rename");
  if (ws.judge.metadata?.appId !== appConfig.appId) todo.push("stamp-judge");
  const declared = JSON.parse(await readFile(path.join(SKILL_ROOT, "references", "native-views.json"), "utf8"));
  const missingViews = [];
  for (const view of declared) {
    const base = ws.bases[view.resourceKey];
    const existing = (await client.bases.listViews({ baseId: base.baseId })).filter((item) => item.slug === view.slug);
    if (existing.length > 1) throw new Error(`「${base.name}」里有两个 ${view.slug} 视图，先手动删掉一个`);
    if (existing.length && existing[0].type !== view.type)
      throw new Error(`「${base.name}」里已有同名视图 ${view.slug}，但类型是 ${existing[0].type}，不覆盖`);
    if (!existing.length) missingViews.push({ ...view, baseId: base.baseId, baseName: base.name });
  }

  console.log("");
  if (!todo.length && !missingViews.length) console.log("收尾已完成：文件夹名、裁判规则标记、日历和看板视图都在。");
  else if (!args.apply) {
    if (todo.includes("rename")) console.log(`将把文件夹「${ws.folder.name}」改名为「${appConfig.folder.name}」`);
    if (todo.includes("stamp-judge")) console.log("将给「裁判规则」补上应用标记");
    for (const view of missingViews) console.log(`将在「${view.baseName}」建视图「${view.name}」（${view.type}）`);
    console.log("预演，没有改动。确认后加 --apply。");
  } else {
    if (todo.includes("rename")) {
      await client.nodes.createChangeRequest({
        operations: [
          {
            kind: "rename",
            nodeId: ws.folder.id,
            name: appConfig.folder.name,
            description: appConfig.folder.description,
            icon: { type: "emoji", value: "🐕" },
          },
        ],
        message: `文件夹改名为「${appConfig.folder.name}」`,
      });
      console.log(`已改名：${appConfig.folder.name}`);
    }
    if (todo.includes("stamp-judge")) {
      await client.nodes.updateMetadata({
        nodeId: ws.judge.id,
        metadata: {
          ...(ws.judge.metadata || {}),
          appId: appConfig.appId,
          resourceKey: appConfig.nodes.judge.key,
          schemaVersion: appConfig.schemaVersion,
        },
      });
      console.log("已给「裁判规则」补上应用标记");
    }
    for (const view of missingViews) {
      const result = await client.views.changeRequest({
        operation: "create",
        baseId: view.baseId,
        slug: view.slug,
        name: view.name,
        description: view.description,
        type: view.type,
        config: view.config,
        message: `建「${view.name}」视图`,
      });
      const readback = (await client.bases.listViews({ baseId: view.baseId })).find((item) => item.slug === view.slug);
      console.log(readback ? `已建视图「${view.name}」` : `视图「${view.name}」在等审核：${result.id}`);
    }
  }

  const agent = args["agent-user"] || "<Agent 的用户 id>";
  console.log("\n给 Agent 开权限（主人用管理员账号做；Agent 之后只用自己的成员账号跑脚本）：");
  for (const [key, label, role, roleLabel, why] of PERMISSIONS) {
    console.log(`  ${label.padEnd(6, "　")} ${roleLabel.padEnd(6, "　")} ${why}`);
  }
  console.log(
    "\n  「遛狗手册」和「裁判规则」要设成「限制访问」：设了以后只有单独授予的权限算数，空间里的默认权限盖不过它。" +
      "\n  管理员和所有者不受「限制访问」约束——所以 Agent 一定要用自己的成员账号，不能用管理员的 API key，否则权限这道闸门就是摆设。",
  );
  console.log("\n  命令行授予（管理员执行）：");
  for (const [key, , role] of PERMISSIONS) {
    console.log(
      `    npx busabase-cli@latest nodes permission --node-id ${nodeOf[key].id} --action grant --principal-type user --principal-id ${agent} --role ${role}`,
    );
  }
});
