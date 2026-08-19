import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";

import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

export { appConfig };

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app");

// Everything the deployed AirApp needs to `npm install && npm run dev` — the
// whole project except local/generated noise. publishAirApp only ever
// creates/updates paths from this list (see buildAirAppFileOperations), so
// omitting a directory here just means it never reaches the deployed AirApp,
// not that anything gets deleted there.
const SKIP_NAMES = new Set(["node_modules", ".git", ".DS_Store", "coverage", "test-results", "playwright-report"]);

export async function readAirAppFiles(dir = appRoot, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (SKIP_NAMES.has(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readAirAppFiles(abs, rel)));
    } else {
      files.push({ path: rel, content: await readFile(abs, "utf8") });
    }
  }
  return files;
}

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
      rows.push({
        id: record.id,
        fields: snakeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
      });
    }
    cursor = page.nextCursor || null;
    if (cursor && seenCursors.has(cursor)) throw new Error(`PAGINATION_LOOP: ${base.key}`);
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return rows;
}

// This script never passes `autoMerge` to `bases.createBulkChangeRequest` —
// but the field exists on the API (`createBulkChangeRequestInputSchema`),
// and omitting it does NOT mean "stays pending": with write permission the
// server's permission-aware default (`shouldAutoMerge`) merges it
// immediately anyway. Running this script with --apply IS the operator's
// approval, so approve and merge it explicitly here too, so the outcome does
// not depend on which permission the caller's credential happens to have.
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
// Since 2026-08-13 (busabase-cloud abe3453a1a) Cloud also answers
// GET/PUT /api/v1/vault with 200 — it no longer 404s here. A workspace API
// key CAN list and write items, but every `.value` in the response is masked
// to "" (see `maskVaultSettings` in apps/busabase-cloud), so this channel is
// never a source of the real secret on Cloud. Real values for API-key
// credentials come from `vaultRuntimeRequest` below, over the dedicated
// /api/v1/vault/runtime surface Cloud added the same day.
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

// Cloud-only surface (self-hosted Busabase has no such route, hence the 404
// guard): returns the *unmasked* values a workbench API key is entitled to at
// runtime — every item marked `access.runtime`, merged personal → Space →
// API-key scope, exactly like the environment a Cloud-started task would get.
// Unlike environment injection this is a live HTTP call, so a value saved in
// the Vault after this process started is still visible on the next request
// — no new Session required.
const vaultRuntimeRequest = async () => {
  const baseUrl = required("BUSABASE_BASE_URL").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/v1/vault/runtime`, {
    headers: {
      ...(process.env.BUSABASE_API_KEY ? { authorization: `Bearer ${process.env.BUSABASE_API_KEY}` } : {}),
      ...(process.env.BUSABASE_SPACE_ID ? { "x-busabase-space": process.env.BUSABASE_SPACE_ID } : {}),
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`VAULT_RUNTIME_HTTP_${response.status}: ${await response.text()}`);
  return response.json();
};

// vaultRequest("GET") answered 404/403 for /api/v1/vault. Since 2026-08-13
// Cloud no longer 404s here (it answers 200 with masked values instead), so
// this now means the write really is unreachable — a permission-restricted
// API key, or a Busabase build without the Vault route — not "this is Cloud"
// specifically. Point at the one place a write always works: the web UI.
export const vaultWriteUnavailableHint = [
  "这台 Busabase 拒绝了 Vault 写入接口（/api/v1/vault），本地脚本没法直接写密钥。",
  "去 Busabase 网页会话里配置，工作区 API Key 写不了：",
  "  1. 打开 Busabase → Vault，在 Space 或 Agent 作用域新建 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS；",
  "  2. 四项都勾上 runtime（运行时注入），SMTP_PASS 建议关掉 reveal；",
  "  3. 存好之后直接重跑发送脚本——/api/v1/vault/runtime 是实时查询，不用重开 Session。",
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

// Host and port for common mailboxes used by a seller.
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
  // already carries everything there is no round trip to make.
  //
  // /api/v1/vault/runtime is a Cloud-only route (self-hosted Busabase 404s
  // on it), so whether it answers at all doubles as the "is this Cloud"
  // signal `smtpMissingHint` needs — `vaultAvailable` alone stopped meaning
  // that once Cloud started answering plain /api/v1/vault with 200 (masked)
  // instead of 404.
  let vaultAvailable = null;
  let isCloud = false;
  if (resolved.size < SMTP_KEYS.length) {
    const runtimeValues = await vaultRuntimeRequest();
    if (runtimeValues) {
      vaultAvailable = true;
      isCloud = true;
      for (const key of SMTP_KEYS) {
        if (runtimeValues[key] && !resolved.has(key)) {
          resolved.set(key, { value: runtimeValues[key], source: "vault-runtime" });
        }
      }
    }

    if (resolved.size < SMTP_KEYS.length) {
      const current = await vaultRequest("GET");
      if (vaultAvailable === null) vaultAvailable = current !== null;
      if (current) {
        vaultAvailable = true;
        for (const item of current.items || []) {
          if (SMTP_KEYS.includes(item.key) && item.value && !resolved.has(item.key)) {
            resolved.set(item.key, { value: item.value, source: "vault" });
          }
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
    isCloud,
  };
}

// What to do about the keys that are still missing. Which sentence is right
// depends on whether this Busabase can store them at all.
export function smtpMissingHint(missing, vaultAvailable, isCloud) {
  const keys = missing.join(" / ");
  // `isCloud` — not `vaultAvailable` — is the write-path signal: since
  // 2026-08-13 Cloud answers /api/v1/vault with 200 too, so `vaultAvailable`
  // no longer tells local vs. Cloud on its own (see the comment on
  // `vaultRequest` above). Whether /api/v1/vault/runtime answered does.
  if (isCloud) {
    return [
      `缺 ${keys}。这台是 Busabase Cloud，工作区 API Key 写不了 Vault：`,
      `  1. 在 Busabase Cloud → Vault 的 Space 或 Agent 作用域里配置 ${keys}，勾上 runtime；`,
      "  2. 存好之后直接重跑这个脚本——/api/v1/vault/runtime 是实时查询，不用重开 Session；",
      `  3. 或者临时用环境变量跑：${missing.map((key) => `${key}=...`).join(" ")} node scripts/send_emails.mjs --apply`,
    ].join("\n");
  }
  if (vaultAvailable) {
    return `缺 ${keys}。跑 node scripts/configure_smtp.mjs --host ... --user ... --pass ... --apply 写进 Vault。`;
  }
  return `缺 ${keys}。这台 Busabase 没有可用的 Vault，临时用环境变量跑：${missing.map((key) => `${key}=...`).join(" ")} node scripts/send_emails.mjs --apply`;
}

export const parseFlags = (argv) => ({
  apply: argv.includes("--apply"),
  positional: argv.filter((value) => !value.startsWith("--")),
});

export const dryRunBanner = (apply) => (apply ? "" : "预演模式（未写入任何数据）。确认无误后加 --apply 真正执行。\n");
