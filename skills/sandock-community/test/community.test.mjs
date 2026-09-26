// Offline unit tests for the community CLI's pure helpers.
// No credentials, no network: `node --test skills/sandock-community/test`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  accountKeyEnv,
  buildUrl,
  config,
  displayWidth,
  envSearchPaths,
  errorMessage,
  listAccounts,
  loadEnvFiles,
  num,
  onboarding,
  pad,
  parseArgs,
  parseDotenv,
} from "../scripts/community.mjs";

test("parseArgs keeps positionals after a boolean flag", () => {
  const { positional, flags } = parseArgs(["cr_1", "--yes", "cr_2"]);
  assert.deepEqual(positional, ["cr_1", "cr_2"]);
  assert.equal(flags.yes, true);
});

test("parseArgs reads --key value, --key=value and --kebab-case", () => {
  const { flags } = parseArgs(["--category", "ask", "--title=Hello", "--max-items", "3"]);
  assert.equal(flags.category, "ask");
  assert.equal(flags.title, "Hello");
  assert.equal(flags.maxItems, "3");
});

test("parseArgs treats --yes=false as not confirmed", () => {
  assert.equal(parseArgs(["--yes=false"]).flags.yes, false);
});

test("num falls back for a bare flag or junk", () => {
  assert.equal(num(true, 20), 20);
  assert.equal(num("abc", 20), 20);
  assert.equal(num("5", 20), 5);
  assert.equal(num("0", 20), 0);
});

test("buildUrl drops empty params and keeps the api path", () => {
  const url = buildUrl("https://sandock.ai", "/api/v1/community/posts", {
    category: "ask",
    q: "",
    limit: 20,
    lang: undefined,
  });
  assert.equal(url, "https://sandock.ai/api/v1/community/posts?category=ask&limit=20");
});

test("config strips a trailing slash and a trailing /api/v1 from the override", () => {
  const resolved = config({
    SANDOCK_API_KEY: "k",
    SANDOCK_COMMUNITY_API_URL: "https://example.test/api/v1",
    SANDOCK_COMMUNITY_URL: "https://forum.example.test/",
  });
  assert.equal(resolved.apiUrl, "https://example.test");
  assert.equal(resolved.webUrl, "https://forum.example.test");
  assert.equal(resolved.apiKey, "k");
});

test("config falls back to the product defaults", () => {
  const resolved = config({});
  assert.equal(resolved.apiUrl, "https://sandock.ai");
  assert.equal(resolved.webUrl, "https://community.sandock.ai");
  assert.equal(resolved.apiKey, undefined);
});

test("errorMessage reads both error envelopes", () => {
  assert.match(errorMessage(401, { error: "Missing or invalid Authorization header" }), /Missing or invalid/);
  assert.match(errorMessage(404, { success: false, message: "Not Found" }), /Not Found/);
  assert.match(errorMessage(500, null), /no error body/);
});

test("displayWidth counts CJK and emoji as two columns", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("功能测试"), 8);
  assert.equal(displayWidth("请写一个帖子-lxc0pq"), 19);
  assert.equal(displayWidth("😏"), 2);
});

test("pad aligns mixed-width cells to the same column", () => {
  assert.equal(displayWidth(pad("ask", 10)), 10);
  assert.equal(displayWidth(pad("功能测试", 10)), 10);
  assert.equal(pad("this-cell-is-far-too-long", 4), "this-cell-is-far-too-long ", "never collapses the gap");
});

test("onboarding names the env var, the docs and the env file, but no key", () => {
  const text = onboarding({});
  assert.match(text, /SANDOCK_API_KEY is not set/);
  assert.match(text, /https:\/\/sandock\.ai\/docs\/api-keys/);
  assert.match(text, /~\/\.sandock\/\.env/);
  assert.match(text, /community\.sandock\.ai/);
});

test("parseDotenv reads values, strips quotes and skips comments", () => {
  const values = parseDotenv(
    ["# comment", "SANDOCK_API_KEY=plain", 'QUOTED="with spaces"', "SINGLE='x'", "", "novalue"].join("\n"),
  );
  assert.deepEqual(values, { SANDOCK_API_KEY: "plain", QUOTED: "with spaces", SINGLE: "x" });
});

test("envSearchPaths looks in the skill directory before the home directory", () => {
  const paths = envSearchPaths({ HOME: "/home/someone" });
  const skillIndex = paths.findIndex((p) => p.endsWith(path.join("sandock-community", ".env")));
  const homeIndex = paths.findIndex((p) => p === path.join("/home/someone", ".sandock", ".env"));
  assert.ok(skillIndex >= 0 && homeIndex >= 0, "both candidates are searched");
  assert.ok(skillIndex < homeIndex, "the skill's own file is nearer");
  assert.deepEqual(envSearchPaths({ HOME: "/h", SANDOCK_ENV_FILE: "/explicit" })[0], "/explicit");
});

test("loadEnvFiles fills only what the shell left unset", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "community-env-"));
  const file = path.join(dir, ".env");
  writeFileSync(file, "SANDOCK_API_KEY=from-file\nSANDOCK_SPACE_ID=spc_1\n");
  try {
    const env = { SANDOCK_ENV_FILE: file, SANDOCK_API_KEY: "already-exported" };
    const loaded = loadEnvFiles(env);
    assert.equal(env.SANDOCK_API_KEY, "already-exported", "an exported value wins");
    assert.equal(env.SANDOCK_SPACE_ID, "spc_1", "a missing one is filled in");
    assert.deepEqual(loaded[0].keys, ["SANDOCK_SPACE_ID"], "reports only what it applied");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadEnvFiles ignores a path that does not exist", () => {
  assert.deepEqual(loadEnvFiles({ SANDOCK_ENV_FILE: path.join(tmpdir(), "definitely-absent-community-env") }), []);
});

test("accountKeyEnv builds the per-account variable name", () => {
  assert.equal(accountKeyEnv("alt"), "SANDOCK_API_KEY_ALT");
  assert.equal(accountKeyEnv("Growth Team"), "SANDOCK_API_KEY_GROWTH_TEAM");
});

test("config picks the account from --as, then the env default, then the bare key", () => {
  const env = {
    SANDOCK_API_KEY: "default-key",
    SANDOCK_API_KEY_ALT: "alt-key",
    SANDOCK_ACCOUNT: "alt",
  };
  assert.equal(config(env).apiKey, "alt-key", "$SANDOCK_ACCOUNT moves the default");
  assert.equal(config(env, "default").apiKey, "default-key", "--as default returns to the bare key");
  assert.equal(config({ SANDOCK_API_KEY: "k" }).account, "default");
  assert.equal(config(env, "alt").keyEnv, "SANDOCK_API_KEY_ALT");
});

test("config reports a missing named account rather than falling back", () => {
  const resolved = config({ SANDOCK_API_KEY: "default-key" }, "ghost");
  assert.equal(resolved.apiKey, undefined, "never silently posts as somebody else");
  assert.equal(resolved.keyEnv, "SANDOCK_API_KEY_GHOST");
});

test("listAccounts names every configured account, default first, without values", () => {
  const accounts = listAccounts({
    SANDOCK_API_KEY: "aaa",
    SANDOCK_API_KEY_ALT: "bb",
    SANDOCK_API_KEY_MARKETING: "c",
    UNRELATED: "x",
  });
  assert.deepEqual(
    accounts.map((a) => a.name),
    ["default", "alt", "marketing"],
  );
  assert.deepEqual(
    accounts.map((a) => a.length),
    [3, 2, 1],
  );
  assert.ok(!JSON.stringify(accounts).includes("aaa"), "lengths only, never the key");
});
