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
    fail(
      `Busabase 工作区还没就绪，缺少：${names || appConfig.folder.name}。\n先跑 node scripts/setup.mjs --apply，或在 AirApp 里点一次「初始化工作区」。`,
    );
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
// (`const { vault: _localVault, ...cloudWorkbenchRoutes }`): /api/v1/vault is a
// local/self-hosted Busabase route, not a Cloud API surface. So talk to it
// directly, and treat "this server has no Vault route" as a normal answer
// rather than a crash.
//
// A 404 here means "this is Cloud", NOT "you have no Vault". Cloud does have
// one — account-level, behind a browser session (`vault.reveal` over /api/rpc);
// a workspace API key gets 401 there by design. Cloud delivers those secrets a
// different way: every item marked `access.runtime` is injected into the
// environment of the task it starts, merging personal, Space, and API-key
// scopes. That is why credentials are read from the environment first below.
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

// Cloud has a Vault; it just is not writable with a workspace API key. Say what
// to do there instead of claiming the feature is missing.
export const vaultWriteUnavailableHint = [
  "这台 Busabase 没有本地 Vault 写入接口（/api/v1/vault），说明你连的是 Busabase Cloud。",
  "Cloud 的 Vault 是账户级的，只能在网页里改，工作区 API Key 没有权限写：",
  "  1. 打开 Busabase Cloud → Vault，在 Space 或 Agent 作用域新建 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS；",
  "  2. 四项都勾上 runtime（运行时注入），SMTP_PASS 建议关掉 reveal；",
  "  3. 开一个新的 Session 再跑发送脚本——已经在跑的会话不会拿到新值。",
].join("\n");

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

export const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];

// Host and port for the mailboxes a Chinese job seeker actually sends from.
// Only the non-secret half of a config can be derived like this — a password is
// never guessable, so it stays required.
const SMTP_PROVIDERS = new Map([
  ["qq.com", { host: "smtp.qq.com", port: "465" }],
  ["foxmail.com", { host: "smtp.qq.com", port: "465" }],
  ["163.com", { host: "smtp.163.com", port: "465" }],
  ["126.com", { host: "smtp.126.com", port: "465" }],
  ["yeah.net", { host: "smtp.yeah.net", port: "465" }],
  ["sina.com", { host: "smtp.sina.com", port: "465" }],
  ["aliyun.com", { host: "smtp.aliyun.com", port: "465" }],
  ["gmail.com", { host: "smtp.gmail.com", port: "465" }],
  ["outlook.com", { host: "smtp.office365.com", port: "587" }],
  ["hotmail.com", { host: "smtp.office365.com", port: "587" }],
]);

export function deriveSmtpSettings(fromEmail) {
  const domain = String(fromEmail || "")
    .split("@")[1]
    ?.trim()
    .toLowerCase();
  const provider = domain ? SMTP_PROVIDERS.get(domain) : null;
  if (!provider) return {};
  return { SMTP_HOST: provider.host, SMTP_PORT: provider.port, SMTP_USER: fromEmail };
}

// Resolves the four SMTP settings and reports where each one came from, so a
// dry run can say which single item is missing instead of "未配置".
//
// Environment beats Vault on purpose. On Cloud the environment is the only
// channel (runtime injection), and locally an explicitly exported value is the
// more specific answer — it is how you override one mailbox for one run.
//
// Reads a secret value, so this may only ever run inside a trusted script.
/** @param {{ fromEmail?: string }} [options] */
export async function resolveSmtpSettings({ fromEmail } = {}) {
  const derived = deriveSmtpSettings(fromEmail);
  const resolved = new Map();

  for (const key of SMTP_KEYS) {
    if (process.env[key]) resolved.set(key, { value: process.env[key], source: "environment" });
  }

  // Only ask the Vault about what is still missing: when the environment
  // already carries everything, this is Cloud and the round trip would 404.
  let vaultAvailable = null;
  if (resolved.size < SMTP_KEYS.length) {
    const current = await vaultRequest("GET");
    vaultAvailable = current !== null;
    if (current) {
      for (const item of current.items || []) {
        if (SMTP_KEYS.includes(item.key) && item.value && !resolved.has(item.key)) {
          resolved.set(item.key, { value: item.value, source: "vault" });
        }
      }
    }
  }

  // A derived host never overrides a configured one; it only fills a blank.
  for (const [key, value] of Object.entries(derived)) {
    if (!resolved.has(key)) resolved.set(key, { value, source: "derived" });
  }

  const status = SMTP_KEYS.map((key) => ({
    key,
    ready: Boolean(resolved.get(key)?.value),
    source: resolved.get(key)?.source || null,
  }));

  return {
    values: Object.fromEntries(SMTP_KEYS.map((key) => [key, resolved.get(key)?.value || ""])),
    status,
    missing: status.filter((item) => !item.ready).map((item) => item.key),
    ready: status.every((item) => item.ready),
    vaultAvailable,
  };
}

// What to do about the keys that are still missing. Which sentence is right
// depends on whether this Busabase can store them at all.
export function smtpMissingHint(missing, vaultAvailable) {
  const keys = missing.join(" / ");
  if (vaultAvailable) {
    return `缺 ${keys}。跑 node scripts/configure_smtp.mjs --host ... --user ... --pass ... --apply 写进 Vault。`;
  }
  return [
    `缺 ${keys}。这台是 Busabase Cloud，凭据只能靠运行时注入：`,
    `  1. 在 Busabase Cloud → Vault 的 Space 或 Agent 作用域里配置 ${keys}，勾上 runtime；`,
    "  2. 开一个新的 Session——配置发生在会话启动之后时，当前进程不会拿到新值；",
    `  3. 或者临时用环境变量跑：${missing.map((key) => `${key}=...`).join(" ")} node scripts/send_emails.mjs --apply`,
  ].join("\n");
}

export const parseFlags = (argv) => ({
  apply: argv.includes("--apply"),
  positional: argv.filter((value) => !value.startsWith("--")),
});

export const dryRunBanner = (apply) => (apply ? "" : "预演模式（未写入任何数据）。确认无误后加 --apply 真正执行。\n");
