import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { getFreePort, startProcess } from "../harness/process.mjs";
import { repoRoot } from "./oss.mjs";

export const registerGatewayConformance = async (skill) => {
  const root = path.join(repoRoot, "skills", skill, "content", `${skill}-app`);
  const resolve = createRequire(path.join(root, "package.json"));
  const sdk = await import(pathToFileURL(resolve.resolve("busabase-sdk/airapp-node")).href);
  const oauth = await import(pathToFileURL(resolve.resolve("busabase-sdk/oauth-node")).href);
  const spaces = [
    { id: "space-a", name: "Synthetic A" },
    { id: "space-b", name: "Synthetic B" },
  ];
  const token = "synthetic-gateway-token";
  const local = (pathname, body) =>
    new Request(`http://127.0.0.1:49101${pathname}`, {
      method: "POST",
      headers: { origin: "http://127.0.0.1:49101", "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test(`${skill}: the actual standalone wrapper serves canonical bytes and rejects cross-origin OAuth`, async (t) => {
    const port = await getFreePort();
    const origin = `http://127.0.0.1:${port}`;
    const app = await startProcess({
      command: process.execPath,
      args: ["server.js"],
      cwd: root,
      env: {
        PORT: String(port),
        BUSABASE_BASE_URL: "",
        BUSABASE_API_KEY: "",
        BUSABASE_SPACE_ID: "",
        BUSABASE_AIRAPP_RUNTIME: "",
      },
      readyUrl: `${origin}/health`,
    });
    t.after(() => app.stop());
    assert.deepEqual(await (await fetch(`${origin}/health`)).json(), { ok: true, app: skill });
    for (const asset of ["js/app.js", "js/config.js", "styles.css", "vendor/busabase-sdk.js"]) {
      const response = await fetch(`${origin}/${asset}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(await response.text(), await readFile(path.join(root, "app", asset), "utf8"));
    }
    for (const pathname of ["/.env", "/server.js", "/package.json"])
      assert.equal((await fetch(`${origin}${pathname}`)).status, 404);
    const response = await fetch(`${origin}/auth/start`, {
      method: "POST",
      headers: { origin: "https://synthetic-untrusted.example.test", "content-type": "application/json" },
      body: JSON.stringify({ base_url: "http://127.0.0.1:1" }),
      redirect: "manual",
    });
    assert.equal(response.status, 303);
    const destination = new URL(response.headers.get("location"));
    assert.equal(destination.origin, origin);
    assert.match(destination.searchParams.get("oauth_error"), /origin did not match/i);
  });

  test(`${skill}: deterministic fake upstream enforces Space selection, credential privacy and retry states`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), `${skill}-fake-oauth-`));
    const calls = [];
    const state = { spaces, status: 200 };
    const credentialStore = { rootDir: directory };
    const appId = `${skill}-isolated-gateway`;
    try {
      oauth.storeBusabaseAirAppOAuthCredential(
        {
          appId,
          baseUrl: "http://127.0.0.1:49102",
          selectedSpace: { id: "stale-space", name: "Stale synthetic" },
          tokenSet: {
            accessToken: token,
            refreshToken: "synthetic-refresh",
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
        environment: {},
        fetch: async (input, init = {}) => {
          const url = new URL(String(input));
          assert.equal(url.origin, "http://127.0.0.1:49102");
          const headers = new Headers(init.headers);
          calls.push({
            path: url.pathname,
            space: headers.get("x-busabase-space"),
            authorization: headers.get("authorization"),
          });
          return Response.json(url.pathname === "/api/v1/auth" ? { spaces: state.spaces } : { ok: true }, {
            status: state.status,
          });
        },
      });
      assert.equal((await gateway.status()).readiness, "needs_space");
      assert.equal(oauth.loadBusabaseAirAppOAuthCredential(appId, credentialStore).selectedSpace, undefined);
      assert.equal(
        (
          await gateway.proxy(
            new Request("http://127.0.0.1:49101/api/v1/nodes", { headers: { "x-busabase-space": "space-b" } }),
          )
        ).status,
        409,
      );
      assert.ok(calls.every((call) => call.path === "/api/v1/auth"));
      assert.equal((await gateway.selectSpace(local("/auth/space", { space_id: "foreign-space" }))).status, 403);
      assert.equal((await gateway.selectSpace(local("/auth/space", { space_id: "space-a" }))).status, 200);
      const result = await gateway.proxy(
        new Request("http://127.0.0.1:49101/api/v1/nodes", {
          headers: { "x-busabase-space": "space-b", authorization: "Bearer synthetic-browser-token" },
        }),
      );
      assert.equal(result.status, 200);
      const forwarded = calls.find((call) => call.path === "/api/v1/nodes");
      assert.equal(forwarded.space, "space-a");
      assert.equal(forwarded.authorization, `Bearer ${token}`);
      assert.ok(!JSON.stringify(await result.json()).includes(token));
      state.status = 503;
      assert.equal((await gateway.status()).readiness, "retry");
      state.status = 401;
      assert.equal((await gateway.status()).readiness, "needs_auth");
      state.status = 200;
      assert.equal((await gateway.logout(local("/auth/logout", {}))).status, 200);
      assert.equal(oauth.loadBusabaseAirAppOAuthCredential(appId, credentialStore), null);
      assert.equal((await gateway.status()).readiness, "needs_connection");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
};
