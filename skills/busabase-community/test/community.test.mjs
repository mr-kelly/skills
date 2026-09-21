// Offline unit tests for the community CLI's pure helpers.
// No credentials, no network: `node --test skills/busabase-community/test`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  adminOnboarding,
  buildAdminPayload,
  buildUrl,
  config,
  displayWidth,
  envSearchPaths,
  errorMessage,
  i18nText,
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
  const url = buildUrl("https://busabase.com", "/api/v1/community/posts", {
    category: "ask",
    q: "",
    limit: 20,
    lang: undefined,
  });
  assert.equal(url, "https://busabase.com/api/v1/community/posts?category=ask&limit=20");
});

test("config strips a trailing slash and a trailing /api/v1 from the override", () => {
  const resolved = config({
    BUSABASE_API_KEY: "k",
    BUSABASE_COMMUNITY_API_URL: "https://example.test/api/v1",
    BUSABASE_COMMUNITY_URL: "https://forum.example.test/",
  });
  assert.equal(resolved.apiUrl, "https://example.test");
  assert.equal(resolved.webUrl, "https://forum.example.test");
  assert.equal(resolved.apiKey, "k");
});

test("config falls back to the product defaults", () => {
  const resolved = config({});
  assert.equal(resolved.apiUrl, "https://busabase.com");
  assert.equal(resolved.webUrl, "https://community.busabase.com");
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
  assert.match(text, /BUSABASE_API_KEY is not set/);
  assert.match(text, /https:\/\/busabase\.com\/docs\/api-tokens/);
  assert.match(text, /~\/\.busabase\/\.env/);
  assert.match(text, /community\.busabase\.com/);
});

test("config reads the admin key from the prefixed name or the shared fallback", () => {
  assert.equal(config({ BUSABASE_SYSTEMADMIN_KEY: "a" }).adminKey, "a");
  assert.equal(config({ SYSTEMADMIN_KEY: "b" }).adminKey, "b");
  assert.equal(config({ BUSABASE_SYSTEMADMIN_KEY: "a", SYSTEMADMIN_KEY: "b" }).adminKey, "a", "prefixed wins");
  assert.equal(config({}).adminKey, undefined);
});

test("adminOnboarding separates the two credentials", () => {
  const text = adminOnboarding({});
  assert.match(text, /BUSABASE_SYSTEMADMIN_KEY is not set/);
  assert.match(text, /NOT the same credential as BUSABASE_API_KEY/);
  assert.match(text, /SYSTEMADMIN_KEY/);
});

test("i18nText reads a bare value as English and locale=value as itself", () => {
  const { flags } = parseArgs(["--name", "How to", "--name", "zh-CN=怎么做"]);
  assert.deepEqual(i18nText(flags, "name"), { en: "How to", "zh-CN": "怎么做" });
});

test("i18nText leaves an equals sign alone when the head is not a locale", () => {
  const { flags } = parseArgs(["--name", "A=B"]);
  assert.deepEqual(i18nText(flags, "name"), { en: "A=B" });
});

test("buildAdminPayload coerces booleans, numbers and the null feature status", () => {
  const { flags } = parseArgs(["--post-id", "p1", "--feature-status", "none"]);
  assert.deepEqual(buildAdminPayload("feature-status", flags), { postId: "p1", featureStatus: null });

  const listed = parseArgs(["--include-deleted", "--limit", "5", "--status", "hidden"]).flags;
  assert.deepEqual(buildAdminPayload("posts", listed), { status: "hidden", includeDeleted: true, limit: 5 });

  const unarchive = parseArgs(["--category-id", "c1", "--is-archived", "false"]).flags;
  assert.deepEqual(buildAdminPayload("archive-category", unarchive), { categoryId: "c1", isArchived: false });
});

test("buildAdminPayload splits a comma-separated reorder list", () => {
  const { flags } = parseArgs(["--category-ids", "c1, c2 ,c3"]);
  assert.deepEqual(buildAdminPayload("reorder-categories", flags), { categoryIds: ["c1", "c2", "c3"] });
});

test("parseDotenv reads values, strips quotes and skips comments", () => {
  const values = parseDotenv(
    ["# comment", "BUSABASE_API_KEY=plain", 'QUOTED="with spaces"', "SINGLE='x'", "", "novalue"].join("\n"),
  );
  assert.deepEqual(values, { BUSABASE_API_KEY: "plain", QUOTED: "with spaces", SINGLE: "x" });
});

test("envSearchPaths looks in the skill directory before the home directory", () => {
  const paths = envSearchPaths({ HOME: "/home/someone" });
  const skillIndex = paths.findIndex((p) => p.endsWith(path.join("busabase-community", ".env")));
  const homeIndex = paths.findIndex((p) => p === path.join("/home/someone", ".busabase", ".env"));
  assert.ok(skillIndex >= 0 && homeIndex >= 0, "both candidates are searched");
  assert.ok(skillIndex < homeIndex, "the skill's own file is nearer");
  assert.deepEqual(envSearchPaths({ HOME: "/h", BUSABASE_ENV_FILE: "/explicit" })[0], "/explicit");
});

test("loadEnvFiles fills only what the shell left unset", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "community-env-"));
  const file = path.join(dir, ".env");
  writeFileSync(file, "BUSABASE_API_KEY=from-file\nBUSABASE_SPACE_ID=spc_1\n");
  try {
    const env = { BUSABASE_ENV_FILE: file, BUSABASE_API_KEY: "already-exported" };
    const loaded = loadEnvFiles(env);
    assert.equal(env.BUSABASE_API_KEY, "already-exported", "an exported value wins");
    assert.equal(env.BUSABASE_SPACE_ID, "spc_1", "a missing one is filled in");
    assert.deepEqual(loaded[0].keys, ["BUSABASE_SPACE_ID"], "reports only what it applied");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadEnvFiles ignores a path that does not exist", () => {
  assert.deepEqual(loadEnvFiles({ BUSABASE_ENV_FILE: path.join(tmpdir(), "definitely-absent-community-env") }), []);
});
