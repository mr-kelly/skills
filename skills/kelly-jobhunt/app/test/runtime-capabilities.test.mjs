import assert from "node:assert/strict";
import test from "node:test";

import { oauthCallbackCapability } from "../runtime-capabilities.js";

test("allows local OAuth on a direct loopback URL", () => {
  assert.deepEqual(oauthCallbackCapability(new Request("http://127.0.0.1:3111/")), {
    oauthCallbackSupported: true,
  });
});

test("reports an unsupported callback without matching a platform domain", () => {
  const request = new Request("http://localhost:3111/", {
    headers: { "x-forwarded-host": "external-preview" },
  });
  assert.deepEqual(oauthCallbackCapability(request), {
    oauthCallbackSupported: false,
  });
});
