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
// A 404 here means "this instance does not serve that route", NOT "you have no
// Vault" — the two are easy to confuse and the confusion is expensive.
//
// Cloud serves both routes now. Its Vault is account-level and scoped per
// personal / Space / API key, and it answers `/api/v1/vault` with every secret
// masked to "" — existence, scope, and access policy, never a value. Values come
// from `/api/v1/vault/runtime`, bounded to items marked `access.runtime`: the
// same set Cloud injects into a task's environment at startup, minus the
// requirement to have restarted since they were saved.
//
// A self-hosted instance serves `/api/v1/vault` with real values and has no
// runtime route. Which routes answer is therefore the only reliable way to tell
// the two apart — not a guess from the base URL.
const vaultRequest = async (method, body, path = "/api/v1/vault") => {
  const baseUrl = required("BUSABASE_BASE_URL").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
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

export const vaultWriteUnavailableHint = [
  "这台 Busabase 没有 /api/v1/vault 写入接口。",
  "改用环境变量运行发送脚本：SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS。",
].join("\n");

// The Vault API is a full-document PUT, not an upsert: sending only your own
// keys deletes every other item in the scope. Always read, merge by key, write
// the whole set back.
export async function upsertVaultItems(items) {
  const current = await vaultRequest("GET");
  if (current === null) return null;

  // Two rules that only matter on Cloud, and both cost data when broken:
  //
  // Keep `id`. Cloud masks every secret to "" on read, and reads "blank secret"
  // as "keep the stored value" — matched by id first. Strip it and this write
  // blanks every secret in the scope that this script did not set itself.
  //
  // Write back only the personal scope. Cloud takes the target scope from the
  // items, so echoing back Space-scoped items it also returned would either be
  // refused as a mixed batch or relocate them. They are not ours to rewrite.
  const mine = (current.items || []).filter((item) => (item.scopeType ?? "personal") === "personal");
  const byKey = new Map(mine.map((item) => [item.key, item]));
  for (const item of items) byKey.set(item.key, { ...(byKey.get(item.key) || {}), ...item });
  const merged = [...byKey.values()].map(({ createdAt, updatedAt, lastUsedAt, ...rest }) => {
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
  // already carries everything, the round trip cannot change the answer.
  let vaultAvailable = null;
  let runtimeAvailable = null;
  if (resolved.size < SMTP_KEYS.length) {
    const current = await vaultRequest("GET");
    vaultAvailable = current !== null;
    if (current) {
      for (const item of current.items || []) {
        // On Cloud every secret here is masked to "", so this fills in the
        // non-secret half and leaves the password to the runtime route below.
        if (SMTP_KEYS.includes(item.key) && item.value && !resolved.has(item.key)) {
          resolved.set(item.key, { value: item.value, source: "vault" });
        }
      }
    }
  }

  // Cloud only. This is where a secret's value actually comes from there, and
  // asking for it beats the alternative the operator would otherwise be told:
  // save the item, then restart the session so the injection picks it up.
  if (resolved.size < SMTP_KEYS.length) {
    const runtime = await vaultRequest("GET", null, "/api/v1/vault/runtime");
    runtimeAvailable = runtime !== null;
    if (runtime) {
      for (const key of SMTP_KEYS) {
        if (runtime[key] && !resolved.has(key)) {
          resolved.set(key, { value: runtime[key], source: "vault-runtime" });
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
    runtimeAvailable,
  };
}

// What to do about the keys that are still missing. Which sentence is right
// depends on what this Busabase actually serves — not on a guess from the URL.
/** @param {{ vaultAvailable?: boolean | null, runtimeAvailable?: boolean | null }} [capabilities] */
export function smtpMissingHint(missing, capabilities = {}) {
  const { vaultAvailable, runtimeAvailable } = capabilities;
  const keys = missing.join(" / ");
  const envFallback = `或者临时用环境变量跑：${missing.map((key) => `${key}=...`).join(" ")} node scripts/send_emails.mjs --apply`;

  if (vaultAvailable) {
    return [
      `缺 ${keys}。写进 Vault：`,
      "  node scripts/configure_smtp.mjs --host ... --user ... --pass ... --apply",
      ...(runtimeAvailable
        ? [
            "  （这台是 Busabase Cloud：会写进你的个人作用域并标记 runtime，写完当场就能读到，不用重开 Session。",
            "   也可以在网页 Vault 里配到 Space 或 API Key 作用域，同样勾上 runtime。）",
          ]
        : []),
      envFallback,
    ].join("\n");
  }

  // No writable Vault route at all: an older self-hosted build, or a credential
  // that cannot reach it. The environment is the remaining channel.
  return [`缺 ${keys}。这台 Busabase 没有可写的 Vault 接口。`, envFallback].join("\n");
}

export const parseFlags = (argv) => ({
  apply: argv.includes("--apply"),
  positional: argv.filter((value) => !value.startsWith("--")),
});

export const dryRunBanner = (apply) => (apply ? "" : "预演模式（未写入任何数据）。确认无误后加 --apply 真正执行。\n");
