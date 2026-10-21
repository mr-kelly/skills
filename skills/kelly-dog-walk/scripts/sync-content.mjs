#!/usr/bin/env node
/**
 * Regenerate the template's `content/` sidecars, or check they are current.
 *
 *   node scripts/sync-content.mjs           # write
 *   node scripts/sync-content.mjs --check   # exit 1 on drift (CI)
 *
 * Canonical sources, one each:
 *   - Base fields and native views   → content/kelly-dog-walk-app/app/js/config.js
 *   - 遛狗手册 v1                     → references/playbooks/v1.md  (the course's starting playbook)
 *   - node agent prompts              → NODE_PROMPTS below (the 裁判规则 Doc keeps its own, in its frontmatter)
 *
 * The package format carries only `table` views, so the calendar and kanban for 每天的决定 go to
 * references/native-views.json, and scripts/setup.mjs creates them after install.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "../content/kelly-dog-walk-app/app/js/config.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

/** Natural user language; `{target}` on its own line, as Busabase's built-in prompts do. */
export const NODE_PROMPTS = {
  folder: [
    {
      key: "how-it-works",
      label: "这个文件夹怎么用",
      intent: "read-only",
      body: "{target}\n\n先读同目录的 kelly-dog-walk 技能，用三五句话告诉我：遛狗手册、裁判规则、每天的决定、天气数据各管什么，Agent 用我的账号跑要注意什么，要不要另开一个成员账号。只看，不要改任何东西。",
    },
  ],
  "walk-playbook": [
    {
      key: "walk-today",
      label: "今天几点遛狗",
      intent: "change",
      body: "{target}\n\n先读这本遛狗手册，再读同目录的 kelly-dog-walk 技能。抓我所在城市今天的逐时预报（没说就用上海），按手册的规则卡定一个钟点，写进「每天的决定」，告诉我几点遛、为什么。再用昨天的实际天气给昨天的决定判个结论。不要改这本手册。",
    },
  ],
  decisions: [
    {
      key: "replay-month",
      label: "回放一个月",
      intent: "change",
      body: "{target}\n\n先读同目录的 kelly-dog-walk 技能和遛狗手册。用手册现在的规则，回放我说的城市和月份（没说就用上海 2026 年 6 月），按裁判规则判每一天，写进这张表。然后告诉我淋雨、太热、不方便各几次。",
    },
    {
      key: "monthly-review",
      label: "复盘并提议改手册",
      intent: "change",
      body: "{target}\n\n先读同目录的 kelly-dog-walk 技能、遛狗手册和裁判规则。复盘上个月：淋雨那几天当时的预报是多少、落在星期几，太热和不方便各几次。想改手册，先在同一个月和现在的手册对照，再换一个月验证，两个月都赢了才提变更请求，消息里附上回放证据。不要直接改手册，也不要改裁判规则。",
    },
  ],
  weather: [
    {
      key: "fetch-weather",
      label: "抓取天气",
      intent: "change",
      body: "{target}\n\n先读同目录的 kelly-dog-walk 技能。从 Open-Meteo 抓我说的城市和月份（没说就用上海、今天）每天早 6 点到晚 10 点的预报和实际天气，写进这张表。只写天气数据，不碰遛狗手册和裁判规则。",
    },
  ],
  [appConfig.airApp.slug]: [
    {
      key: "how-did-we-do",
      label: "这个月遛得怎么样",
      intent: "read-only",
      body: "{target}\n\n先读同目录的 kelly-dog-walk 技能。看看遛狗日历：这个月每天几点遛、淋了几次雨，和一直用 v1 比怎么样，手册是从哪个版本变过来的。只看，不要改任何东西。",
    },
  ],
};

const POSITIONS = { "walk-playbook": 1, "judge-rules": 2, decisions: 3, weather: 4, [appConfig.airApp.slug]: 5 };

const stale = [];
const emit = async (relativePath, contents) => {
  const target = path.join(root, relativePath);
  if (check) {
    const current = await readFile(target, "utf8").catch(() => null);
    // JSON is compared by value: Biome owns its formatting (`npm run format`), so a reformatted
    // file is not drift. Everything else must match byte for byte.
    const same = relativePath.endsWith(".json")
      ? current !== null && JSON.stringify(JSON.parse(current)) === JSON.stringify(JSON.parse(contents))
      : current === contents;
    if (!same) stale.push(relativePath);
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
};
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

for (const base of appConfig.bases) {
  await emit(
    `content/${base.key}/base.json`,
    json({
      name: base.name,
      description: base.description,
      position: POSITIONS[base.key],
      fields: base.fields.map((field, position) => ({
        slug: field.slug,
        name: field.name,
        type: field.type,
        required: Boolean(field.required),
        position,
        options: field.options ?? {},
      })),
      views: base.views
        .filter((view) => view.type === "table")
        .map((view) => ({ ...view, config: { filters: [], sorts: [], ...view.config } })),
      agentPrompts: NODE_PROMPTS[base.key],
    }),
  );
}

await emit(
  "references/native-views.json",
  json(
    appConfig.bases.flatMap((base) =>
      base.views
        .filter((view) => view.type !== "table")
        .map((view) => ({
          resourceKey: base.key,
          slug: view.slug,
          name: view.name,
          description: view.description ?? "",
          type: view.type,
          config: { filters: [], sorts: [], ...view.config },
        })),
    ),
  ),
);

await emit(
  "content/_folder.json",
  json({ name: appConfig.folder.name, description: appConfig.folder.description, agentPrompts: NODE_PROMPTS.folder }),
);

const playbook = appConfig.nodes.playbook;
await emit(
  `content/${playbook.key}/_node.json`,
  json({
    type: "skill",
    name: playbook.name,
    description: "做事手册：Agent 每天定钟点前先读它。只能通过变更请求修改，主人合并才算数。",
    position: POSITIONS[playbook.key],
    agentPrompts: NODE_PROMPTS[playbook.key],
  }),
);
await emit(`content/${playbook.key}/SKILL.md`, await readFile(path.join(root, "references/playbooks/v1.md"), "utf8"));

await emit(
  `content/${appConfig.airApp.slug}/_node.json`,
  json({
    type: "airapp",
    name: appConfig.appName,
    description: "只读的遛狗日历：每天几点遛、结论、每月汇总、手册版本时间线，以及和一直用 v1 的对照。",
    position: POSITIONS[appConfig.airApp.slug],
    agentPrompts: NODE_PROMPTS[appConfig.airApp.slug],
  }),
);

const judge = await readFile(path.join(root, "content/judge-rules.md"), "utf8");
if (!/^agentPrompts:/m.test(judge)) stale.push("content/judge-rules.md (frontmatter has no agentPrompts)");

if (check && stale.length > 0) {
  console.error(
    `content/ is out of date:\n${stale.map((item) => `  ${item}`).join("\n")}\n\nRun: node scripts/sync-content.mjs`,
  );
  process.exit(1);
}
console.log(check ? "content/ is up to date." : "content/ regenerated.");
