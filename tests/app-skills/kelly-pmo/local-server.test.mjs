import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getFreePort, startProcess } from "../harness/process.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-pmo", "content", "kelly-pmo-app");
let runtime;
let home;
let baseUrl;

test.before(async () => {
  home = await mkdtemp(join(tmpdir(), "kelly-pmo-home-"));
  baseUrl = `http://127.0.0.1:${await getFreePort()}`;
  runtime = await startProcess({
    command: process.execPath,
    args: ["server.js"],
    cwd: appRoot,
    env: { HOME: home, PORT: new URL(baseUrl).port },
    readyUrl: `${baseUrl}/health`,
  });
});
test.after(async () => {
  await runtime?.stop();
  if (home) await rm(home, { recursive: true, force: true });
});

test("serves health, runtime state, and canonical browser assets", async () => {
  assert.deepEqual(await (await fetch(`${baseUrl}/health`)).json(), { ok: true, app: "kelly-pmo" });
  assert.deepEqual(await (await fetch(`${baseUrl}/__airapp/runtime`)).json(), { runtime: "standalone", hosted: false });
  for (const path of ["/", "/app.js", "/styles.css", "/js/config.js", "/i18n/messages.js"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
  }
});

test("starts disconnected without exposing a credential", async () => {
  const status = await (await fetch(`${baseUrl}/auth/status`)).json();
  assert.equal(status.connected, false);
  assert.equal(status.cloudBaseUrl, "https://busabase.com");
  assert.equal(status.readiness, "needs_connection");
  assert.equal(status.action, "connect");
  assert.doesNotMatch(JSON.stringify(status), /access_token|refresh_token|api_key/i);
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
