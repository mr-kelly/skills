import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getFreePort, startProcess } from "../harness/process.mjs";

const appRoot = fileURLToPath(new URL("../../../skills/kelly-security/content/kelly-security-app/", import.meta.url));
const requireApp = createRequire(path.join(appRoot, "package.json"));
const sdk = await import(pathToFileURL(requireApp.resolve("busabase-sdk/airapp-node")).href);
const oauth = await import(pathToFileURL(requireApp.resolve("busabase-sdk/oauth-node")).href);
const browserHelpers = await import(pathToFileURL(path.join(appRoot, "app/vendor/busabase-airapp.js")).href);
const safeEnvironment = {
  BUSABASE_BASE_URL: "",
  BUSABASE_API_KEY: "",
  BUSABASE_SPACE_ID: "",
  BUSABASE_AIRAPP_RUNTIME: "",
};

const startApp = async (environment = {}) => {
  const port = await getFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const runtime = await startProcess({
    command: process.execPath,
    args: ["server.js"],
    cwd: appRoot,
    env: { ...safeEnvironment, ...environment, PORT: String(port) },
    readyUrl: `${origin}/health`,
  });
  return { ...runtime, origin };
};

test("standalone process serves health, real canonical assets and sanitized runtime metadata", async () => {
  const app = await startApp();
  try {
    const health = await fetch(`${app.origin}/health`);
    assert.deepEqual(await health.json(), { ok: true, app: "kelly-security" });
    for (const file of [
      "index.html",
      "js/app.js",
      "js/config.js",
      "js/views.js",
      "js/runtime.js",
      "js/providers/demo-provider.js",
      "vendor/busabase-sdk.js",
      "vendor/busabase-airapp.js",
      "vendor/busabase-airapp-gate.js",
      "styles.css",
      "styles/editorial.css",
    ]) {
      const response = await fetch(`${app.origin}/${file === "index.html" ? "" : file}`);
      assert.equal(response.status, 200, file);
      assert.equal(response.headers.get("cache-control"), "no-store", file);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", file);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer", file);
      assert.equal(await response.text(), await readFile(path.join(appRoot, "app", file), "utf8"), file);
    }
    const report = await (await fetch(`${app.origin}/__airapp/runtime`)).json();
    assert.equal(report.runtime, "standalone");
    assert.equal(report.hosted, false);
    assert.equal(report.devProxy, false);
    assert.equal(browserHelpers.shouldUseLocalAirAppGateway({ ...report, determined: true }), true);
    for (const sensitive of ["/server.js", "/package.json", "/.env", "/node_modules/busabase-sdk/package.json"])
      assert.equal((await fetch(`${app.origin}${sensitive}`)).status, 404, sensitive);
  } finally {
    await app.stop();
  }
});

test("a disconnected wrapper reports connection setup without exposing local credentials", async (context) => {
  const credentialExists = await stat(oauth.busabaseAirAppCredentialPath("kelly-security"))
    .then(() => true)
    .catch(() => false);
  if (credentialExists) {
    context.skip(
      "A real registration already exists; do not inspect or use it. Isolated SDK disconnected behavior is tested separately.",
    );
    return;
  }
  const app = await startApp();
  try {
    const response = await fetch(`${app.origin}/auth/status`);
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.connected, false);
    assert.equal(status.readiness, "needs_connection");
    assert.equal(status.action, "connect");
    assert.equal("accessToken" in status, false);
    assert.equal("refreshToken" in status, false);
  } finally {
    await app.stop();
  }
});

test("the wrapper rejects cross-origin OAuth starts before contacting a provider", async () => {
  const app = await startApp();
  try {
    const response = await fetch(`${app.origin}/auth/start`, {
      method: "POST",
      headers: { origin: "https://untrusted.example.test", "content-type": "application/json" },
      body: JSON.stringify({ base_url: "http://127.0.0.1:1" }),
      redirect: "manual",
    });
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location"));
    assert.equal(location.origin, app.origin);
    assert.match(location.searchParams.get("oauth_error"), /origin did not match/i);
  } finally {
    await app.stop();
  }
});

test("local and future hosted runtime names remain hosted on a loopback origin", async () => {
  for (const runtime of ["local", "future-test-engine"]) {
    const app = await startApp({ BUSABASE_AIRAPP_RUNTIME: runtime });
    try {
      const report = await (await fetch(`${app.origin}/__airapp/runtime`)).json();
      assert.equal(report.runtime, runtime);
      assert.equal(report.hosted, true);
      assert.equal(browserHelpers.shouldUseLocalAirAppGateway({ ...report, determined: true }), false);
    } finally {
      await app.stop();
    }
  }
});

const syntheticToken = "synthetic-test-access-token-no-real-account";
const spaces = [
  { id: "space-a", name: "Lab A", slug: "lab-a" },
  { id: "space-b", name: "Lab B", slug: "lab-b" },
];
const localRequest = (pathname, body) =>
  new Request(`http://127.0.0.1:49101${pathname}`, {
    method: "POST",
    headers: { origin: "http://127.0.0.1:49101", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** @param {{availableSpaces?: typeof spaces, selectedSpace?: {id: string, name: string}, useOAuth?: boolean}} [options] */
const fakeGateway = async ({ availableSpaces = spaces, selectedSpace, useOAuth = false } = {}) => {
  const directory = await mkdtemp(path.join(tmpdir(), "kelly-security-gateway-"));
  const calls = [];
  const upstream = { spaces: availableSpaces, status: 200, unavailable: false };
  const origin = "http://127.0.0.1:49102";
  const appId = "kelly-security-isolated-smoke";
  const credentialStore = { rootDir: directory };
  if (useOAuth)
    oauth.storeBusabaseAirAppOAuthCredential(
      {
        appId,
        baseUrl: origin,
        selectedSpace,
        tokenSet: {
          accessToken: syntheticToken,
          refreshToken: "synthetic-refresh-token-no-real-account",
          expiresIn: 3600,
          expiresAt: "2099-01-01T00:00:00Z",
          tokenType: "Bearer",
          scope: ["busabase"],
        },
      },
      credentialStore,
    );
  const gateway = sdk.createBusabaseAirAppLocalGateway({
    appId,
    credentialStore,
    environment: useOAuth ? {} : { BUSABASE_BASE_URL: origin, BUSABASE_API_KEY: syntheticToken },
    fetch: async (input, init = {}) => {
      const url = new URL(String(input));
      assert.equal(url.origin, origin, "A synthetic gateway attempted a non-test origin");
      const headers = new Headers(init.headers);
      calls.push({
        path: url.pathname,
        method: init.method || "GET",
        space: headers.get("x-busabase-space"),
        authorization: headers.get("authorization"),
      });
      if (upstream.unavailable) throw new Error("Synthetic upstream unavailable");
      if (url.pathname === "/api/v1/auth")
        return Response.json({ spaces: upstream.spaces }, { status: upstream.status });
      return Response.json({ ok: true });
    },
  });
  return {
    gateway,
    calls,
    upstream,
    credentialStore,
    appId,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
};

test("the real SDK gateway distinguishes zero, one and multiple accessible Spaces", async () => {
  /** @type {Array<[typeof spaces, string]>} */
  const cases = [
    [[], "needs_space"],
    [[spaces[0]], "ready"],
    [spaces, "needs_space"],
  ];
  for (const [availableSpaces, expected] of cases) {
    const fixture = await fakeGateway({ availableSpaces });
    try {
      const status = await fixture.gateway.status();
      assert.equal(status.readiness, expected);
      assert.equal(status.connected, true);
      assert.equal(JSON.stringify(status).includes(syntheticToken), false);
      assert.ok(fixture.calls.every((call) => call.path === "/api/v1/auth"));
      assert.equal(status.selectedSpace?.id || null, availableSpaces.length === 1 ? spaces[0].id : null);
    } finally {
      await fixture.cleanup();
    }
  }
});

test("selection is required before resource reads and browser headers cannot select a Space", async () => {
  const fixture = await fakeGateway();
  try {
    const denied = await fixture.gateway.proxy(
      new Request("http://127.0.0.1:49101/api/v1/nodes", { headers: { "x-busabase-space": "space-b" } }),
    );
    assert.equal(denied.status, 409);
    assert.equal((await denied.json()).data.reason, "SPACE_SELECTION_REQUIRED");
    assert.ok(fixture.calls.every((call) => call.path === "/api/v1/auth"));
    const selected = await fixture.gateway.selectSpace(localRequest("/auth/space", { space_id: "space-a" }));
    assert.equal(selected.status, 200);
    const result = await fixture.gateway.proxy(
      new Request("http://127.0.0.1:49101/api/v1/nodes", {
        headers: { "x-busabase-space": "space-b", authorization: "Bearer synthetic-untrusted-browser-token" },
      }),
    );
    assert.equal(result.status, 200);
    const forwarded = fixture.calls.find((call) => call.path === "/api/v1/nodes");
    assert.equal(forwarded.space, "space-a");
    assert.equal(forwarded.authorization, `Bearer ${syntheticToken}`);
    assert.equal(JSON.stringify(await result.json()).includes(syntheticToken), false);
  } finally {
    await fixture.cleanup();
  }
});

test("invalid Space choices do not create an authorized resource path", async () => {
  const fixture = await fakeGateway();
  try {
    const response = await fixture.gateway.selectSpace(
      localRequest("/auth/space", { space_id: "not-an-accessible-space" }),
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).data.reason, "SPACE_NOT_ALLOWED");
    assert.equal((await fixture.gateway.status()).readiness, "needs_space");
    assert.ok(fixture.calls.every((call) => call.path === "/api/v1/auth"));
  } finally {
    await fixture.cleanup();
  }
});

test("transient auth failure remains retryable instead of becoming an authentication failure", async () => {
  const fixture = await fakeGateway();
  try {
    fixture.upstream.status = 503;
    let status = await fixture.gateway.status();
    assert.equal(status.readiness, "retry");
    assert.equal(status.action, "retry");
    fixture.upstream.unavailable = true;
    status = await fixture.gateway.status();
    assert.equal(status.readiness, "retry");
    assert.equal(status.action, "retry");
    fixture.upstream.unavailable = false;
    fixture.upstream.status = 401;
    status = await fixture.gateway.status();
    assert.equal(status.readiness, "needs_auth");
    assert.equal(status.connected, false);
    fixture.upstream.status = 200;
    assert.equal((await fixture.gateway.status()).readiness, "needs_space");
  } finally {
    await fixture.cleanup();
  }
});

test("stale OAuth Space selection is cleared and logout removes isolated credentials", async () => {
  const fixture = await fakeGateway({ useOAuth: true, selectedSpace: { id: "old-space", name: "Old lab" } });
  try {
    const status = await fixture.gateway.status();
    assert.equal(status.readiness, "needs_space");
    assert.equal(
      oauth.loadBusabaseAirAppOAuthCredential(fixture.appId, fixture.credentialStore).selectedSpace,
      undefined,
    );
    const selected = await fixture.gateway.selectSpace(localRequest("/auth/space", { space_id: "space-b" }));
    assert.equal(selected.status, 200);
    assert.equal(
      oauth.loadBusabaseAirAppOAuthCredential(fixture.appId, fixture.credentialStore).selectedSpace.id,
      "space-b",
    );
    const loggedOut = await fixture.gateway.logout(localRequest("/auth/logout", {}));
    assert.equal(loggedOut.status, 200);
    assert.equal(oauth.loadBusabaseAirAppOAuthCredential(fixture.appId, fixture.credentialStore), null);
    assert.equal((await fixture.gateway.status()).readiness, "needs_connection");
  } finally {
    await fixture.cleanup();
  }
});

test("an isolated empty credential store does not initiate OAuth or contact any upstream", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "kelly-security-empty-gateway-"));
  try {
    let requests = 0;
    const gateway = sdk.createBusabaseAirAppLocalGateway({
      appId: "kelly-security-empty-smoke",
      environment: {},
      credentialStore: { rootDir: directory },
      fetch: async () => {
        requests++;
        throw new Error("Unexpected upstream call");
      },
    });
    assert.equal((await gateway.status()).readiness, "needs_connection");
    const response = await gateway.proxy(new Request("http://127.0.0.1:49101/api/v1/nodes"));
    assert.equal(response.status, 401);
    assert.equal(requests, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the actual app wrapper injects its selected Space and keeps bootstrap credentials off responses", async () => {
  const calls = [];
  const upstream = createServer((request, response) => {
    calls.push({
      path: request.url,
      authorization: request.headers.authorization,
      space: request.headers["x-busabase-space"],
    });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(request.url === "/api/v1/auth" ? { spaces } : { ok: true }));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = upstream.address();
  assert.ok(address && typeof address !== "string");
  const app = await startApp({
    BUSABASE_BASE_URL: `http://127.0.0.1:${address.port}`,
    BUSABASE_API_KEY: syntheticToken,
  });
  try {
    const initial = await (await fetch(`${app.origin}/auth/status`)).json();
    assert.equal(initial.readiness, "needs_space");
    assert.equal(JSON.stringify(initial).includes(syntheticToken), false);
    const selection = await fetch(`${app.origin}/auth/space`, {
      method: "POST",
      headers: { origin: app.origin, "content-type": "application/json" },
      body: JSON.stringify({ space_id: "space-a" }),
    });
    assert.equal(selection.status, 200);
    const response = await fetch(`${app.origin}/api/v1/nodes`, {
      headers: { "x-busabase-space": "space-b", authorization: "Bearer untrusted-browser-value" },
    });
    assert.deepEqual(await response.json(), { ok: true });
    const forwarded = calls.find((call) => call.path === "/api/v1/nodes");
    assert.equal(forwarded.space, "space-a");
    assert.equal(forwarded.authorization, `Bearer ${syntheticToken}`);
    for (const pathname of ["/", "/js/config.js", "/__airapp/runtime", "/auth/status"])
      assert.equal((await (await fetch(`${app.origin}${pathname}`)).text()).includes(syntheticToken), false, pathname);
  } finally {
    await app.stop();
    await new Promise((resolve, reject) => upstream.close((error) => (error ? reject(error) : resolve())));
  }
});
