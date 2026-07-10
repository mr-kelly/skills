import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { TOOL_CATALOG } from "../../lib/tool-catalog.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";
import {
  activateAgent,
  applyUpdate,
  archiveAgent,
  createAgent,
  missingRequiredFields,
  pauseAgent,
  readAgentsFile,
  readConfig,
  readLock,
  readOnboarding,
  summarize,
  toView,
  writeAgentsFile,
  writeOnboarding,
} from "./store.ts";

// Platform-neutral Hono app. Speaks the Web-standard fetch(Request)->Response
// contract so the same app.fetch can run under @hono/node-server locally or,
// once the data layer moves to a cloud provider, on Cloudflare Workers.
//
// BOUNDARY: this app never provisions or calls a real agent. It only reads and
// writes the local app/.data/agents.json handoff file. There is no outbound
// network call anywhere in this file.

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function state(): Promise<Record<string, unknown>> {
  const [file, lock, configResult, onboarding] = await Promise.all([
    readAgentsFile(),
    readLock(),
    readConfig(),
    readOnboarding(),
  ]);
  return {
    app: "kelly-agent-builder",
    data_provider: process.env.KELLY_AGENT_BUILDER_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    config_summary: { config_path: configResult.path, is_example: configResult.is_example },
    lock,
    summary: summarize(file.agents),
    agents: file.agents.map(toView),
  };
}

export const app = new Hono();

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  const body = isDemoQuery(query) ? demoStatePayload(query) : await state();
  return c.body(JSON.stringify(body), 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
});

app.get("/api/tool-catalog", (c) => c.json({ tools: TOOL_CATALOG }));

// Onboarding for this skill is trivial (no external accounts/secrets to
// collect — it only manages mock local records), but the marker still gates
// "real" work per the App-in-Skill onboarding contract.
app.post("/api/onboarding/complete", async (c) => {
  const onboarding = { completed: true, completed_at: new Date().toISOString(), config_version: "1" };
  await writeOnboarding(onboarding);
  return c.json({ onboarding });
});

app.get("/api/agents", async (c) => {
  const file = await readAgentsFile();
  return c.json({ summary: summarize(file.agents), agents: file.agents.map(toView) });
});

app.get("/api/agents/:id", async (c) => {
  const file = await readAgentsFile();
  const agent = file.agents.find((a) => a.id === c.req.param("id"));
  if (!agent) return c.json({ error: "not_found" }, 404);
  return c.json({ agent: toView(agent) });
});

app.post("/api/agents", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const file = await readAgentsFile();
  const agent = createAgent(file.agents, body);
  file.agents.push(agent);
  await writeAgentsFile(file);
  return c.json({ agent: toView(agent) }, 201);
});

app.put("/api/agents/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const file = await readAgentsFile();
  const index = file.agents.findIndex((a) => a.id === id);
  if (index === -1) return c.json({ error: "not_found" }, 404);
  if (file.agents[index].status === "archived") {
    return c.json({ error: "archived_agents_are_read_only" }, 409);
  }
  const updated = applyUpdate(file.agents[index], body);
  // A live agent must never be left in a state that would fail the same
  // required-field gate activation enforces — otherwise a PUT could silently
  // undo the invariant activateAgent() guarantees (e.g. clearing owning_team
  // or allowed_tools on an already-live agent).
  if (updated.status === "live") {
    const missing = missingRequiredFields(updated);
    if (missing.length) {
      return c.json({ error: "missing_required_fields", missing_fields: missing }, 422);
    }
  }
  file.agents[index] = updated;
  await writeAgentsFile(file);
  return c.json({ agent: toView(file.agents[index]) });
});

// Draft -> live. Gated server-side: never trust client-side validation alone.
app.post("/api/agents/:id/activate", async (c) => {
  const id = c.req.param("id");
  const file = await readAgentsFile();
  const index = file.agents.findIndex((a) => a.id === id);
  if (index === -1) return c.json({ error: "not_found" }, 404);
  const result = activateAgent(file.agents[index]);
  if (!result.ok) {
    return c.json({ error: result.reason, missing_fields: result.missing_fields || [] }, 422);
  }
  file.agents[index] = result.agent!;
  await writeAgentsFile(file);
  return c.json({ agent: toView(file.agents[index]) });
});

app.post("/api/agents/:id/pause", async (c) => {
  const id = c.req.param("id");
  const file = await readAgentsFile();
  const index = file.agents.findIndex((a) => a.id === id);
  if (index === -1) return c.json({ error: "not_found" }, 404);
  if (file.agents[index].status !== "live") return c.json({ error: "only_live_agents_can_be_paused" }, 409);
  file.agents[index] = pauseAgent(file.agents[index]);
  await writeAgentsFile(file);
  return c.json({ agent: toView(file.agents[index]) });
});

// Archive, allowed from any state.
app.post("/api/agents/:id/archive", async (c) => {
  const id = c.req.param("id");
  const file = await readAgentsFile();
  const index = file.agents.findIndex((a) => a.id === id);
  if (index === -1) return c.json({ error: "not_found" }, 404);
  file.agents[index] = archiveAgent(file.agents[index]);
  await writeAgentsFile(file);
  return c.json({ agent: toView(file.agents[index]) });
});

// ---- Static (vanilla frontend) ----
// Mirrors the App-in-Skill Hono static convention: normalize under APP_DIR,
// block .data/, "/" -> index.html, content-type by extension, 403 on escape,
// 404 on missing file.
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
