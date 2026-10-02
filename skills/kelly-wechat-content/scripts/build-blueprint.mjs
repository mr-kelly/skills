import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "../content/kelly-wechat-content-app/app/js/config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bases = await Promise.all(
  appConfig.bases.map(async (base) => {
    const records = (await readFile(path.join(root, "content", base.key, "records.ndjson"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    return {
      key: base.key,
      slug: base.slug,
      name: base.name,
      description: base.description,
      read_limit: base.readLimit,
      fields: base.fields.map((field) => ({ ...field, required: field.required ?? false })),
      views: base.views.map((view) => ({ ...view, key: view.slug })),
      seed_records: records,
    };
  }),
);
const blueprint = {
  schema_version: 1,
  app: {
    name: "公众号内容工作台",
    slug: "kelly-wechat-content",
    locale: "zh-CN",
    description: "让公众号编辑团队复用资料、关联稿件，并检查审核与排期。",
    deployment: "desktop",
    runtime: "node",
    read_only: true,
    binding: "runtime",
    audience: "需要把一份资料复用于多篇文章的公众号编辑团队",
  },
  route: "create-package-first",
  validation_mode: "local-preview",
  user_story: "编辑从资料库选择原文，关联文章；审核者检查未核对来源；负责人用状态看板和发布日历查看同一批稿件。",
  workspace: {
    folder: appConfig.folder,
    bases,
    relations: [
      { source_base: "articles", field_slug: "sources", target_base: "sources", required: false, multiple: true },
    ],
    docs: [
      {
        key: "editorial-guide",
        slug: "editorial-guide",
        name: "编辑规范与示例流程",
        description: "来源和稿件审核的 durable 规范",
      },
    ],
    drives: [
      {
        key: "editorial-assets",
        slug: "editorial-assets",
        name: "示例素材",
        files: [
          { path: "screenshots/", purpose: "真实运行的资料表、看板和审核截图" },
          { path: "source-checklist.txt", purpose: "资料来源核对清单" },
        ],
      },
    ],
    vault_requirements: [],
    integrations: [],
  },
  ui: {
    primary_base: "articles",
    summary: "跨资料与文章展示审核、引用、排期，原生视图仍是同一份数据。",
    screens: [
      { key: "overview", name: "总览", data_sources: ["sources", "articles"] },
      { key: "sources", name: "资料库", data_sources: ["sources", "articles"] },
      { key: "articles", name: "文章排期", data_sources: ["sources", "articles"] },
      { key: "needs-review", name: "待审核", data_sources: ["sources", "articles"] },
    ],
    actions: [
      { key: "browse-sources", kind: "read", base: "sources" },
      { key: "inspect-articles", kind: "read", base: "articles" },
    ],
    budgets: { records_per_base: 50, pages_per_user_action: 1, no_automatic_full_scan: true },
  },
  onboarding: {
    version: 1,
    required_fields: [],
    completion_resource: "editorial-guide",
    rationale: "只读内容工作台使用安装时声明的两张表；不连接公众号，不需要密钥、账户或额外发布配置。",
  },
  permissions: {
    read_procedures: [
      "nodes.get",
      "nodes.list",
      "records.list",
      "records.get",
      "records.count",
      "records.groupBy",
      "bases.listViews",
    ],
    change_request_procedures: [],
  },
  known_limits: [
    "第一版只读；审核在Busabase原生变更请求中进行。",
    "18条演示记录覆盖五个文章阶段与来源核对状态，均低于每表50条限制。",
    "模板格式不搬运记录附件值，图片放在可安装Drive中。",
    "不执行公众号对外发布。",
  ],
};
await writeFile(path.join(root, "blueprint.json"), `${JSON.stringify(blueprint, null, 2)}\n`);
console.log("Package-first blueprint generated from the app's resource contract.");
