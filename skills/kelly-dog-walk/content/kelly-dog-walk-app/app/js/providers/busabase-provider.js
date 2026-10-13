// Live mode: read the installed 遛狗不淋雨 folder through busabase-sdk. Read-only — this AirApp
// never writes. Decisions are written by the trusted scripts; the playbook changes only through a
// ChangeRequest a person merges in Busabase itself.
//
// Every read is bounded: the month index is two aggregate calls, and opening a month reads one
// page of at most 31 decisions plus one page of at most 31 weather rows. Nothing follows a cursor.
import { createBusabaseClient } from "../../vendor/busabase-sdk.js";
import { appConfig } from "../config.js";
import { buildMonths, dayFromDecision } from "../view-model.js";
import { parseJudgeRules, parseRuleCard } from "../walk-model.js";

const allowed = new Set(appConfig.permissions.readProcedures);
const need = (procedure) => {
  if (!allowed.has(procedure)) throw new Error(`PROCEDURE_DENIED: ${procedure}`);
};
const owned = (node, key) => node?.metadata?.appId === appConfig.appId && node?.metadata?.resourceKey === key;
const fieldsOf = (record) => record.headCommit?.payload || record.headCommit?.fields || record.fields || {};
const base = (key) => appConfig.bases.find((item) => item.key === key);
const textEquals = (fieldSlug, value) => ({ fieldSlug, fieldType: "text", operator: "equals", value });

const findRootFolders = (nodes, out = []) => {
  for (const node of nodes || []) {
    if (node.type === "folder" && owned(node, "app-root")) out.push(node);
    findRootFolders(node.children, out);
  }
  return out;
};

const nextMonth = (month) => {
  const [year, mon] = month.split("-").map(Number);
  return mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
};

export async function createBusabaseProvider({ spaceId } = {}) {
  const client = createBusabaseClient({ baseUrl: window.location.origin, ...(spaceId ? { spaceId } : {}) });
  let ctx = null;

  /** `?folder=` first; then the folder this AirApp node lives in; then the only install in the Space. */
  const resolveFolder = async () => {
    need("nodes.get");
    const query = new URLSearchParams(window.location.search).get("folder");
    if (query) return query;
    const appNodeId = window.location.pathname.match(/\/api\/airapp-preview\/([^/]+)/)?.[1];
    if (appNodeId) {
      const detail = await client.nodes.get({ nodeId: appNodeId, type: "airapp" });
      if (owned(detail.node, appConfig.airApp.resourceKey)) return detail.node.parentId;
    }
    need("nodes.list");
    const tree = await client.nodes.list({ depth: 4 });
    const roots = findRootFolders(Array.isArray(tree) ? tree : tree.nodes);
    if (roots.length === 1) return roots[0].id;
    if (!roots.length) throw new Error("SETUP_REQUIRED: 这个 Space 里还没有安装「遛狗不淋雨」模板。");
    throw new Error(
      `SETUP_REQUIRED: 这个 Space 里有 ${roots.length} 份「遛狗不淋雨」，在网址后加 ?folder=<文件夹 id> 选一份。`,
    );
  };

  /** Dates that have a decision (optionally only 淋雨 ones), grouped per month — one aggregate call. */
  const perMonth = async (baseId, city, verdict) => {
    need("records.groupBy");
    const valueFilters = [{ fieldSlug: "city", operator: "eq", value: city }];
    if (verdict) valueFilters.push({ fieldSlug: "verdict", operator: "eq", value: verdict });
    const result = await client.records.groupBy({ baseId, fieldSlug: "date", bucketing: "sql", valueFilters });
    const counts = new Map();
    for (const group of result.groups || []) {
      const month = String(group.value).slice(0, 7);
      counts.set(month, (counts.get(month) || 0) + Number(group.count || 0));
    }
    return counts;
  };

  return {
    mode: "live",
    async load() {
      const folderId = await resolveFolder();
      const detail = await client.nodes.get({ nodeId: folderId, type: "folder" });
      const children = detail.children || [];
      const pick = (key, type, slugFallback = false) =>
        children.find((node) => node.type === type && (owned(node, key) || (slugFallback && node.slug === key)));
      const playbookNode = pick(appConfig.nodes.playbook.key, "skill");
      const judgeNode = pick(appConfig.nodes.judge.key, "doc", true);
      const decisionsNode = pick("decisions", "base");
      const weatherNode = pick("weather", "base");
      const missing = [
        [playbookNode, "遛狗手册"],
        [judgeNode, "裁判规则"],
        [decisionsNode, "每天的决定"],
      ].filter(([node]) => !node);
      if (missing.length) {
        throw new Error(
          `SCHEMA_INCOMPLETE: 「${detail.node.name}」里缺少 ${missing.map(([, name]) => name).join("、")}。`,
        );
      }

      need("fileTrees.readFile");
      const playbook = await client.fileTrees.readFile({
        nodeId: playbookNode.id,
        type: "skill",
        filePath: appConfig.nodes.playbook.file,
      });
      const judgeDoc = await client.nodes.get({ nodeId: judgeNode.id, type: "doc" });
      const card = parseRuleCard(playbook.content);
      const judge = parseJudgeRules(judgeDoc.body || "");

      // The city: the most common one on the newest page of decisions (one bounded page).
      need("records.list");
      const sample = await client.records.list({ baseId: decisionsNode.baseId, limit: base("decisions").readLimit });
      const cities = new Map();
      for (const record of sample.records || []) {
        const city = fieldsOf(record).city;
        if (city) cities.set(city, (cities.get(city) || 0) + 1);
      }
      const city = [...cities.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";

      const index = [];
      if (city) {
        const [days, wet] = await Promise.all([
          perMonth(decisionsNode.baseId, city),
          perMonth(decisionsNode.baseId, city, "淋雨"),
        ]);
        for (const month of [...days.keys()].sort())
          index.push({ month, days: days.get(month), wet: wet.get(month) || 0 });
      }

      let pending = null;
      try {
        need("changeRequests.list");
        const result = await client.changeRequests.list({
          affectsNodeId: playbookNode.id,
          status: "in_review",
          limit: 20,
        });
        const items = result.changeRequests || result.items || (Array.isArray(result) ? result : []);
        pending = items.filter((item) => item.status === "in_review").length;
      } catch {
        pending = null;
      }

      ctx = { decisionsNode, weatherNode, judge, card, city };
      return {
        mode: "live",
        place: { name: city },
        folderName: detail.node.name,
        judge,
        card,
        playbookMarkdown: playbook.content,
        baseline: { version: "v1", hour: card.defaultHour },
        index,
        closed: [],
        judgeChanges: [],
        translations: null,
        pending,
      };
    },

    /** One month: one page of decisions (≤ 31) and one page of baseline weather (≤ 31). */
    async loadMonth(month) {
      if (!ctx) throw new Error("load() first");
      const { decisionsNode, weatherNode, judge, card, city } = ctx;
      const page = await client.records.list({
        baseId: decisionsNode.baseId,
        limit: base("decisions").readLimit,
        filters: [textEquals("month", month), textEquals("city", city)],
      });
      const days = (page.records || []).map((record) => dayFromDecision(fieldsOf(record), judge));
      // "Still on v1" = every day at the default hour, judged on that hour's 天气数据 row.
      let baselineByDate = null;
      if (weatherNode) {
        need("records.listPage");
        const weather = await client.records.listPage({
          baseId: weatherNode.baseId,
          page: 1,
          pageSize: base("decisions").readLimit,
          dateRange: { fieldSlug: "date", gte: `${month}-01`, lt: `${nextMonth(month)}-01` },
          filters: [
            textEquals("city", city),
            { fieldSlug: "hour", fieldType: "number", operator: "equals", value: card.defaultHour },
          ],
        });
        baselineByDate = {};
        for (const record of weather.records || []) {
          const row = fieldsOf(record);
          const rain = row["actual-precip-mm"];
          if (rain === null || rain === undefined) continue;
          const temp = row["actual-temp"];
          baselineByDate[String(row.date).slice(0, 10)] = {
            rain: Number(rain),
            temp: temp === null || temp === undefined ? null : Number(temp),
          };
        }
      }
      return buildMonths(days, { judge, baselineHour: card.defaultHour, baselineByDate })[0] || null;
    },
  };
}
