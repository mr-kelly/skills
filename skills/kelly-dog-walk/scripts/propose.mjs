#!/usr/bin/env node
// 提议改手册：给 Busabase 里的「遛狗手册」提一个变更请求。只提，不合并——合并是主人的事。
//
//   node scripts/propose.mjs --file new-playbook.md --city 上海 --month 2026-06 --month 2026-05 --note "……"
//   node scripts/propose.mjs --file references/playbooks/v2.md --city 上海 --month 2026-06,2026-05 --source fixtures --dry-run
//
// 它做的事：
//   1. 读手册现在的 SKILL.md 和它的 contentHash（变更请求要基于这个版本，别人先改了就会冲突）；
//   2. 检查新手册：规则卡读得懂、版本号往上走、版本记录只增不减、「已退休」一条都不能少；
//   3. 用裁判规则（Busabase 里那份）在每个 --month 上把现在的手册和新手册各回放一遍，同月对照；
//   4. 证据表由这个脚本算出来写进变更请求说明——证据只认裁判数据，不认 Agent 自己写的数字；
//   5. 任何一个月没通过就拒绝提交，除非用 --despite 写明理由（比如：回滚时裁判规则还不看护栏）；
//   6. autoMerge: false 提交，等主人在 Busabase 里审核合并。
//
// 等价的 CLI（--dry-run 会打印并把 ops.json 写到 --ops-out）：
//   npx busabase-cli@latest skills create-change-request --node-id <遛狗手册> --operations-json @ops.json --message "…" --require-review
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GATE_WHY,
  METRIC_LABEL,
  daysFromMonthData,
  gate,
  parseJudgeRules,
  parsePlaybookHistory,
  parseRuleCard,
  replayMonth,
  summarize,
} from "../content/kelly-dog-walk-app/app/js/walk-model.js";
import { lazyBusabase, loadJudgeSource, parseArgs, run } from "./lib/cli.mjs";
import { loadMonth, resolvePlace } from "./lib/open-meteo.mjs";

const versionNumber = (version) => Number(String(version).replace(/^v/, ""));

/** History only grows: every version record and every retired rule of `before` must survive in `after`. */
export const checkHistory = (before, after) => {
  const problems = [];
  const a = parsePlaybookHistory(before);
  const b = parsePlaybookHistory(after);
  for (const entry of a.versions) {
    if (!b.versions.some((other) => other.version === entry.version)) problems.push(`版本记录里少了 ${entry.version}`);
  }
  for (const entry of a.retired) {
    if (!b.retired.some((other) => other.rule === entry.rule)) problems.push(`「已退休」里少了：${entry.rule}`);
  }
  return { problems, before: a, after: b };
};

run(async () => {
  const args = parseArgs(process.argv.slice(2), {
    flags: ["dry-run", "geocode"],
    values: [
      "file",
      "city",
      "note",
      "despite",
      "source",
      "lat",
      "lon",
      "timezone",
      "folder",
      "judge",
      "ops-out",
      "title",
    ],
    repeatable: ["month"],
  });
  if (!args.file) throw new Error("要给新手册：--file new-playbook.md");
  if (!args.month.length)
    throw new Error("提议必须带回放证据：至少 --month 一个月（规矩是两个月：同一个月对照 + 换一个月）");

  const busabase = lazyBusabase(args.folder);
  const { client, ws, readPlaybook, APP_ID } = await busabase();
  const current = await readPlaybook(client, ws);
  const proposed = await readFile(path.resolve(args.file), "utf8");
  const judgeSource = await loadJudgeSource(args.judge || "busabase", busabase);
  const judge = parseJudgeRules(judgeSource.content);
  const before = parseRuleCard(current.content);
  const after = parseRuleCard(proposed);

  const problems = [];
  if (proposed === current.content) problems.push("新手册和现在的一模一样");
  if (versionNumber(after.version) <= versionNumber(before.version))
    problems.push(`版本号要往上走：现在 ${before.version}，提议 ${after.version}`);
  const history = checkHistory(current.content, proposed);
  problems.push(...history.problems);
  if (!history.after.versions.some((entry) => entry.version === after.version))
    problems.push(`版本记录里要写上 ${after.version} 改了什么、为什么`);
  if (history.after.current && history.after.current !== after.version)
    problems.push(`「当前版本」写的是 ${history.after.current}，规则卡写的是 ${after.version}`);
  if (problems.length) throw new Error(`不提交，新手册有问题：\n  - ${problems.join("\n  - ")}`);

  const place = await resolvePlace({
    city: args.city,
    lat: args.lat,
    lon: args.lon,
    timezone: args.timezone,
    geocode: args.geocode,
  });
  const evidence = [];
  for (const month of args.month) {
    const data = await loadMonth(place, month, { source: args.source || "auto" });
    const days = daysFromMonthData(data);
    const mine = summarize(replayMonth(days, before, judge, { city: place.name }));
    const theirs = summarize(replayMonth(days, after, judge, { city: place.name }));
    evidence.push({ month, mine, theirs, result: gate(theirs, mine, judge), origin: data.origin });
  }
  const passed = evidence.filter((item) => item.result.pass).length;
  const allPass = evidence.length >= 2 && passed === evidence.length;

  const lines = [];
  const title =
    args.title || history.after.versions.find((entry) => entry.version === after.version)?.change || "改遛狗手册";
  lines.push(`遛狗手册 ${before.version} → ${after.version}：${title}`);
  lines.push("");
  lines.push(
    `回放证据（Open-Meteo，${place.name} ${place.latitude}, ${place.longitude}；裁判规则 ${judge.version}：淋雨 ≥ ${judge.wetMm} mm，太热 ≥ ${judge.hotC}°C，${judge.guardrails ? `护栏 太热 ${judge.guardrails.hot} 次、不方便 ${judge.guardrails.off} 次` : "没有护栏"}）`,
  );
  lines.push("");
  lines.push("| 月份 | 手册 | 淋雨 | 太热 | 不方便 | 裁判 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const item of evidence) {
    lines.push(
      `| ${item.month} | ${before.version}（现在） | ${item.mine.wet}/${item.mine.days} | ${item.mine.hot} | ${item.mine.off} | |`,
    );
    const warn = item.result.warnings.map((key) => `${METRIC_LABEL[key]}变多`).join("、");
    lines.push(
      `| ${item.month} | ${after.version}（提议） | ${item.theirs.wet}/${item.theirs.days} | ${item.theirs.hot} | ${item.theirs.off} | ${item.result.pass ? "通过" : "不通过"}：${GATE_WHY[item.result.why]}${warn ? `；${warn}（这版裁判不计）` : ""} |`,
    );
  }
  lines.push("");
  lines.push(
    allPass
      ? `结论：${evidence.length} 个月都通过。`
      : evidence.length < 2
        ? "结论：只对照了 1 个月，还缺「换一个月也赢」。"
        : `结论：${evidence.length} 个月里只有 ${passed} 个通过。`,
  );
  if (evidence.some((item) => item.result.warnings.length)) {
    lines.push(
      "提醒主人：上面有变差的太热或不方便，现在的裁判规则不计分。合并前请看一眼；也可以考虑给裁判规则加护栏（Agent 只能建议，改裁判规则是主人的事）。",
    );
  }
  if (args.note) lines.push("", `Agent 说明：${args.note}`);
  if (!allPass) {
    if (!args.despite) {
      console.log(lines.join("\n"));
      throw new Error("\n没有提交：证据不够。确实要提（比如回滚而裁判规则还不看护栏），用 --despite 写明理由。");
    }
    lines.push("", `证据不够仍然提交，理由：${args.despite}`);
  }
  lines.push("", "这是提议。Agent 对遛狗手册只有「可提交变更」权限，合并由主人决定。");
  const message = lines.join("\n");
  const operations = [{ kind: "update", path: "SKILL.md", content: proposed, baseContentHash: current.contentHash }];

  if (args["dry-run"]) {
    console.log(message);
    if (args["ops-out"]) {
      await writeFile(args["ops-out"], `${JSON.stringify(operations, null, 2)}\n`);
      console.log(
        `\n预演，没有提交。ops 已写入 ${args["ops-out"]}。等价命令：\nnpx busabase-cli@latest skills create-change-request --node-id ${current.nodeId} --operations-json @${args["ops-out"]} --message "<上面的说明>" --require-review`,
      );
    } else console.log("\n预演，没有提交。");
    return;
  }

  const changeRequest = await client.fileTrees.createChangeRequest({
    nodeId: current.nodeId,
    type: "skill",
    operations,
    message,
    submittedBy: APP_ID,
    autoMerge: false,
  });
  console.log(message);
  console.log(`\n变更请求已提交：${changeRequest.id}（${changeRequest.status}）。请主人在 Busabase 里审核、合并。`);
  if (changeRequest.status === "merged") {
    console.error(
      "警告：这个变更请求被直接合并了——你用的凭据权限太大。Agent 应该用自己的成员账号，遛狗手册只给「可提交变更」。",
    );
    process.exitCode = 2;
  }
});
