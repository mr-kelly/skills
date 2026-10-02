import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getFreePort, startProcess } from "../harness/process.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-wechat-crm", "content", "kelly-wechat-crm-app");
let baseUrl;
let runtime;
let home;

test.before(async () => {
  const port = await getFreePort();
  home = await mkdtemp(join(tmpdir(), "kelly-wechat-crm-home-"));
  baseUrl = `http://127.0.0.1:${port}`;
  runtime = await startProcess({
    command: process.execPath,
    args: ["server.js"],
    cwd: appRoot,
    env: { HOME: home, PORT: String(port), WECHAT_CLI_BIN: join(home, "missing-wechat-cli-rs") },
    readyUrl: `${baseUrl}/health`,
  });
});

test("reports sanitized WeChat connector readiness", async () => {
  const response = await fetch(`${baseUrl}/__wechat/status`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const status = await response.json();
  assert.equal(status.ready, false);
  assert.equal(status.state, "missing");
  assert.equal(status.installed, false);
  assert.equal(status.initialized, false);
  assert.equal(status.contactsCount, 0);
  assert.equal(status.sessionsReadable, false);
  assert.equal(JSON.stringify(status).includes("stderr"), false);
});

test("does not enumerate contacts without an explicit query", async () => {
  const response = await fetch(`${baseUrl}/__wechat/contacts`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { query: "", totalMatches: 0, results: [] });
});

test.after(async () => {
  await runtime?.stop();
  if (home) await rm(home, { recursive: true, force: true });
});

test("serves health, runtime, and canonical browser assets", async () => {
  assert.deepEqual(await (await fetch(`${baseUrl}/health`)).json(), { ok: true, app: "kelly-wechat-crm" });
  const runtimeResponse = await fetch(`${baseUrl}/__airapp/runtime`);
  assert.deepEqual(await runtimeResponse.json(), {
    runtime: "standalone",
    knownRuntime: null,
    hosted: false,
    devProxy: false,
  });
  for (const path of ["/", "/styles.css", "/js/app.js", "/js/config.js"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
  }
});

test("starts disconnected without leaking credentials", async () => {
  const status = await (await fetch(`${baseUrl}/auth/status`)).json();
  assert.equal(status.connected, false);
  assert.equal(status.cloudBaseUrl, "https://busabase.com");
  assert.equal(status.readiness, "needs_connection");
  assert.equal(status.action, "connect");
  assert.equal(JSON.stringify(status).includes("token"), false);
});

test("rejects a cross-origin OAuth start", async () => {
  const response = await fetch(`${baseUrl}/auth/start`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://attacker.example" },
    body: "base_url=https%3A%2F%2Fbusabase.com",
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, baseUrl);
  assert.match(location.searchParams.get("oauth_error"), /origin did not match/i);
});
