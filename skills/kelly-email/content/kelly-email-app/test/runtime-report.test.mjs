import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../server/hono.ts";

test("runtime report treats presence as hosted even for a future engine name", async (t) => {
  const original = process.env.BUSABASE_AIRAPP_RUNTIME;
  t.after(() => {
    if (original === undefined) Reflect.deleteProperty(process.env, "BUSABASE_AIRAPP_RUNTIME");
    else process.env.BUSABASE_AIRAPP_RUNTIME = original;
  });

  process.env.BUSABASE_AIRAPP_RUNTIME = "future-engine";
  const hosted = await (await app.request("http://localhost/__airapp/runtime")).json();
  assert.equal(hosted.runtime, "future-engine");
  assert.equal(hosted.knownRuntime, null);
  assert.equal(hosted.hosted, true);

  Reflect.deleteProperty(process.env, "BUSABASE_AIRAPP_RUNTIME");
  const standalone = await (await app.request("http://localhost/__airapp/runtime")).json();
  assert.equal(standalone.runtime, "standalone");
  assert.equal(standalone.hosted, false);
});
