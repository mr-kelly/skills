import { createBusabaseClient } from "busabase-sdk";

import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

export { appConfig };

// Operator mistakes (missing credential, missing file, workspace not ready) are
// expected outcomes, not crashes. Print one line and exit; a stack trace here
// only buries the sentence that says what to do.
export function fail(message) {
  console.error(message);
  process.exit(1);
}

const required = (name) => {
  const value = process.env[name];
  if (!value) fail(`缺少环境变量 ${name}。可信脚本需要自己的 Busabase 凭据，不会借用 AirApp 会话。`);
  return value;
};

// Trusted scripts carry their own credentials. They never borrow the AirApp's
// ambient browser session, and nothing they read ends up in browser code.
export function createTrustedClient() {
  return createBusabaseClient({
    baseUrl: required("BUSABASE_BASE_URL"),
    apiKey: required("BUSABASE_API_KEY"),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });
}

export async function resolveBases(client) {
  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    const names = resources.missing.map((base) => base.name).join("、");
    fail(`Busabase 工作区还没就绪，缺少：${names || appConfig.folder.name}。先在 AirApp 里点一次「初始化工作区」。`);
  }
  return new Map(resources.bases.map((base) => [base.key, base]));
}

const snakeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

// Transport pagination is owned here, not declared per Base. The API caps a
// page at 100 and `research` routinely produces more contact addresses than
// that, so every read follows nextCursor to exhaustion.
const BUSABASE_RECORD_PAGE_SIZE = 100;

export async function readAll(client, base) {
  const rows = [];
  const seenCursors = new Set();
  let cursor = null;
  do {
    const page = await client.records.list({
      baseId: base.baseId,
      limit: BUSABASE_RECORD_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    for (const record of page.records || []) {
      rows.push({ id: record.id, fields: snakeFields(record.headCommit?.fields || record.fields) });
    }
    cursor = page.nextCursor || null;
    if (cursor && seenCursors.has(cursor)) throw new Error(`PAGINATION_LOOP: ${base.key}`);
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return rows;
}

// `bases.createBulkChangeRequest` has no autoMerge flag — a bulk import is
// always proposed for review. Running this script with --apply IS the operator's
// approval, so approve and merge it explicitly instead of leaving it pending.
//
// Both review and merge are batch endpoints keyed by `changeRequestIds`; there
// is no per-id variant, and passing `changeRequestId` fails validation with
// "expected array, received undefined".
export async function mergeChangeRequest(client, changeRequest) {
  if (!changeRequest?.id || changeRequest.status === "merged") return changeRequest;
  const changeRequestIds = [changeRequest.id];
  await client.changeRequests.review({ changeRequestIds, verdict: "approved" });
  const result = await client.changeRequests.merge({ changeRequestIds });
  const merged = result?.results?.[0] || result?.[0] || result;
  return merged?.changeRequest || merged;
}

// busabase-sdk deliberately strips the Vault from its cloud client
// (`const { vault: _localVault, ...cloudWorkbenchRoutes }`): the Vault is a
// local/self-hosted Busabase capability, not a Cloud API surface. So talk to
// /api/v1/vault directly, and treat "this server has no Vault" as a normal
// answer rather than a crash.
const vaultRequest = async (method, body) => {
  const baseUrl = required("BUSABASE_BASE_URL").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/v1/vault`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(process.env.BUSABASE_API_KEY ? { authorization: `Bearer ${process.env.BUSABASE_API_KEY}` } : {}),
      ...(process.env.BUSABASE_SPACE_ID ? { "x-busabase-space": process.env.BUSABASE_SPACE_ID } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new Error(`VAULT_HTTP_${response.status}: ${await response.text()}`);
  return response.json();
};

export const vaultUnavailableHint =
  "这台 Busabase 没有 Vault（Busabase Cloud 不提供本地 Vault）。改用环境变量 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS 运行发送脚本。";

// The Vault API is a full-document PUT, not an upsert: sending only your own
// keys deletes every other item on the instance. Always read, merge by key,
// write the whole set back.
export async function upsertVaultItems(items) {
  const current = await vaultRequest("GET");
  if (current === null) return null;
  const byKey = new Map((current.items || []).map((item) => [item.key, item]));
  for (const item of items) byKey.set(item.key, { ...(byKey.get(item.key) || {}), ...item });
  const merged = [...byKey.values()].map(({ id, scopeId, createdAt, updatedAt, lastUsedAt, ...rest }) => {
    void id;
    void scopeId;
    void createdAt;
    void updatedAt;
    void lastUsedAt;
    return rest;
  });
  return vaultRequest("PUT", { items: merged });
}

// Reads secret values, so this may only ever run inside a trusted script.
// Falls back to the process environment when the instance has no Vault.
export async function readVaultValues(keys) {
  const current = await vaultRequest("GET");
  if (current === null) {
    return { values: Object.fromEntries(keys.map((key) => [key, process.env[key] || ""])), source: "environment" };
  }
  const byKey = new Map((current.items || []).map((item) => [item.key, item.value]));
  return {
    values: Object.fromEntries(keys.map((key) => [key, byKey.get(key) || process.env[key] || ""])),
    source: "vault",
  };
}

export const parseFlags = (argv) => ({
  apply: argv.includes("--apply"),
  positional: argv.filter((value) => !value.startsWith("--")),
});

export const dryRunBanner = (apply) => (apply ? "" : "预演模式（未写入任何数据）。确认无误后加 --apply 真正执行。\n");
