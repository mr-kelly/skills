import { createBusabaseClient } from "../../vendor/busabase-sdk.js";
import { appConfig } from "../config.js";
import { normalizeRecord, resolveOwnedBases } from "../model.js";

const owned = (node, key) => node?.metadata?.appId === appConfig.appId && node?.metadata?.resourceKey === key;

export async function createBusabaseProvider({ spaceId } = {}) {
  const client = createBusabaseClient({ baseUrl: window.location.origin, ...(spaceId ? { spaceId } : {}) });
  const query = new URLSearchParams(window.location.search);
  const appNodeId = window.location.pathname.match(/\/api\/airapp-preview\/([^/]+)/)?.[1];
  let folderId = query.get("folder");
  if (appNodeId) {
    const appDetail = await client.nodes.get({ nodeId: appNodeId, type: "airapp" });
    const node = appDetail.node || appDetail;
    if (!owned(node, appConfig.airApp.resourceKey)) throw new Error("SCHEMA_INCOMPLETE: 工作台节点不属于此场景。");
    folderId = node.parentId;
  }
  if (!folderId)
    throw new Error("SCHEMA_INCOMPLETE: 请在已安装的公众号内容工作台目录打开此应用。本地预览需明确指定 folder。");
  const folderDetail = await client.nodes.get({ nodeId: folderId, type: "folder" });
  const folder = folderDetail.node || folderDetail;
  const children = folderDetail.children || (await client.nodes.list({ parentId: folderId, depth: 1 }));
  const bases = resolveOwnedBases(appConfig, folder, children);
  const views = await Promise.all(bases.map((base) => client.bases.listViews({ baseId: base.baseId })));
  bases.forEach((base, index) => {
    base.views = views[index];
  });
  const byKey = new Map(bases.map((base) => [base.key, base]));
  const read = async (key, cursor) => {
    const page = await client.records.list({ baseId: byKey.get(key).baseId, limit: 50, ...(cursor ? { cursor } : {}) });
    return { records: page.records.map((row) => normalizeRecord(row, key)), nextCursor: page.nextCursor };
  };
  const count = async (key, valueFilters) =>
    (await client.records.count({ baseId: byKey.get(key).baseId, ...(valueFilters ? { valueFilters } : {}) })).total;
  return {
    demo: false,
    resources: { folder, bases },
    async load() {
      const [sources, articles, sourceCount, articleCount, review, unverified, grouped] = await Promise.all([
        read("sources"),
        read("articles"),
        count("sources"),
        count("articles"),
        count("articles", [{ fieldSlug: "status", operator: "eq", value: "review" }]),
        count("sources", [{ fieldSlug: "verified", operator: "eq", value: false }]),
        client.records.groupBy({ baseId: byKey.get("articles").baseId, fieldSlug: "status" }),
      ]);
      return {
        records: { sources: sources.records, articles: articles.records },
        pages: { sources, articles },
        counts: { sources: sourceCount, articles: articleCount, review, unverified },
        groups: grouped.groups,
      };
    },
    more: read,
    async calendar(dateRange, page = 1) {
      const result = await client.records.listPage({
        baseId: byKey.get("articles").baseId,
        dateRange,
        page,
        pageSize: 50,
      });
      return { ...result, records: result.records.map((row) => normalizeRecord(row, "articles")) };
    },
    async detail(baseKey, id) {
      const record = await client.records.get({ recordId: id });
      if (record.baseId !== byKey.get(baseKey).baseId) throw new Error("PROCEDURE_DENIED: 记录不属于当前工作台。");
      return normalizeRecord(record, baseKey);
    },
    nativeUrl(key, viewName, recordId) {
      const base = byKey.get(key);
      const view = base.views.find((item) => item.name === viewName);
      const root = `/dashboard/${encodeURIComponent(spaceId || "local")}`;
      return `${root}/base/${encodeURIComponent(base.slug)}${recordId ? `/${encodeURIComponent(recordId)}` : view ? `/${encodeURIComponent(view.slug)}` : ""}`;
    },
  };
}
