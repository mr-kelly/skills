// The one declaration of this template's Busabase resources.
//
// `scripts/sync-content.mjs` generates content/decisions/base.json, content/weather/base.json and
// references/native-views.json from it, so the template install, the trusted scripts and this
// AirApp all name the same fields. Change a field here, then run that script.
//
// No node ids and no space id: a template materializes fresh resources in the installer's Space,
// and everything is found again by `metadata.appId` + `metadata.resourceKey`, which install stamps.

/**
 * @param {string} slug
 * @param {string} name
 * @param {string} type
 * @param {{ required?: boolean, options?: Record<string, any> }} [extra]
 */
const field = (slug, name, type, extra = {}) => ({ slug, name, type, required: false, ...extra });

// Choice id = choice name, so the stored value is the word a person reads (没淋), never an opaque id.
export const VERDICT_CHOICES = ["没淋", "淋雨", "太热", "不方便", "待判"].map((name) => ({ id: name, name }));

export const appConfig = {
  appId: "kelly-dog-walk",
  appName: "遛狗日历",
  deployment: "cloud",
  locale: "auto",
  readOnly: true,
  schemaVersion: 1,
  folder: {
    slug: "kelly-dog-walk",
    name: "遛狗不淋雨",
    description: "Agent 每天替主人决定几点遛狗；裁判是真实天气。手册只能通过变更请求修改，主人合并才算数。",
  },
  airApp: { slug: "kelly-dog-walk-app", name: "遛狗日历", resourceKey: "kelly-dog-walk-app" },
  // Non-Base nodes the template ships. Found by resourceKey; the AirApp only ever reads them.
  nodes: {
    playbook: { key: "walk-playbook", type: "skill", name: "遛狗手册", file: "SKILL.md" },
    judge: { key: "judge-rules", type: "doc", name: "裁判规则" },
  },
  bases: [
    {
      key: "decisions",
      slug: "kelly-dog-walk-decisions",
      name: "每天的决定",
      description:
        "一天一行：Agent 按遛狗手册选的钟点、依据的规则、当时的预报、实际天气和裁判的结论。回放和每日模式都写这里；按「日期 + 城市」更新，不重复。",
      readLimit: 50,
      fields: [
        // First on purpose: the lowest-position field is the record title, and the calendar and
        // kanban cards show only the title. `18 点 · 淋雨` is what a day cell should say.
        field("summary", "摘要", "text"),
        field("date", "日期", "date", { required: true, options: { date: { includeTime: false } } }),
        field("city", "城市", "text", { required: true }),
        field("walk-hour", "遛狗钟点", "number"),
        field("rule-applied", "依据规则", "longtext"),
        field("forecast-precip-prob", "当时预报降水概率 %", "number"),
        field("forecast-temp", "当时预报气温 °C", "number"),
        field("actual-precip-mm", "实际降水 mm", "number"),
        field("actual-temp", "实际气温 °C", "number"),
        field("verdict", "结论", "select", { options: { choices: VERDICT_CHOICES } }),
        field("playbook-version", "手册版本", "text"),
        field("month", "月份", "text"),
      ],
      views: [
        {
          slug: "verdict-calendar",
          name: "遛狗日历",
          description: "按日期看每天几点遛、结论是什么",
          type: "calendar",
          config: { dateFieldSlug: "date", visibleFieldSlugs: ["walk-hour", "verdict", "playbook-version"] },
        },
        {
          slug: "verdict-board",
          name: "按结论看板",
          description: "没淋、淋雨、太热、不方便、待判各一列",
          type: "kanban",
          config: { stackByFieldSlug: "verdict", visibleFieldSlugs: ["date", "walk-hour", "city", "playbook-version"] },
        },
      ],
    },
    {
      key: "weather",
      slug: "kelly-dog-walk-weather",
      name: "天气数据",
      description:
        "Agent 自己从 Open-Meteo 抓的逐时数据（早 6 点到晚 10 点）：当时的预报和实际天气。这是裁判唯一认的证据；按「城市 + 日期 + 钟点」更新，不重复。",
      readLimit: 50,
      fields: [
        field("city", "城市", "text", { required: true }),
        field("date", "日期", "date", { required: true, options: { date: { includeTime: false } } }),
        field("hour", "钟点", "number", { required: true }),
        field("forecast-precip-prob", "预报降水概率 %", "number"),
        field("forecast-temp", "预报气温 °C", "number"),
        field("actual-precip-mm", "实际降水 mm", "number"),
        field("actual-temp", "实际气温 °C", "number"),
      ],
      views: [],
    },
  ],
  // Read-only by design: this AirApp never writes. Decisions are written by the trusted scripts,
  // and the playbook only changes through a ChangeRequest a human merges in Busabase itself.
  permissions: {
    readProcedures: [
      "nodes.get",
      "nodes.list",
      "records.list",
      "records.listPage",
      "records.groupBy",
      "fileTrees.readFile",
      "changeRequests.list",
    ],
    setupProcedures: [],
    writeProcedures: [],
  },
};
