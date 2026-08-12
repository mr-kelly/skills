import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { getFreePort, startProcess } from "../harness/process.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-jobhunt", "app");
let baseUrl;
let runtime;
let home;

test.before(async () => {
  const port = await getFreePort();
  home = await mkdtemp(join(tmpdir(), "kelly-jobhunt-home-"));
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

test("serves health and canonical browser assets", async () => {
  const healthResponse = await fetch(`${baseUrl}/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { ok: true, app: "kelly-jobhunt", mode: "outreach-desk" });

  for (const path of ["/", "/styles.css", "/js/app.js", "/js/config.js"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
  }
});

test("starts disconnected without leaking a local credential", async () => {
  const response = await fetch(`${baseUrl}/auth/status`);
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.connected, false);
  assert.equal(status.cloudBaseUrl, "https://busabase.com");
  assert.equal(status.readiness, "needs_connection");
  assert.equal(status.action, "connect");
});

test("rejects cross-origin OAuth starts", async () => {
  const response = await fetch(`${baseUrl}/auth/start`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://attacker.example",
    },
    body: "base_url=https%3A%2F%2Fbusabase.com",
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, baseUrl);
  assert.match(location.searchParams.get("oauth_error"), /origin did not match/i);
});

test("requires an explicit valid Space before proxying a multi-Space account", async () => {
  let spaces = [
    { id: "spc_alpha", name: "Alpha", slug: "alpha", plan: "free" },
    { id: "spc_beta", name: "Beta", slug: "beta", plan: "pro" },
  ];
  const proxiedSpaces = [];
  const upstreamPort = await getFreePort();
  const upstream = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/v1/auth") {
      const selected = request.headers["x-busabase-space"] || "";
      if (selected && !spaces.some((space) => space.id === selected)) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: "unknown space" }));
        return;
      }
      response.end(JSON.stringify({ spaces, space: spaces.find((space) => space.id === selected) || null }));
      return;
    }
    if (request.url === "/api/v1/nodes") {
      proxiedSpaces.push(request.headers["x-busabase-space"] || "");
      response.end(JSON.stringify({ nodes: [] }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve));

  const appPort = await getFreePort();
  const connectedUrl = `http://127.0.0.1:${appPort}`;
  const connectedRuntime = await startProcess({
    command: process.execPath,
    args: ["server.js"],
    cwd: appRoot,
    env: {
      HOME: home,
      PORT: String(appPort),
      BUSABASE_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
    },
    readyUrl: `${connectedUrl}/health`,
  });

  try {
    const ambiguous = await fetch(`${connectedUrl}/auth/status`);
    const ambiguousStatus = await ambiguous.json();
    assert.equal(ambiguousStatus.connected, true);
    assert.equal(ambiguousStatus.baseUrl, `http://127.0.0.1:${upstreamPort}`);
    assert.equal(ambiguousStatus.source, "open-server");
    assert.equal(ambiguousStatus.readiness, "needs_space");
    assert.equal(ambiguousStatus.action, "select_space");
    assert.equal(ambiguousStatus.requiresSpace, true);
    assert.equal(ambiguousStatus.space, null);
    assert.deepEqual(ambiguousStatus.spaces, spaces);

    const bypass = await fetch(`${connectedUrl}/api/v1/nodes`, {
      headers: { "x-busabase-space": "spc_alpha" },
    });
    assert.equal(bypass.status, 409);
    assert.deepEqual(proxiedSpaces, []);

    const invalid = await fetch(`${connectedUrl}/auth/space`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: connectedUrl,
      },
      body: "space_id=spc_unknown",
    });
    assert.equal(invalid.status, 403);
    assert.match((await invalid.json()).error, /not accessible to this account/i);

    const selected = await fetch(`${connectedUrl}/auth/space`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: connectedUrl,
      },
      body: "space_id=spc_beta",
    });
    assert.equal(selected.status, 200);
    assert.equal(selected.headers.get("set-cookie"), null);

    const ready = await fetch(`${connectedUrl}/auth/status`);
    const readyStatus = await ready.json();
    assert.equal(readyStatus.requiresSpace, false);
    assert.equal(readyStatus.space.id, "spc_beta");

    const proxied = await fetch(`${connectedUrl}/api/v1/nodes`, {
      headers: { "x-busabase-space": "spc_alpha" },
    });
    assert.equal(proxied.status, 200);
    assert.deepEqual(proxiedSpaces, ["spc_beta"]);

    spaces = [{ id: "local", name: "Local", slug: "local", plan: "oss" }];
    const single = await fetch(`${connectedUrl}/auth/status`);
    const singleStatus = await single.json();
    assert.equal(singleStatus.requiresSpace, false);
    assert.equal(singleStatus.space.id, "local");
    assert.equal(single.headers.get("set-cookie"), null);

    spaces = [];
    const none = await fetch(`${connectedUrl}/auth/status`);
    const noneStatus = await none.json();
    assert.equal(noneStatus.connected, true);
    assert.equal(noneStatus.baseUrl, `http://127.0.0.1:${upstreamPort}`);
    assert.equal(noneStatus.source, "open-server");
    assert.equal(noneStatus.readiness, "needs_space");
    assert.equal(noneStatus.action, "retry");
    assert.equal(noneStatus.requiresSpace, true);
    assert.equal(noneStatus.space, null);
    assert.deepEqual(noneStatus.spaces, []);
  } finally {
    await connectedRuntime.stop();
    await new Promise((resolve, reject) => upstream.close((error) => (error ? reject(error) : resolve())));
  }
});
