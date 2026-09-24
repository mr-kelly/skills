#!/usr/bin/env node
/**
 * buda-community — read and post on the Buda community forum through
 * its own `/api/v1/community/*` REST API.
 *
 * Zero dependencies: Node's built-in `fetch` and nothing else.
 *
 * Publishing is immediate and public — this API has no draft or review state.
 * `new` and `reply` therefore print exactly what they would send and refuse to
 * send it unless `--yes` is passed in the same command.
 *
 * Usage:  node scripts/community.mjs <command> [options]
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Shown in instructions — a path the user can paste, not an absolute one. */
const SKILL_ENV_HINT = `skills/${"buda-community"}/.env`;

/** The only per-product part of this file. Everything below is shared verbatim. */
const PRODUCT = {
  name: "Buda",
  slug: "buda-community",
  /** Where humans read the forum. */
  webUrl: "https://community.buda.im",
  /**
   * Where the API lives. Buda serves it on the `community.` host too — unlike
   * the sibling forums, that host answers directly instead of 307ing — but the
   * apex is the documented origin, so it is the default.
   */
  apiUrl: "https://buda.im",
  keyEnv: "BUDA_API_KEY",
  apiEnv: "BUDA_COMMUNITY_API_URL",
  webEnv: "BUDA_COMMUNITY_URL",
  /** `/api/v1/users/me`, when the deployment serves it. */
  meEndpoint: "/api/v1/users/me",
  keyDocs: "https://buda.im/en/docs/developers/authentication",
  /** Conventional place to keep the key — outside any repository. */
  envFile: "~/.buda/.env",
  /**
   * Separate, far more powerful credential for `/api/v1/system-admin/community/*`
   * — the moderation surface. It is the deployment's own
   * `SYSTEM_ADMIN_API_SECRET_KEY`, not a per-user token, so it is optional here
   * and every admin command refuses to run without it.
   */
  adminKeyEnv: "BUDA_SYSTEMADMIN_KEY",
  /**
   * Extra accounts live under this prefix — `BUDA_API_KEY_ALT` is the
   * account `--as alt`. One forum, several identities.
   */
  accountEnv: "BUDA_ACCOUNT",
  /** Point this at any file to override the search path entirely. */
  envFileEnv: "BUDA_ENV_FILE",
  /** Conventional per-product home directory, shared with the other Buda tooling. */
  homeDir: ".buda",
};

/** Falls back to a bare SYSTEMADMIN_KEY so one shell can drive several forums. */
const ADMIN_KEY_FALLBACK = "SYSTEMADMIN_KEY";
const ADMIN_BASE = "/api/v1/system-admin/community";

// ------------------------------------------------------------- env files

/**
 * Where the keys may live, nearest first. All of these are gitignored or
 * outside the repository; none of them is ever read into output.
 *
 * An already-exported variable always wins, so a one-off
 * `BUDA_API_KEY=… node scripts/community.mjs …` still overrides the file.
 */
export function envSearchPaths(env = process.env) {
  const home = env.HOME || "";
  return [
    env[PRODUCT.envFileEnv],
    path.join(SKILL_DIR, ".env.local"),
    path.join(SKILL_DIR, ".env"),
    home && path.join(home, ".config", PRODUCT.slug, ".env"),
    home && path.join(home, PRODUCT.homeDir, ".env"),
  ].filter((file) => typeof file === "string" && file.length > 0);
}

/** A deliberately small dotenv reader — `KEY=value`, `#` comments, optional quotes. */
export function parseDotenv(raw) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at === -1) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

/** Fill in missing variables from the first file that defines them. Returns what it read. */
export function loadEnvFiles(env = process.env) {
  const loaded = [];
  for (const file of envSearchPaths(env)) {
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue; // absent or unreadable — the next candidate gets a turn
    }
    const values = parseDotenv(raw);
    const applied = [];
    for (const [key, value] of Object.entries(values)) {
      if (env[key] === undefined) {
        env[key] = value;
        applied.push(key);
      }
    }
    loaded.push({ file, keys: applied });
  }
  return loaded;
}

const SORTS = ["active", "latest", "top"];

// ---------------------------------------------------------------- arg parsing

const BOOLEAN_FLAGS = new Set(["yes", "json", "unanswered"]);
/** Flags that may repeat, because a category's text is one value per locale. */
const REPEATABLE_FLAGS = new Set(["name", "description"]);

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const at = token.indexOf("=");
    const rawKey = at === -1 ? token.slice(2) : token.slice(2, at);
    const inline = at === -1 ? undefined : token.slice(at + 1);
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (BOOLEAN_FLAGS.has(key)) {
      flags[key] = inline === undefined ? true : inline !== "false";
      continue;
    }
    const value = inline ?? (argv[i + 1]?.startsWith("--") ? true : (argv[++i] ?? true));
    if (REPEATABLE_FLAGS.has(key)) {
      flags[key] = [...(Array.isArray(flags[key]) ? flags[key] : []), value];
    } else {
      flags[key] = value;
    }
  }
  return { positional, flags };
}

/** A bare `--limit` carries `true`, and `Number(true)` is 1 — fall back instead. */
export function num(value, fallback) {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Every refusal in this file goes through here.
 *
 * It throws rather than calling `process.exit` so the commands can be driven
 * from a test — "this refused to send" is the behaviour most worth pinning
 * down, and it is unreachable from a process that has already exited. The
 * entry point turns it back into exit code 1 on stderr.
 */
export class CommunityCliError extends Error {
  constructor(message, { prefixed = true } = {}) {
    super(prefixed ? `${PRODUCT.slug}: ${message}` : message);
    this.name = "CommunityCliError";
  }
}

function fail(message) {
  throw new CommunityCliError(message);
}

/** What to tell a user who has not configured the key yet. */
export function onboarding(env = process.env, account = "") {
  const { apiUrl, webUrl, keyEnv } = config(env, account);
  return [
    `${keyEnv} is not set — this skill cannot reach the ${PRODUCT.name} community without it.`,
    "",
    "Set it up:",
    `  1. Sign in at ${webUrl} — the forum uses your ${PRODUCT.name} account.`,
    `  2. Create an API key: ${PRODUCT.keyDocs}`,
    "  3. Write it to the skill's own env file — gitignored, read automatically:",
    `       printf '${keyEnv}=%s\\n' '<key>' >> ${SKILL_ENV_HINT}`,
    `       chmod 600 ${SKILL_ENV_HINT}`,
    `     ${PRODUCT.envFile} works too, and so does a one-off`,
    `     \`export ${keyEnv}=<key>\`, which an exported value always wins over.`,
    `     A second account is ${PRODUCT.keyEnv}_<NAME>, reached with \`--as <name>\`.`,
    "  4. Verify: node scripts/community.mjs whoami",
    "",
    `Optional overrides — ${PRODUCT.apiEnv} (default ${apiUrl}), ${PRODUCT.webEnv} (default ${webUrl}).`,
    `Files are read nearest-first — ${PRODUCT.envFileEnv}, ${SKILL_ENV_HINT}(.local), ~/.config/${PRODUCT.slug}/.env, ${PRODUCT.envFile}.`,
    "Never paste the key into chat, into a tracked file, or into command output.",
  ].join("\n");
}

function requireKey() {
  const { apiKey } = selected();
  if (apiKey) return apiKey;
  // The onboarding text is the whole message; the slug prefix would only
  // push its first line out of alignment.
  throw new CommunityCliError(onboarding(ENV, ACCOUNT), { prefixed: false });
}

/** What to tell someone who asked for an admin command without the admin key. */
export function adminOnboarding(env = ENV) {
  return [
    `${PRODUCT.adminKeyEnv} is not set — the moderation surface needs the deployment's own system-admin key.`,
    "",
    `This is NOT the same credential as ${PRODUCT.keyEnv}. It is the server's`,
    "`SYSTEM_ADMIN_API_SECRET_KEY`, it is not per-user, and it can hide, move and",
    "permanently delete anyone's content. Only an operator of the deployment has it.",
    "",
    `  printf '${PRODUCT.adminKeyEnv}=%s\\n' '<key>' >> ${SKILL_ENV_HINT}`,
    `  # or ${ADMIN_KEY_FALLBACK} in any of the same files, to cover several forums at once`,
    "  node scripts/community.mjs admin overview",
    "",
    "Without it every `admin` command stops here. The read and post commands are",
    `unaffected — they use ${PRODUCT.keyEnv}.`,
  ].join("\n");
}

function requireAdminKey() {
  const { adminKey } = selected();
  if (adminKey) return adminKey;
  throw new CommunityCliError(adminOnboarding(ENV), { prefixed: false });
}

// -------------------------------------------------------------------- request

/** `alt` → `BUDA_API_KEY_ALT`. Anything not a letter or digit becomes `_`. */
export function accountKeyEnv(account) {
  return `${PRODUCT.keyEnv}_${String(account)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")}`;
}

/**
 * Every account configured for this forum, default first.
 *
 * The default is the bare `BUDA_API_KEY`; a named one is
 * `BUDA_API_KEY_<NAME>`. Returns names and key lengths — never a key.
 */
export function listAccounts(env = process.env) {
  const accounts = [];
  if (env[PRODUCT.keyEnv]) accounts.push({ name: "default", env: PRODUCT.keyEnv, length: env[PRODUCT.keyEnv].length });
  const prefix = `${PRODUCT.keyEnv}_`;
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(prefix) || !value) continue;
    accounts.push({ name: key.slice(prefix.length).toLowerCase(), env: key, length: value.length });
  }
  return accounts;
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [account] the `--as` name, when one was given
 */
export function config(env = process.env, account = "") {
  // Precedence: --as beats $BUDA_ACCOUNT beats the unnamed default key.
  const name = account || env[PRODUCT.accountEnv] || "";
  const keyEnv = name && name !== "default" ? accountKeyEnv(name) : PRODUCT.keyEnv;
  const apiKey = env[keyEnv];
  const adminKey = env[PRODUCT.adminKeyEnv] || env[ADMIN_KEY_FALLBACK];
  const apiUrl = (env[PRODUCT.apiEnv] || PRODUCT.apiUrl).replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  const webUrl = (env[PRODUCT.webEnv] || PRODUCT.webUrl).replace(/\/+$/, "");
  return { apiKey, adminKey, apiUrl, webUrl, account: name || "default", keyEnv };
}

/** Both error envelopes in the wild — `{error}` and `{success,message}`. */
export function errorMessage(status, payload) {
  const detail =
    (payload && typeof payload === "object" ? (payload.error ?? payload.message) : undefined) ||
    (typeof payload === "string" ? payload.slice(0, 200) : "") ||
    "no error body";
  return `HTTP ${status} — ${detail}`;
}

export function buildUrl(apiUrl, path, query = {}) {
  const url = new URL(path, `${apiUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * @param {string} path
 * @param {{ method?: string, query?: Record<string, unknown>, body?: unknown, admin?: boolean, soft?: boolean, fetchImpl?: typeof fetch }} [options]
 */
async function request(path, { method = "GET", query, body, admin = false, soft = false, fetchImpl } = {}) {
  const apiKey = admin ? requireAdminKey() : requireKey();
  const { apiUrl } = selected();
  const send = fetchImpl ?? FETCH ?? fetch;

  const response = await send(buildUrl(apiUrl, path, query), {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }

  if (!response.ok) {
    // `soft` is for callers checking several credentials in a row: one dead
    // account should be reported beside the others, not end the command.
    if (soft) return null;
    if (response.status === 401) {
      fail(
        `${method} ${path} — unauthorized. ${admin ? PRODUCT.adminKeyEnv : selected().keyEnv} is expired or rejected.`,
      );
    }
    if (response.status === 403) fail(`${method} ${path} — forbidden. This key may not post to that category.`);
    if (response.status === 404) {
      // A missing *route* echoes the path back; a missing *record* does not.
      // Worth separating: one means "not deployed here", the other "wrong id".
      const routeMissing = typeof payload === "object" && payload !== null && "path" in payload;
      if (routeMissing && path.startsWith(ADMIN_BASE)) {
        fail(`${method} ${path} — this deployment does not serve the system-admin community API yet.`);
      }
      fail(`${method} ${path} — not found. Check the slug or id.`);
    }
    fail(`${method} ${path} — ${errorMessage(response.status, payload)}`);
  }
  // Some deployments wrap success in { success, data }; unwrap when they do.
  return payload && typeof payload === "object" && payload.success === true && "data" in payload
    ? payload.data
    : payload;
}

function output(data, flags, render) {
  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  render(data);
}

const oneLine = (text, max = 160) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** CJK and emoji occupy two terminal columns; `String.length` does not know that. */
export function displayWidth(text) {
  let width = 0;
  for (const char of String(text ?? "")) {
    const code = char.codePointAt(0);
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1f9ff) ||
      (code >= 0x20000 && code <= 0x3fffd);
    width += wide ? 2 : 1;
  }
  return width;
}

export function pad(text, target) {
  const value = String(text ?? "");
  return value + " ".repeat(Math.max(1, target - displayWidth(value)));
}

function postUrl(post, webUrl) {
  if (post.url) return /^https?:\/\//.test(post.url) ? post.url : `${webUrl}${post.url}`;
  return `${webUrl}/community/${post.categorySlug}/${post.slug}`;
}

// ------------------------------------------------------------------ commands

async function cmdWhoami(_positional, flags) {
  const { apiUrl, webUrl } = selected();
  const categories = await request("/api/v1/community/categories");
  const me = PRODUCT.meEndpoint ? await request(PRODUCT.meEndpoint) : null;
  output({ api: apiUrl, forum: webUrl, user: me, categoryCount: categories.items.length }, flags, () => {
    console.log(`api        ${apiUrl}`);
    console.log(`forum      ${webUrl}`);
    console.log(`account    ${selected().account} (${selected().keyEnv})`);
    const user = me?.user ?? me;
    console.log(
      `user       ${user?.name ?? user?.email ?? (me ? JSON.stringify(user) : "(no users/me on this deployment)")}`,
    );
    console.log(`key        valid — ${categories.items.length} categories visible`);
  });
}

async function cmdCategories(_positional, flags) {
  const data = await request("/api/v1/community/categories");
  output(data, flags, () => {
    for (const category of data.items) {
      console.log(
        `${pad(category.slug, 18)}${String(category.postCount).padStart(4)}  ${pad(category.kind, 16)}${category.name}`,
      );
    }
    console.log(`\n${data.items.length} categor(ies)`);
  });
}

async function cmdPosts(_positional, flags) {
  const sort = flags.sort ? String(flags.sort) : "active";
  if (!SORTS.includes(sort)) fail(`--sort ${sort} — expected one of ${SORTS.join(", ")}.`);
  const { webUrl } = selected();
  const data = await request("/api/v1/community/posts", {
    query: {
      category: flags.category,
      lang: flags.lang,
      sort,
      unanswered: flags.unanswered ? "true" : undefined,
      q: flags.q,
      limit: num(flags.limit, 20),
      offset: num(flags.offset, 0),
    },
  });
  output(data, flags, () => {
    for (const post of data.items) {
      const marks = [post.isPinned && "pinned", post.isSolved && "solved", post.isLocked && "locked"].filter(Boolean);
      console.log(
        `${pad(post.slug, 30)}${pad(post.categorySlug, 17)}r${String(post.replyCount).padStart(3)} ` +
          `${post.lastActivityAt.slice(0, 10)}  ${post.title}${marks.length ? `  [${marks.join(",")}]` : ""}`,
      );
      console.log(`    ${postUrl(post, webUrl)}`);
    }
    console.log(`\n${data.items.length} of ${data.total} post(s)${data.hasMore ? " — more with --offset" : ""}`);
  });
}

async function cmdPost(positional, flags) {
  const slug = positional[0];
  if (!slug) fail("post <slug> — pass the post slug (the last URL segment, see `posts`).");
  const { webUrl } = selected();
  const post = await request(`/api/v1/community/posts/${encodeURIComponent(slug)}`);
  output(post, flags, () => {
    console.log(`# ${post.title}`);
    console.log(
      `${post.categoryName} · ${post.kind} · ${post.author.name}${post.author.isStaff ? " (staff)" : ""} · ${post.createdAt}`,
    );
    console.log(postUrl(post, webUrl));
    console.log(`\n${post.body}\n`);
    console.log(`--- ${post.replies?.length ?? 0} of ${post.replyCount} repl(ies) ---`);
    for (const reply of post.replies ?? []) {
      const marks = [reply.isAccepted && "accepted", reply.status !== "published" && reply.status].filter(Boolean);
      console.log(
        `\n[${reply.id}] ${reply.author.name}${reply.author.isStaff ? " (staff)" : ""} · ${reply.createdAt}` +
          `${marks.length ? ` [${marks.join(",")}]` : ""}\n${reply.body}`,
      );
    }
  });
}

/** Publishing is immediate and public, so default to showing the payload only. */
function confirmOrPreview(flags, label, payload) {
  if (flags.yes === true) return true;
  console.log(`${label} — NOT sent. This is what --yes would publish, as account ${selected().account}:\n`);
  console.log(JSON.stringify(payload, null, 2));
  console.log(`\nThis forum has no draft state. Get the user's explicit go-ahead, then re-run with --yes.`);
  return false;
}

async function cmdNew(_positional, flags) {
  const { category, title, body } = flags;
  const lang = flags.lang ? String(flags.lang) : "en";
  if (typeof category !== "string" || typeof title !== "string" || typeof body !== "string") {
    fail('new --category <slug> --title "..." --body "..." [--lang zh-CN] [--yes]');
  }
  if (title.length < 5 || title.length > 200) fail("--title must be 5–200 characters.");
  if (body.length < 10 || body.length > 50000) fail("--body must be 10–50000 characters (markdown).");
  const payload = { category, title, body, lang };
  if (!confirmOrPreview(flags, "New post", payload)) return;

  const { webUrl } = selected();
  const post = await request("/api/v1/community/posts", { method: "POST", body: payload });
  output(post, flags, () => {
    console.log(`Published as ${selected().account}: ${post.title}`);
    console.log(postUrl(post, webUrl));
    console.log(`post id ${post.id} · slug ${post.slug}`);
  });
}

async function cmdReply(positional, flags) {
  const postId = positional[0] ?? flags.post;
  const body = flags.body;
  if (typeof postId !== "string" || typeof body !== "string") {
    fail('reply <postId> --body "..." [--yes]     (postId is the id from `post <slug>`, not the slug)');
  }
  if (body.length < 2 || body.length > 20000) fail("--body must be 2–20000 characters (markdown).");
  const payload = { body };
  if (!confirmOrPreview(flags, `Reply to ${postId}`, payload)) return;

  const reply = await request(`/api/v1/community/posts/${encodeURIComponent(postId)}/replies`, {
    method: "POST",
    body: payload,
  });
  output(reply, flags, () => {
    console.log(`Replied to ${reply.postId} as ${reply.id} (${reply.status}), from account ${selected().account}.`);
    console.log(oneLine(reply.bodyText, 200));
  });
}

/**
 * What a post body can render and what the server accepts. Duplicated from the
 * server on purpose: a 12MB screenshot should be refused before it is read into
 * memory and hashed, not after a round trip that was never going to succeed.
 */
const IMAGE_MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Put an image where a post body can point at it.
 *
 * A forum image is not an attachment on the post — it is a markdown link in the
 * body, which is why this prints the markdown rather than attaching anything.
 * Upload first, paste the line into `--body`, then `new`/`reply` as usual.
 *
 * Deliberately not behind `--yes`: the bytes are inert until a post references
 * them, and the gate that matters is on publishing the post.
 */
async function cmdUpload(positional, flags) {
  const file = positional[0] ?? flags.file;
  if (typeof file !== "string") {
    fail("upload <file.png> [--as NAME]     prints the markdown line to paste into --body");
  }

  const ext = path.extname(file).toLowerCase();
  const mimeType = IMAGE_MIME_TYPES[ext];
  if (!mimeType) {
    fail(`upload takes ${Object.keys(IMAGE_MIME_TYPES).join(", ")} — got "${ext || file}".`);
  }

  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    fail(`cannot read ${file}`);
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    fail(`${file} is ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB; the limit is 10MB.`);
  }

  const fileName = path.basename(file);
  // Sending the hash is what buys store-once: the same screenshot uploaded
  // twice resolves to the object already there instead of a second copy.
  const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const sizeBytes = bytes.byteLength;

  const target = await request("/api/v1/community/attachments/upload-urls", {
    method: "POST",
    body: { fileName, mimeType, sizeBytes, contentHash },
  });

  if (!target.duplicate) {
    const send = FETCH ?? fetch;
    // A deployment backed by object storage hands back an absolute presigned
    // URL; one backed by local disk hands back a path on the API host itself.
    // Both are valid targets, and `fetch` only accepts the first, so resolve
    // against the API origin rather than assuming the shape.
    const uploadUrl = new URL(target.uploadUrl, selected().apiUrl).toString();
    // No authorization header here: the target is already presigned, and an
    // extra credential is exactly what invalidates the signature.
    const stored = await send(uploadUrl, {
      method: "PUT",
      headers: { "content-type": mimeType },
      body: bytes,
    });
    if (!stored.ok) fail(`upload failed: the storage target answered ${stored.status}.`);

    await request("/api/v1/community/attachments/confirmations", {
      method: "POST",
      body: { storageKey: target.storageKey, fileName, mimeType, sizeBytes, contentHash },
    });
  }

  const markdown = `![](${target.publicUrl})`;
  output({ publicUrl: target.publicUrl, markdown, duplicate: Boolean(target.duplicate) }, flags, () => {
    console.log(markdown);
    console.log(
      target.duplicate
        ? "Already stored — same bytes, same URL. Paste the line above into --body."
        : "Paste the line above into --body.",
    );
  });
}

// -------------------------------------------------------------- admin surface

/**
 * `/api/v1/system-admin/community/*` — the moderation surface, one table
 * instead of eighteen near-identical functions. `body`/`query` list the flags
 * an operation accepts, in camelCase; `writes` decides whether --yes is
 * required; `destructive` marks the two operations with no undo.
 */
const ADMIN_OPS = {
  overview: { method: "GET", path: "/overview" },
  posts: {
    method: "GET",
    path: "/posts",
    query: ["includeDeleted", "deletedOnly", "categorySlug", "search", "limit", "offset"],
  },
  replies: {
    method: "GET",
    path: "/replies",
    query: ["includeDeleted", "deletedOnly", "postId", "search", "limit", "offset"],
  },
  reports: { method: "GET", path: "/reports", query: ["status", "limit", "offset"] },
  categories: { method: "GET", path: "/categories" },

  // Pin, lock or backdate only. Taking content down is take-down-*; the server
  // strips a `status` sent here and still answers 200, so it is refused locally.
  "moderate-post": {
    method: "POST",
    path: "/posts/moderate",
    body: ["postId", "isPinned", "isLocked", "createdAt"],
    required: ["postId"],
    writes: true,
  },
  "take-down-post": { method: "POST", path: "/posts/take-down", body: ["postId"], required: ["postId"], writes: true },
  "take-down-reply": {
    method: "POST",
    path: "/replies/take-down",
    body: ["replyId"],
    required: ["replyId"],
    writes: true,
  },
  "move-post": {
    method: "POST",
    path: "/posts/move",
    body: ["postId", "categoryId"],
    required: ["postId", "categoryId"],
    writes: true,
  },
  "feature-status": {
    method: "POST",
    path: "/posts/feature-status",
    body: ["postId", "featureStatus"],
    required: ["postId", "featureStatus"],
    writes: true,
  },
  "restore-post": { method: "POST", path: "/posts/restore", body: ["postId"], required: ["postId"], writes: true },
  "restore-reply": { method: "POST", path: "/replies/restore", body: ["replyId"], required: ["replyId"], writes: true },

  "delete-post": {
    method: "DELETE",
    path: "/posts/{postId}",
    body: ["postId"],
    required: ["postId"],
    writes: true,
    destructive: true,
  },
  "delete-reply": {
    method: "DELETE",
    path: "/replies/{replyId}",
    body: ["replyId"],
    required: ["replyId"],
    writes: true,
    destructive: true,
  },

  "create-category": {
    method: "POST",
    path: "/categories",
    body: ["slug", "kind", "name", "description", "sortOrder", "showVotes"],
    required: ["slug", "kind", "name"],
    writes: true,
  },
  "update-category": {
    method: "PATCH",
    path: "/categories",
    body: ["categoryId", "name", "description", "sortOrder", "showVotes", "isArchived"],
    required: ["categoryId"],
    writes: true,
  },
  "archive-category": {
    method: "POST",
    path: "/categories/archive",
    body: ["categoryId", "isArchived"],
    required: ["categoryId", "isArchived"],
    writes: true,
  },
  "reorder-categories": {
    method: "POST",
    path: "/categories/reorder",
    body: ["categoryIds"],
    required: ["categoryIds"],
    writes: true,
  },
  "handle-report": {
    method: "POST",
    path: "/reports/handle",
    body: ["reportId", "status"],
    required: ["reportId", "status"],
    writes: true,
  },
};

const ADMIN_ENUMS = {
  status: {
    reports: ["open", "accepted", "rejected"],
    "handle-report": ["accepted", "rejected"],
  },
  featureStatus: ["collecting", "planned", "shipped", "declined", "none"],
  kind: ["question", "discussion", "showcase", "feature_request", "announcement"],
};

const BOOLEAN_FIELDS = new Set(["includeDeleted", "deletedOnly", "isPinned", "isLocked", "showVotes", "isArchived"]);
const NUMBER_FIELDS = new Set(["limit", "offset", "sortOrder"]);

const LOCALE = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;

/**
 * `--name "Ask" --name "zh-CN=提问"` → `{ en: "Ask", "zh-CN": "提问" }`.
 *
 * A bare value is English. A `locale=value` prefix is only read as a locale
 * when it actually looks like one, so a category literally named "A=B" keeps
 * its equals sign instead of becoming a locale nobody asked for.
 */
export function i18nText(flags, field) {
  /** @type {Record<string, string>} */
  const text = {};
  const values = Array.isArray(flags[field]) ? flags[field] : flags[field] === undefined ? [] : [flags[field]];
  for (const entry of values) {
    if (typeof entry !== "string") continue;
    const at = entry.indexOf("=");
    const head = at === -1 ? "" : entry.slice(0, at);
    if (at !== -1 && LOCALE.test(head)) text[head] = entry.slice(at + 1);
    else text.en = entry;
  }
  return text;
}

export function buildAdminPayload(operation, flags) {
  const spec = ADMIN_OPS[operation];
  /** @type {Record<string, unknown>} */
  const payload = {};
  for (const field of [...(spec.body ?? []), ...(spec.query ?? [])]) {
    if (field === "name" || field === "description") {
      const text = i18nText(flags, field);
      if (Object.keys(text).length) payload[field] = text;
      continue;
    }
    if (field === "categoryIds") {
      if (typeof flags.categoryIds === "string")
        payload.categoryIds = flags.categoryIds.split(",").map((id) => id.trim());
      continue;
    }
    const value = flags[field];
    if (value === undefined) continue;
    if (BOOLEAN_FIELDS.has(field)) payload[field] = value === true || String(value) !== "false";
    else if (NUMBER_FIELDS.has(field)) payload[field] = num(value, undefined);
    // `none` is how an operator clears a feature status; the API wants null.
    else if (field === "featureStatus" && value === "none") payload[field] = null;
    else payload[field] = String(value);
  }
  return payload;
}

function validateAdminPayload(operation, payload) {
  const spec = ADMIN_OPS[operation];
  const missing = (spec.required ?? []).filter((field) => payload[field] === undefined);
  if (missing.length) fail(`admin ${operation} — missing --${missing.map(kebab).join(" --")}.`);
  const allowed = ADMIN_ENUMS.status[operation];
  if (allowed && payload.status !== undefined && !allowed.includes(String(payload.status))) {
    fail(`admin ${operation} — --status must be one of ${allowed.join(", ")}.`);
  }
  if (payload.featureStatus !== undefined && payload.featureStatus !== null) {
    if (!ADMIN_ENUMS.featureStatus.includes(String(payload.featureStatus))) {
      fail(`admin ${operation} — --feature-status must be one of ${ADMIN_ENUMS.featureStatus.join(", ")}.`);
    }
  }
  if (payload.kind !== undefined && !ADMIN_ENUMS.kind.includes(String(payload.kind))) {
    fail(`admin ${operation} — --kind must be one of ${ADMIN_ENUMS.kind.join(", ")}.`);
  }
}

const kebab = (field) => field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * The admin list contracts take their filters as `z.object({ query: … })`, so
 * oRPC serializes them nested: `?query[status]=hidden`, not `?status=hidden`.
 *
 * This is not cosmetic. A flat parameter is not rejected — it is *ignored*, so
 * an unfiltered list comes back looking like a successful filtered one. The
 * public endpoints take flat parameters; only these nested ones do.
 */
export function nestQuery(payload) {
  /** @type {Record<string, unknown>} */
  const nested = {};
  for (const [field, value] of Object.entries(payload)) nested[`query[${field}]`] = value;
  return nested;
}

function renderAdmin(operation, data) {
  if (operation === "overview") {
    for (const [key, value] of Object.entries(data)) console.log(`${pad(kebab(key), 24)}${value}`);
    return;
  }
  if (operation === "categories" || Array.isArray(data)) {
    for (const category of data) {
      console.log(
        `${pad(category.id, 24)}${pad(category.slug, 20)}${pad(category.kind, 17)}` +
          `${String(category.postCount).padStart(4)}  ${category.name}${category.isArchived ? "  [archived]" : ""}`,
      );
    }
    return;
  }
  if (operation === "posts") {
    for (const post of data.items) {
      const marks = [post.deletedAt && "taken-down", post.isPinned && "pinned", post.isLocked && "locked"]
        .filter(Boolean)
        .join(",");
      console.log(`${pad(post.id, 24)}${pad(post.categorySlug, 18)}${pad(marks || "published", 22)}${post.title}`);
    }
    console.log(`\n${data.items.length} of ${data.total}`);
    return;
  }
  if (operation === "replies") {
    for (const reply of data.items) {
      const marks = [reply.deletedAt && "taken-down", reply.isAccepted && "accepted"].filter(Boolean).join(",");
      console.log(
        `${pad(reply.id, 24)}${pad(marks || "published", 22)}${oneLine(reply.body, 60)}  ← ${reply.postTitle}`,
      );
    }
    console.log(`\n${data.items.length} of ${data.total}`);
    return;
  }
  if (operation === "reports") {
    for (const report of data.items) {
      console.log(
        `${pad(report.id, 24)}${pad(report.status, 10)}${pad(report.targetType, 7)}${pad(report.reason, 14)}${oneLine(report.targetExcerpt, 70)}`,
      );
    }
    console.log(`\n${data.items.length} of ${data.total}`);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

async function cmdAdmin(positional, flags) {
  const operation = positional[0];
  if (!operation || !ADMIN_OPS[operation]) {
    fail(`admin <operation> — one of ${Object.keys(ADMIN_OPS).join(", ")}.`);
  }
  const spec = ADMIN_OPS[operation];
  // The server drops a field it does not know and answers 200, so a stale
  // `--status` would look like success while changing nothing.
  const accepted = [...(spec.body ?? []), ...(spec.query ?? [])];
  if (flags.status !== undefined && !accepted.includes("status")) {
    fail(
      `admin ${operation} — takes no --status. Take content down with take-down-post / take-down-reply, bring it back with restore-post / restore-reply, and list what is down with --deleted-only.`,
    );
  }
  const payload = buildAdminPayload(operation, flags);
  validateAdminPayload(operation, payload);

  if (spec.writes && flags.yes !== true) {
    console.log(`admin ${operation} — NOT sent. This is what --yes would do:\n`);
    console.log(`${spec.method} ${ADMIN_BASE}${spec.path}`);
    console.log(JSON.stringify(payload, null, 2));
    if (spec.destructive) {
      console.log("\n*** IRREVERSIBLE. This purges the row and everything hanging off it.");
      console.log("*** To take content down reversibly use `take-down-post` instead.");
    }
    console.log("\nShow the user exactly this, then re-run with --yes.");
    return;
  }

  // The two DELETEs address the id in the path; everything else sends a body.
  const path = `${ADMIN_BASE}${spec.path}`.replace(/\{(\w+)\}/g, (_, field) =>
    encodeURIComponent(String(payload[field])),
  );
  const data = await request(path, {
    method: spec.method,
    admin: true,
    query: spec.query ? nestQuery(payload) : undefined,
    body: spec.body && spec.method !== "DELETE" ? payload : undefined,
  });
  output(data, flags, () => renderAdmin(operation, data));
}

/** Populated at startup so `setup` can say where the values came from. */
let ENV_SOURCES = [];
/** The `--as` name for this invocation, resolved once in the entry point. */
let ACCOUNT = "";
/** Ambient environment and transport. `run()` swaps both for the duration of a call. */
let ENV = process.env;
/** @type {typeof fetch | null} */
let FETCH = null;

const selected = () => config(ENV, ACCOUNT);

async function cmdAccounts(_positional, flags) {
  const accounts = listAccounts(ENV);
  const active = selected().account;
  if (!accounts.length) {
    throw new CommunityCliError(onboarding(ENV, ACCOUNT), { prefixed: false });
  }

  // --verify costs one request per account; without it this is offline.
  const rows = [];
  for (const account of accounts) {
    /** @type {{ name: string, env: string, length: number, active: boolean, user?: string | null, valid?: boolean }} */
    const row = { ...account, active: account.name === active };
    if (flags.verify) {
      ACCOUNT = account.name;
      const me = PRODUCT.meEndpoint
        ? await request(PRODUCT.meEndpoint, { soft: true })
        : await request("/api/v1/community/categories", { soft: true });
      const user = me?.user ?? me;
      row.user = user ? (user.name ?? user.email ?? "ok") : null;
      row.valid = Boolean(me);
    }
    rows.push(row);
  }
  ACCOUNT = active === "default" ? "" : active;

  output({ accounts: rows, active }, flags, () => {
    for (const row of rows) {
      console.log(
        `${row.active ? "*" : " "} ${pad(row.name, 16)}${pad(row.env, 30)}${String(row.length).padStart(3)} chars` +
          `${row.valid === false ? "  REJECTED" : row.user ? `  ${row.user}` : ""}`,
      );
    }
    console.log(`\n${rows.length} account(s). \`--as <name>\` picks one; ${PRODUCT.accountEnv} sets the default.`);
  });
}

function cmdSetup(_positional, flags) {
  const { apiKey, adminKey, apiUrl, webUrl, account, keyEnv } = selected();
  if (!apiKey) {
    console.log(onboarding());
    return;
  }
  output(
    { configured: true, apiUrl, webUrl, keyLength: apiKey.length, adminKeyLength: adminKey?.length ?? null },
    flags,
    () => {
      console.log(`${keyEnv} is set (${apiKey.length} characters — value not shown).`);
      const all = listAccounts(ENV);
      if (all.length > 1) {
        console.log(`account  ${account} (of ${all.length}: ${all.map((a) => a.name).join(", ")})`);
      }
      // Mentioned only when it is actually configured — see adminHelp().
      if (adminKey) {
        console.log(
          `${PRODUCT.adminKeyEnv} is set (${adminKey.length} characters) — \`admin\` commands are available.`,
        );
      }
      console.log(`api    ${apiUrl}`);
      console.log(`forum  ${webUrl}`);
      for (const source of ENV_SOURCES) {
        console.log(`read   ${source.file} → ${source.keys.join(", ") || "(nothing new)"}`);
      }
      console.log("\nRun `whoami` to confirm the key is still valid.");
    },
  );
}

/**
 * The moderation surface is listed only to someone who already holds the key.
 * It is not part of the published command set, and an operator who has the
 * credential does not need to be told it exists.
 */
function adminHelp() {
  if (!selected().adminKey) return "";
  return `  admin <operation> [flags] [--yes]       Moderation surface
    read      overview · posts · replies · reports · categories
    moderate  moderate-post · moderate-reply · move-post · feature-status
              restore-post · restore-reply
    purge     delete-post · delete-reply          (IRREVERSIBLE)
    taxonomy  create-category · update-category · archive-category
              reorder-categories
    reports   handle-report

`;
}

function cmdHelp() {
  console.log(`${PRODUCT.slug} — read and post on ${PRODUCT.webUrl}

  setup                                   Check configuration, or explain how to configure it
  accounts [--verify]                     List the configured accounts
  whoami                                  Verify the key and print the account
  categories                              List categories with post counts
  posts [--category S] [--sort active|latest|top] [--unanswered]
        [--q TEXT] [--lang XX] [--limit N] [--offset N]
  post <slug>                             One post with its replies
  new --category S --title T --body B [--lang XX] [--yes]
  reply <postId> --body B [--yes]
  upload <file.png>                       Store an image, print its markdown line

${adminHelp()}Every command accepts --json, and --as <name> to act as another account
(\`accounts\` lists them; ${PRODUCT.accountEnv} changes the default).

\`new\` and \`reply\` publish immediately and publicly — there is no draft or
review state on this API. Without --yes they only print the payload.

A forum image is a markdown link in the body, not an attachment on the post.
\`upload\` stores the file and prints \`![](url)\` — paste that into --body.
Needs ${PRODUCT.keyEnv}. Not set yet? Run \`setup\`.`);
}

const COMMANDS = {
  setup: cmdSetup,
  accounts: cmdAccounts,
  admin: cmdAdmin,
  whoami: cmdWhoami,
  categories: cmdCategories,
  posts: cmdPosts,
  post: cmdPost,
  new: cmdNew,
  reply: cmdReply,
  upload: cmdUpload,
  help: cmdHelp,
};

/**
 * Run one command. Exported so a test can drive the real command layer —
 * including the paths that refuse to do anything — with an injected `fetch`.
 */
export async function run(argv, { env = process.env, fetchImpl = null } = {}) {
  const previous = { env: ENV, fetch: FETCH, account: ACCOUNT };
  ENV = env;
  FETCH = fetchImpl;
  try {
    return await dispatch(argv, env);
  } finally {
    ENV = previous.env;
    FETCH = previous.fetch;
    ACCOUNT = previous.account;
  }
}

async function dispatch(argv, env) {
  const [command, ...rest] = argv;
  const handler = COMMANDS[command ?? "help"];
  if (!handler) fail(`unknown command "${command}". Run \`help\`.`);
  const { positional, flags } = parseArgs(rest);
  ACCOUNT = "";
  if (flags.as !== undefined) {
    if (typeof flags.as !== "string") fail("--as <name> — name the account. `accounts` lists them.");
    ACCOUNT = flags.as;
    const { apiKey, keyEnv } = config(env, ACCOUNT);
    if (!apiKey)
      fail(`--as ${flags.as} — no such account. ${keyEnv} is not set; \`accounts\` lists the ones that are.`);
  }
  return handler(positional, flags);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  // Before anything reads config(): files fill only what the shell left unset.
  ENV_SOURCES = loadEnvFiles();
  try {
    await run(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof CommunityCliError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
