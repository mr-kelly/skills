export function array(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value ? [value] : [];
    } catch {
      return value ? [value] : [];
    }
  }
  return value ? [value] : [];
}
export const relationIds = (value) =>
  array(value)
    .map((item) => (typeof item === "object" ? item.recordId || item.id || item.value : item))
    .filter(Boolean);
export function normalizeRecord(record, baseKey) {
  const fields = { ...(record.headCommit?.payload || record.headCommit?.fields || record.fields || {}) };
  for (const [key, value] of Object.entries(fields)) fields[key.replaceAll("-", "_")] = value;
  fields.sources = relationIds(fields.sources);
  fields.attachment = array(fields.attachment);
  fields.verified = fields.verified === true || fields.verified === "true";
  return { ...record, id: record.id || record.key, baseKey, fields };
}
export function filterRows(records, { query = "", topic = "", status = "" } = {}) {
  const needle = query.trim().toLocaleLowerCase();
  return records.filter(
    ({ fields: f }) =>
      (!topic || f.topic === topic) &&
      (!status || f.status === status) &&
      (!needle ||
        [f.title, f.summary, f.owner, f.search_text, f.outline, f.review_note].some((text) =>
          String(text || "")
            .toLocaleLowerCase()
            .includes(needle),
        )),
  );
}
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  return Array.from(
    { length: 42 },
    (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
  );
}
export function calendarRange(year, month) {
  const days = monthGrid(year, month);
  return {
    fieldSlug: "publish-date",
    gte: days[0].toISOString(),
    lt: new Date(days[41].getFullYear(), days[41].getMonth(), days[41].getDate() + 1).toISOString(),
  };
}
export function dayKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function mergeRows(current, additional) {
  return [...new Map([...current, ...additional].map((row) => [row.id, row])).values()];
}
export const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

export function resolveOwnedBases(config, folder, children) {
  const owned = (node, key) => node?.metadata?.appId === config.appId && node?.metadata?.resourceKey === key;
  if (!owned(folder, "app-root") || folder.metadata.schemaVersion !== config.schemaVersion)
    throw new Error("SCHEMA_INCOMPLETE: 这个目录不属于当前版本的公众号内容工作台。");
  return config.bases.map((base) => {
    const matches = children.filter((node) => node.type === "base" && owned(node, base.key));
    if (matches.length !== 1 || !matches[0].baseId || matches[0].metadata.schemaVersion !== config.schemaVersion)
      throw new Error(`SCHEMA_INCOMPLETE: 缺少、重复或不兼容的${base.name}。`);
    return { ...base, ...matches[0], nodeId: matches[0].id };
  });
}
