import { appConfig, statuses } from "../config.js";
import { normalizeRecord } from "../model.js";
export async function createDemoProvider() {
  const response = await fetch("demo-data.json");
  if (!response.ok) throw new Error("演示资料尚未准备好。");
  const payload = await response.json();
  const records = Object.fromEntries(
    appConfig.bases.map((base) => [
      base.key,
      (payload[base.key] || []).map((record) => normalizeRecord(record, base.key)),
    ]),
  );
  return {
    demo: true,
    resources: { folder: { name: appConfig.appName }, bases: appConfig.bases },
    async load() {
      return {
        records,
        pages: { sources: { nextCursor: null }, articles: { nextCursor: null } },
        counts: {
          sources: records.sources.length,
          articles: records.articles.length,
          review: records.articles.filter((row) => row.fields.status === "review").length,
          unverified: records.sources.filter((row) => !row.fields.verified).length,
        },
        groups: statuses.map(({ id }) => ({
          value: id,
          count: records.articles.filter((row) => row.fields.status === id).length,
        })),
      };
    },
    async calendar(range, page = 1) {
      const rows = records.articles.filter(
        (row) =>
          row.fields.publish_date &&
          new Date(row.fields.publish_date) >= new Date(range.gte) &&
          new Date(row.fields.publish_date) < new Date(range.lt),
      );
      return {
        records: rows.slice((page - 1) * 50, page * 50),
        total: rows.length,
        totalPages: Math.ceil(rows.length / 50),
      };
    },
    async detail(baseKey, id) {
      return records[baseKey].find((row) => row.id === id) || null;
    },
    nativeUrl() {
      return "";
    },
  };
}
