import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { getFreePort, startProcess } from "../harness/process.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-portrait-retouch", "app");
let baseUrl;
let runtime;
let home;

test.before(async () => {
  const port = await getFreePort();
  home = await mkdtemp(join(tmpdir(), "kelly-portrait-retouch-home-"));
  baseUrl = `http://127.0.0.1:${port}`;
  runtime = await startProcess({
    command: process.execPath,
    args: ["server.js"],
    cwd: appRoot,
    env: { HOME: home, PORT: String(port) },
    readyUrl: `${baseUrl}/health`,
  });
});

test.after(async () => {
  await runtime?.stop();
  if (home) await rm(home, { recursive: true, force: true });
});

test("serves health, app assets, and demo portraits without caching", async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.deepEqual(await health.json(), { ok: true, app: "kelly-portrait-retouch" });
  for (const pathname of ["/", "/styles.css", "/app.js", "/js/config.js", "/assets/demo/portrait-source.jpg"]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get("cache-control"), "no-store", pathname);
  }
});

test("starts disconnected and rejects cross-origin OAuth", async () => {
  const status = await fetch(`${baseUrl}/auth/status`);
  const statusBody = await status.json();
  assert.equal(statusBody.connected, false);
  assert.equal(statusBody.cloudBaseUrl, "https://busabase.com");
  assert.equal(statusBody.readiness, "needs_connection");
  assert.equal(statusBody.action, "connect");
  const response = await fetch(`${baseUrl}/auth/start`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://attacker.example" },
    body: "base_url=https%3A%2F%2Fbusabase.com",
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  assert.match(new URL(response.headers.get("location")).searchParams.get("oauth_error"), /origin did not match/i);
});
