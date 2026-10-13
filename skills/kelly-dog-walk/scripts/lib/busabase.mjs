// The trusted scripts' one Busabase boundary.
//
// Credentials come only from this process's environment — BUSABASE_BASE_URL, BUSABASE_API_KEY,
// BUSABASE_SPACE_ID — never from ~/.busabase/.env implicitly and never from the AirApp's session.
// Run it as the AGENT'S OWN member account: its node permissions are the gate (遛狗手册 = 可提交
// 变更, 裁判规则 = 只读). An admin or owner key bypasses 限制访问 and would make that gate a lie.
//
// Resources are found by what the template install stamped (`metadata.appId` + `resourceKey`),
// never by a node id pasted into config. The 裁判规则 Doc is the one node install does not stamp,
// so it is also accepted by its package slug until scripts/setup.mjs --apply stamps it.
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../../content/kelly-dog-walk-app/app/js/config.js";
import { decisionFields } from "../../content/kelly-dog-walk-app/app/js/view-model.js";

export const APP_ID = appConfig.appId;

export const connect = () => {
  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      "缺少 BUSABASE_BASE_URL。可信脚本只用这个进程自己的凭据（BUSABASE_BASE_URL / BUSABASE_API_KEY / BUSABASE_SPACE_ID），请用 Agent 自己的成员账号。",
    );
  }
  return createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });
};

const owned = (node, key) => node?.metadata?.appId === APP_ID && node?.metadata?.resourceKey === key;

const walk = (nodes, visit) => {
  for (const node of nodes || []) {
    visit(node);
    walk(node.children, visit);
  }
};

/**
 * The installed 遛狗不淋雨 folder and every node in it.
 * `folderId` picks one when the Space has more than one install.
 */
/**
 * @param {any} client
 * @param {{ folderId?: string }} [options]
 */
export const resolveWorkspace = async (client, options = {}) => {
  const { folderId } = options;
  let folder;
  if (folderId) {
    folder = (await client.nodes.get({ nodeId: folderId, type: "folder" })).node;
    if (!owned(folder, "app-root")) throw new Error(`${folderId} 不是 kelly-dog-walk 模板安装出来的文件夹`);
  } else {
    const tree = await client.nodes.list({ depth: 4 });
    const roots = [];
    walk(Array.isArray(tree) ? tree : tree.nodes, (node) => {
      if (node.type === "folder" && owned(node, "app-root")) roots.push(node);
    });
    if (roots.length === 0) {
      throw new Error(
        "这个 Space 里还没有安装「遛狗不淋雨」。先运行：npx busabase-cli@latest install skills/kelly-dog-walk，再运行 node skills/kelly-dog-walk/scripts/setup.mjs --apply",
      );
    }
    if (roots.length > 1) {
      throw new Error(
        `这个 Space 里装了 ${roots.length} 份「遛狗不淋雨」，用 --folder 指定一份：${roots.map((node) => `${node.name}（${node.id}）`).join("、")}`,
      );
    }
    folder = roots[0];
  }
  const detail = await client.nodes.get({ nodeId: folder.id, type: "folder" });
  const children = detail.children || [];
  const find = (key, type, { slugFallback = false } = {}) => {
    const matches = children.filter(
      (node) =>
        node.type === type && (owned(node, key) || (slugFallback && node.slug === key && !node.metadata?.appId)),
    );
    if (matches.length > 1) throw new Error(`「${folder.name}」里有 ${matches.length} 个 ${key}，没法确定用哪个`);
    return matches[0] || null;
  };
  const bases = {};
  for (const base of appConfig.bases) {
    const node = find(base.key, "base");
    bases[base.key] = node ? { ...base, nodeId: node.id, baseId: node.baseId } : null;
  }
  return {
    folder: detail.node,
    playbook: find(appConfig.nodes.playbook.key, "skill"),
    judge: find(appConfig.nodes.judge.key, "doc", { slugFallback: true }),
    app: find(appConfig.airApp.resourceKey, "airapp"),
    manual: find(APP_ID, "skill"),
    bases,
  };
};

export const requireNode = (node, label) => {
  if (!node)
    throw new Error(`「遛狗不淋雨」里缺少${label}。运行 node skills/kelly-dog-walk/scripts/setup.mjs 看看缺什么。`);
  return node;
};

/** The 遛狗手册's SKILL.md as it is now, plus the hash a ChangeRequest must be based on. */
export const readPlaybook = async (client, ws) => {
  const node = requireNode(ws.playbook, "遛狗手册");
  const file = await client.fileTrees.readFile({ nodeId: node.id, type: "skill", filePath: "SKILL.md" });
  return { content: file.content, contentHash: file.contentHash, nodeId: node.id };
};

export const readJudge = async (client, ws) => {
  const node = requireNode(ws.judge, "裁判规则");
  const detail = await client.nodes.get({ nodeId: node.id, type: "doc" });
  return { content: detail.body || "", nodeId: node.id };
};

const fieldsOf = (record) => record.headCommit?.payload || record.headCommit?.fields || record.fields || {};

/** Every record of a Base matching simple equality filters, following the cursor. */
export const listAll = async (client, baseId, filters = []) => {
  const rows = [];
  let cursor;
  do {
    const page = await client.records.list({
      baseId,
      limit: 100,
      ...(filters.length ? { filters } : {}),
      ...(cursor ? { cursor } : {}),
    });
    for (const record of page.records || []) rows.push({ id: record.id, fields: fieldsOf(record) });
    cursor = page.nextCursor || null;
  } while (cursor);
  return rows;
};

const textEquals = (fieldSlug, value) => ({ fieldSlug, fieldType: "text", operator: "equals", value });

/** Every record whose date field falls in [gte, lt), following numbered pages. */
export const listDateRange = async (client, baseId, { gte, lt }, filters = []) => {
  const rows = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const result = await client.records.listPage({
      baseId,
      page,
      pageSize: 100,
      dateRange: { fieldSlug: "date", gte, lt },
      ...(filters.length ? { filters } : {}),
    });
    pages = result.totalPages || 1;
    for (const record of result.records || []) rows.push({ id: record.id, fields: fieldsOf(record) });
  }
  return rows;
};

const nextDay = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

const BULK_LIMIT = 1000;
const chunks = (items, size) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

/**
 * Create-or-update by a natural key. One bulk-create and one bulk-update ChangeRequest per 1000
 * rows. These are data rows the agent account may write (可写入), so they merge on submit.
 */
const upsert = async (client, base, wanted, keyOf, loadExisting, message) => {
  const existing = new Map((await loadExisting()).map((row) => [keyOf(row.fields), row]));
  const creates = [];
  const updates = [];
  for (const fields of wanted) {
    const clean = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    const found = existing.get(keyOf(clean));
    if (!found) creates.push(clean);
    else if (Object.entries(clean).some(([slug, value]) => (found.fields[slug] ?? null) !== (value ?? null))) {
      updates.push({ recordId: found.id, fields: clean });
    }
  }
  const results = [];
  for (const batch of chunks(creates, BULK_LIMIT)) {
    results.push(
      await client.bases.createBulkChangeRequest({ baseId: base.baseId, records: batch, message, submittedBy: APP_ID }),
    );
  }
  for (const batch of chunks(updates, BULK_LIMIT)) {
    results.push(
      await client.bases.createBulkUpdateChangeRequest({
        baseId: base.baseId,
        updates: batch,
        message,
        submittedBy: APP_ID,
      }),
    );
  }
  const pending = results.filter((result) => result.status !== "merged").map((result) => result.id);
  return {
    created: creates.length,
    updated: updates.length,
    unchanged: wanted.length - creates.length - updates.length,
    pending,
  };
};

const dayKey = (fields) => `${fields.city}|${String(fields.date).slice(0, 10)}`;

export const upsertDecisions = (client, ws, rows, message) => {
  const base = requireNode(ws.bases.decisions, "每天的决定");
  const months = [...new Set(rows.map((row) => row.month))];
  const city = rows[0]?.city;
  return Promise.all(
    months.map((month) =>
      upsert(
        client,
        base,
        rows.filter((row) => row.month === month).map(decisionFields),
        dayKey,
        () => listAll(client, base.baseId, [textEquals("month", month), textEquals("city", city)]),
        message,
      ),
    ),
  ).then((parts) => ({
    created: parts.reduce((sum, part) => sum + part.created, 0),
    updated: parts.reduce((sum, part) => sum + part.updated, 0),
    unchanged: parts.reduce((sum, part) => sum + part.unchanged, 0),
    pending: parts.flatMap((part) => part.pending),
  }));
};

/** `data` is one compact month (or a single day) from scripts/lib/open-meteo.mjs. */
export const weatherFields = (city, date, hour, cell) => ({
  city,
  date,
  hour,
  "forecast-precip-prob": cell.prob ?? null,
  "forecast-temp": cell.ftemp ?? null,
  ...(cell.rain !== undefined ? { "actual-precip-mm": cell.rain } : {}),
  ...(cell.temp !== undefined ? { "actual-temp": cell.temp } : {}),
});

export const upsertWeather = async (client, ws, rows, message) => {
  const base = requireNode(ws.bases.weather, "天气数据");
  const city = rows[0]?.city;
  const dates = rows.map((row) => row.date).sort();
  return upsert(
    client,
    base,
    rows,
    (fields) => `${fields.city}|${String(fields.date).slice(0, 10)}|${Number(fields.hour)}`,
    () => listDateRange(client, base.baseId, { gte: dates[0], lt: nextDay(dates.at(-1)) }, [textEquals("city", city)]),
    message,
  );
};

/** One stored decision row for a city and date, or null. */
export const findDecision = async (client, ws, city, date) => {
  const base = requireNode(ws.bases.decisions, "每天的决定");
  const rows = await listAll(client, base.baseId, [textEquals("month", date.slice(0, 7)), textEquals("city", city)]);
  return rows.find((row) => String(row.fields.date).slice(0, 10) === date) || null;
};

export const updateDecision = (client, ws, recordId, fields, message) =>
  client.bases.createBulkUpdateChangeRequest({
    baseId: requireNode(ws.bases.decisions, "每天的决定").baseId,
    updates: [{ recordId, fields }],
    message,
    submittedBy: APP_ID,
  });
