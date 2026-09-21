// Offline unit tests for the community CLI's pure helpers.
// No credentials, no network: `node --test skills/buda-community/test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildUrl,
  config,
  displayWidth,
  errorMessage,
  num,
  onboarding,
  pad,
  parseArgs,
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
  const url = buildUrl("https://buda.im", "/api/v1/community/posts", {
    category: "ask",
    q: "",
    limit: 20,
    lang: undefined,
  });
  assert.equal(url, "https://buda.im/api/v1/community/posts?category=ask&limit=20");
});

test("config strips a trailing slash and a trailing /api/v1 from the override", () => {
  const resolved = config({
    BUDA_API_KEY: "k",
    BUDA_COMMUNITY_API_URL: "https://example.test/api/v1",
    BUDA_COMMUNITY_URL: "https://forum.example.test/",
  });
  assert.equal(resolved.apiUrl, "https://example.test");
  assert.equal(resolved.webUrl, "https://forum.example.test");
  assert.equal(resolved.apiKey, "k");
});

test("config falls back to the product defaults", () => {
  const resolved = config({});
  assert.equal(resolved.apiUrl, "https://buda.im");
  assert.equal(resolved.webUrl, "https://community.buda.im");
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
  assert.match(text, /BUDA_API_KEY is not set/);
  assert.match(text, /https:\/\/buda\.im\/en\/docs\/developers\/authentication/);
  assert.match(text, /~\/\.buda\/\.env/);
  assert.match(text, /community\.buda\.im/);
});
