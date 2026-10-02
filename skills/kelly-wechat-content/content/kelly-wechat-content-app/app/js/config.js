export const topics = [
  { id: "workflow", name: "工作流" },
  { id: "product", name: "产品实践" },
  { id: "growth", name: "内容增长" },
];
export const kinds = [
  { id: "article", name: "文章" },
  { id: "report", name: "报告" },
  { id: "screenshot", name: "截图" },
  { id: "note", name: "笔记" },
];
export const statuses = [
  { id: "planned", name: "选题" },
  { id: "drafting", name: "写作中" },
  { id: "review", name: "待审核" },
  { id: "scheduled", name: "待发布" },
  { id: "published", name: "已发布" },
];
/**
 * @param {string} slug
 * @param {string} name
 * @param {string} type
 * @param {{ required?: boolean, options?: Record<string, any> }} [extra]
 */
const field = (slug, name, type, extra = {}) => ({ slug: slug.replaceAll("_", "-"), name, type, ...extra });
const select = (slug, name, choices) => field(slug, name, "select", { options: { choices } });
export const appConfig = {
  appId: "kelly-wechat-content",
  appName: "公众号内容工作台",
  schemaVersion: 1,
  folder: { slug: "kelly-wechat-content", name: "公众号内容工作台", description: "公众号资料库与文章排期" },
  airApp: { slug: "kelly-wechat-content-app", name: "公众号内容工作台", resourceKey: "kelly-wechat-content-app" },
  permissions: {
    readProcedures: [
      "nodes.get",
      "nodes.list",
      "bases.listViews",
      "records.list",
      "records.listPage",
      "records.get",
      "records.count",
      "records.groupBy",
    ],
    writeProcedures: [],
    setupProcedures: [],
  },
  bases: [
    {
      key: "sources",
      slug: "kelly-wechat-content-sources",
      name: "资料库",
      description: "可复用的公众号参考资料",
      readLimit: 50,
      fields: [
        field("title", "资料标题", "text", { required: true }),
        select("kind", "资料类型", kinds),
        select("topic", "主题", topics),
        field("summary", "摘要", "longtext"),
        field("url", "来源链接", "url"),
        field("attachment", "原始附件", "attachment"),
        field("search_text", "检索文字摘录", "longtext"),
        field("source_date", "资料日期", "date"),
        field("verified", "来源已核对", "checkbox"),
        field("notes", "资料备注", "longtext"),
      ],
      views: [
        {
          slug: "all-sources",
          name: "全部资料",
          description: "按资料日期浏览参考资料",
          type: "table",
          config: {
            visibleFieldSlugs: ["title", "kind", "topic", "verified", "source-date", "url"],
            filters: [],
            sorts: [],
          },
        },
        {
          slug: "unverified",
          name: "待核对资料",
          description: "需要确认出处或事实的资料",
          type: "table",
          config: {
            visibleFieldSlugs: ["title", "kind", "topic", "verified", "notes"],
            filters: [{ fieldSlug: "verified", fieldType: "checkbox", operator: "is_false" }],
            sorts: [],
          },
        },
        {
          slug: "source-gallery",
          name: "资料画廊",
          description: "资料摘要与截图参考",
          type: "gallery",
          config: { visibleFieldSlugs: ["title", "summary", "kind", "verified"], filters: [], sorts: [] },
        },
      ],
    },
    {
      key: "articles",
      slug: "kelly-wechat-content-articles",
      name: "文章排期",
      description: "从选题、草稿到审核与发布",
      readLimit: 50,
      fields: [
        field("title", "文章标题", "text", { required: true }),
        select("topic", "主题", topics),
        select("status", "进度", statuses),
        field("owner", "负责人", "text"),
        field("publish_date", "计划发布日期", "date"),
        field("sources", "关联资料", "relation", {
          options: { targetBaseSlug: "kelly-wechat-content-sources", multiple: true },
        }),
        field("outline", "文章提纲", "longtext"),
        field("draft", "草稿", "markdown"),
        field("review_note", "审核备注", "longtext"),
        field("public_url", "发布链接", "url"),
      ],
      views: [
        {
          slug: "all-articles",
          name: "文章列表",
          description: "查看负责人、进度和关联资料",
          type: "table",
          config: {
            visibleFieldSlugs: ["title", "status", "owner", "publish-date", "sources"],
            filters: [],
            sorts: [],
          },
        },
        {
          slug: "status-board",
          name: "进度看板",
          description: "按文章进度整理选题",
          type: "kanban",
          config: {
            stackByFieldSlug: "status",
            visibleFieldSlugs: ["title", "owner", "publish-date"],
            filters: [],
            sorts: [],
          },
        },
        {
          slug: "publishing-calendar",
          name: "发布日历",
          description: "按计划发布日期查看文章",
          type: "calendar",
          config: {
            dateFieldSlug: "publish-date",
            visibleFieldSlugs: ["title", "status", "owner"],
            filters: [],
            sorts: [],
          },
        },
        {
          slug: "review",
          name: "待审核",
          description: "需要人审核的文章草稿",
          type: "table",
          config: {
            visibleFieldSlugs: ["title", "status", "owner", "review-note", "sources"],
            filters: [{ fieldSlug: "status", fieldType: "select", operator: "equals", value: "待审核" }],
            sorts: [],
          },
        },
      ],
    },
  ],
};
for (const base of appConfig.bases) {
  for (const view of base.views) {
    if (view.type === "table")
      view.config.fieldWidths = {
        title: 320,
        kind: 100,
        topic: 110,
        verified: 100,
        "source-date": 130,
        url: 240,
        status: 110,
        owner: 100,
        "publish-date": 130,
        sources: 300,
        "review-note": 320,
        notes: 320,
      };
  }
}
