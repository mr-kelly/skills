import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  busabaseAirAppCredentialPath,
  clearBusabaseAirAppOAuthCredential,
  loadBusabaseAirAppOAuthCredential,
  storeBusabaseAirAppOAuthCredential,
} from "../app/vendor/busabase-oauth-node.js";

const withStore = async (run) => {
  const root = await mkdtemp(join(tmpdir(), "kelly-invest-stock-oauth-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

test("registers the local OAuth token set under the Busabase AirApp directory", () =>
  withStore(async (root) => {
    const stored = storeBusabaseAirAppOAuthCredential(
      {
        appId: "kelly-invest-stock",
        baseUrl: "https://busabase.com",
        clientId: "busabase-airapp",
        tokenSet: {
          accessToken: "bso_access",
          refreshToken: "bsr_refresh",
          expiresAt: "2026-08-01T00:00:00.000Z",
          scope: ["api"],
          tokenType: "Bearer",
        },
      },
      { rootDir: root },
    );
    const path = busabaseAirAppCredentialPath("kelly-invest-stock", { rootDir: root });
    assert.equal(path, join(root, "airapps", "kelly-invest-stock.json"));
    assert.deepEqual(loadBusabaseAirAppOAuthCredential("kelly-invest-stock", { rootDir: root }), stored);
    if (process.platform !== "win32") {
      assert.equal(statSync(join(root, "airapps")).mode & 0o777, 0o700);
      assert.equal(statSync(path).mode & 0o777, 0o600);
    }
    clearBusabaseAirAppOAuthCredential("kelly-invest-stock", { rootDir: root });
    assert.equal(loadBusabaseAirAppOAuthCredential("kelly-invest-stock", { rootDir: root }), null);
  }));

test("rejects path-like AirApp ids", () =>
  withStore(async (root) => {
    assert.throws(() => busabaseAirAppCredentialPath("../other", { rootDir: root }), /AirApp id must use/);
  }));
