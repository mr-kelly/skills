import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "../content/kelly-wechat-content-app/app/js/config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const prompts = {
  sources: [
    {
      key: "collect-sources",
      label: "整理本周公众号资料",
      intent: "change",
      body: "{target}\n\n先读同目录 kelly-wechat-content Skill。整理我提供的资料，检查重复并保留来源，未核对的资料不要标为已核对，提交修改供检查。",
    },
    {
      key: "find-reused-sources",
      label: "哪些资料被多篇文章复用了",
      intent: "read-only",
      body: "{target}\n\n先读同目录 kelly-wechat-content Skill，检查资料与文章的关联，列出反复使用的资料、引用文章和缺少出处的材料，不修改数据。",
    },
  ],
  articles: [
    {
      key: "draft-from-sources",
      label: "从已有资料准备文章提纲",
      intent: "change",
      body: "{target}\n\n先读同目录 kelly-wechat-content Skill，根据我指定的资料提出文章提纲和关联资料，保存为可审核提案，不对外发布。",
    },
    {
      key: "review-this-week",
      label: "检查本周待审核文章",
      intent: "read-only",
      body: "{target}\n\n先读同目录 kelly-wechat-content Skill，读待审核文章及关联资料，指出缺少来源、未核对事实和需要负责人确认的地方。",
    },
    {
      key: "suggest-calendar",
      label: "给下周的稿件安排发布时间",
      intent: "change",
      body: "{target}\n\n先读同目录 kelly-wechat-content Skill，查看文章进度、负责人和发布日历，先提出排期方案，经我确认后再提交日期修改，不对外发布。",
    },
  ],
};
for (const base of appConfig.bases) {
  const fields = base.fields.map((field, position) => {
    const options = structuredClone(field.options ?? {});
    if (options.targetBaseSlug) {
      const target = appConfig.bases.find((candidate) => candidate.slug === options.targetBaseSlug);
      if (!target) throw new Error(`Unresolved relation ${base.key}.${field.slug}`);
      options.targetBaseSlug = target.key;
    }
    return { ...field, required: field.required ?? false, position, options };
  });
  const views = base.views
    .filter((view) => view.type === "table")
    .map((view) => ({
      slug: view.slug,
      name: view.name,
      description: view.description ?? "",
      type: view.type,
      config: { filters: [], sorts: [], ...view.config },
    }));
  const expected = `${JSON.stringify({ name: base.name, description: base.description, position: appConfig.bases.indexOf(base), fields, views, agentPrompts: prompts[base.key] }, null, 2)}\n`;
  const file = path.join(root, "content", base.key, "base.json");
  if (check) {
    if (JSON.stringify(JSON.parse(await readFile(file, "utf8"))) !== JSON.stringify(JSON.parse(expected)))
      throw new Error(`Content drift: ${base.key}`);
  } else await writeFile(file, expected);
}
const nativeViews = appConfig.bases.flatMap((base) =>
  base.views
    .filter((view) => view.type !== "table")
    .map((view) => ({
      resourceKey: base.key,
      ...view,
      description: view.description ?? "",
      config: { filters: [], sorts: [], ...view.config },
    })),
);
const nativeFile = path.join(root, "references", "native-views.json");
const nativeExpected = `${JSON.stringify(nativeViews, null, 2)}\n`;
if (check) {
  if (JSON.stringify(JSON.parse(await readFile(nativeFile, "utf8"))) !== JSON.stringify(JSON.parse(nativeExpected)))
    throw new Error("Native view declarations drifted.");
} else await writeFile(nativeFile, nativeExpected);
console.log(
  check
    ? "Native Base resources match the canonical app config."
    : "Native Base resources generated from the canonical app config.",
);
