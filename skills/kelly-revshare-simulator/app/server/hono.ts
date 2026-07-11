import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { withLock } from "../../lib/common.ts";
import { LOCK_PATH } from "../../lib/paths.ts";
import { simulateScenario } from "../../lib/simulate.ts";
import type { ScenarioInput } from "../../lib/simulate.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";
import { installSetup } from "./setup.ts";
import {
  buildScenario,
  readBatch,
  readConfig,
  readLock,
  readOnboarding,
  summarizeConfig,
  writeBatch,
} from "./store.ts";
import type { Scenario } from "./types.ts";

// Platform-neutral Hono app. Speaks Web-standard fetch(Request)->Response and
// reaches storage only through lib/data-provider, so the same app.fetch runs
// under @hono/node-server locally and could deploy to Workers unchanged once
// the data layer is cloud-backed.

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function state(): Promise<Record<string, unknown>> {
  const [batch, onboarding, lock, configResult] = await Promise.all([
    readBatch(),
    readOnboarding(),
    readLock(),
    readConfig(),
  ]);
  return {
    app: "kelly-revshare-simulator",
    data_provider: process.env.KELLY_REVSHARE_SIMULATOR_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    config_summary: summarizeConfig(configResult),
    batch,
  };
}

export const app = new Hono();
installSetup(app);

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  const body = isDemoQuery(query) ? demoStatePayload(query) : await state();
  return c.body(JSON.stringify(body), 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
});

// Recompute-only preview: does not persist. Lets the UI show live results
// while the analyst is still tuning inputs before saving a named scenario.
app.post("/api/preview", async (c) => {
  const input = (await c.req.json()) as ScenarioInput;
  const result = simulateScenario(input);
  return c.json({ result });
});

app.post("/api/scenarios", async (c) => {
  const lock = await readLock();
  if (lock) return c.json({ error: "locked" }, 423);
  const body = (await c.req.json()) as { name: string; input: ScenarioInput };
  if (!body?.name || !body?.input) return c.json({ error: "name and input are required" }, 400);
  const scenario = buildScenario(body.name, body.input);
  await withLock(LOCK_PATH, "kelly-revshare-simulator", "Saving scenario", async () => {
    const batch = await readBatch();
    batch.scenarios.push(scenario);
    await writeBatch(batch);
  });
  return c.json({ scenario });
});

app.put("/api/scenarios/:id", async (c) => {
  const lock = await readLock();
  if (lock) return c.json({ error: "locked" }, 423);
  const id = c.req.param("id");
  const body = (await c.req.json()) as { name?: string; input?: ScenarioInput };
  let updated: Scenario | null = null;
  await withLock(LOCK_PATH, "kelly-revshare-simulator", "Updating scenario", async () => {
    const batch = await readBatch();
    const index = batch.scenarios.findIndex((s) => s.id === id);
    if (index === -1) return;
    const existing = batch.scenarios[index];
    const nextInput = body.input || existing.input;
    updated = {
      ...existing,
      name: body.name || existing.name,
      input: nextInput,
      result: simulateScenario(nextInput),
      updated_at: new Date().toISOString(),
    };
    batch.scenarios[index] = updated;
    await writeBatch(batch);
  });
  if (!updated) return c.json({ error: "not found" }, 404);
  return c.json({ scenario: updated });
});

app.post("/api/scenarios/:id/decision", async (c) => {
  const lock = await readLock();
  if (lock) return c.json({ error: "locked" }, 423);
  const id = c.req.param("id");
  const body = (await c.req.json()) as { action: Scenario["decision"]["action"]; note?: string };
  let updated: Scenario | null = null;
  await withLock(LOCK_PATH, "kelly-revshare-simulator", "Recording decision", async () => {
    const batch = await readBatch();
    const index = batch.scenarios.findIndex((s) => s.id === id);
    if (index === -1) return;
    batch.scenarios[index] = {
      ...batch.scenarios[index],
      decision: { action: body.action, note: body.note || "", decided_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    };
    updated = batch.scenarios[index];
    await writeBatch(batch);
  });
  if (!updated) return c.json({ error: "not found" }, 404);
  return c.json({ scenario: updated });
});

app.delete("/api/scenarios/:id", async (c) => {
  const lock = await readLock();
  if (lock) return c.json({ error: "locked" }, 423);
  const id = c.req.param("id");
  await withLock(LOCK_PATH, "kelly-revshare-simulator", "Deleting scenario", async () => {
    const batch = await readBatch();
    batch.scenarios = batch.scenarios.filter((s) => s.id !== id);
    await writeBatch(batch);
  });
  return c.json({ ok: true });
});

// ---- Static (vanilla frontend) ----
app.get("/*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    return c.text("Forbidden", 403);
  }
  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return c.text("Not found", 404);
  }
  return c.body(data as unknown as ArrayBuffer, 200, {
    "content-type": types[path.extname(filePath)] || "application/octet-stream",
  });
});

app.onError((err, c) => c.json({ error: err.message }, 500));
