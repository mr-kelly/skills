import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { getFreePort, startProcess } from "../harness/process.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-dog-walk", "content", "kelly-dog-walk-app");
let baseUrl;
let runtime;
let home;

test.before(async () => {
  const port = await getFreePort();
  home = await mkdtemp(join(tmpdir(), "kelly-dog-walk-home-"));
  baseUrl = `http://127.0.0.1:${port}`;
  runtime = await startProcess({
    command: process.execPath,
    args: ["server.js"],
    cwd: appRoot,
    env: { HOME: home, PORT: String(port), BUSABASE_AIRAPP_RUNTIME: "" },
    readyUrl: `${baseUrl}/health`,
  });
});

test.after(async () => {
  await runtime?.stop();
  if (home) await rm(home, { recursive: true, force: true });
});

test("serves health, the runtime fact, and the canonical browser assets", async () => {
  assert.deepEqual(await (await fetch(`${baseUrl}/health`)).json(), { ok: true, app: "kelly-dog-walk" });
  const runtimeFact = await (await fetch(`${baseUrl}/__airapp/runtime`)).json();
  assert.equal(runtimeFact.hosted, false);
  for (const path of ["/", "/app.js", "/styles.css", "/js/config.js", "/js/walk-model.js", "/demo-data.json"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
  }
});

test("starts disconnected without leaking a local credential", async () => {
  const status = await (await fetch(`${baseUrl}/auth/status`)).json();
  assert.equal(status.connected, false);
  assert.equal(status.readiness, "needs_connection");
});

test("rejects cross-origin OAuth starts", async () => {
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
