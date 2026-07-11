import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Context, Hono } from "hono";

const SKILL_NAME = "kelly-behavior-predict";
const ENV_PREFIX = "KELLY_BEHAVIOR_PREDICT";
const HAS_BUSABASE = false;
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.resolve(appDir, "..");
const localConfigPath = path.join(skillDir, "config.local.json");
const userConfigPath = path.join(os.homedir(), ".config", SKILL_NAME, "config.json");
const onboardingPath = path.join(appDir, ".data", "onboarding.json");

type JsonObject = Record<string, unknown>;

async function readObject(filePath: string): Promise<JsonObject | null> {
  try {
    const value = JSON.parse(await fs.readFile(filePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

async function selectedConfig(): Promise<{ config: JsonObject | null; path: string | null }> {
  const explicit = process.env[`${ENV_PREFIX}_CONFIG`];
  for (const candidate of [explicit, localConfigPath, userConfigPath]) {
    if (!candidate) continue;
    const config = await readObject(candidate);
    if (config) return { config, path: candidate };
  }
  return { config: null, path: null };
}

function providerFrom(config: JsonObject | null): { provider: string; selected: boolean; envLocked: boolean } {
  const envValue = String(process.env[`${ENV_PREFIX}_DATA_PROVIDER`] || "")
    .trim()
    .toLowerCase();
  if (envValue) return { provider: envValue, selected: true, envLocked: true };
  const configured = String(config?.data_provider || "")
    .trim()
    .toLowerCase();
  if (configured) return { provider: configured, selected: true, envLocked: false };
  return { provider: "local", selected: false, envLocked: false };
}

async function setupPayload(demo = false): Promise<JsonObject> {
  if (demo) {
    return {
      provider_selected: true,
      provider_env_locked: false,
      provider: "local",
      state: "ready",
      demo: true,
    };
  }
  const selected = await selectedConfig();
  const provider = providerFrom(selected.config);
  const busabase = (selected.config?.busabase || {}) as JsonObject;
  const hosting = String(busabase.hosting || "hosted");
  const apiKeyEnv = `${ENV_PREFIX}_BUSABASE_API_KEY`;
  const secretReady = Boolean(process.env[apiKeyEnv]);
  const needsSecret = provider.provider === "busabase" && hosting !== "self_hosted" && !secretReady;
  return {
    provider_selected: provider.selected,
    provider_env_locked: provider.envLocked,
    provider: provider.provider,
    state: !provider.selected ? "choose_provider" : needsSecret ? "missing_secrets" : "ready",
    has_busabase: HAS_BUSABASE,
    config_path: selected.path,
    recommended_config: userConfigPath,
    recommended_env: path.join(os.homedir(), ".config", SKILL_NAME, ".env"),
    example_config: path.join(skillDir, "config.example.json"),
    missing_env: needsSecret ? [apiKeyEnv] : [],
    busabase: {
      hosting,
      base_url: String(process.env[`${ENV_PREFIX}_BUSABASE_URL`] || busabase.base_url || ""),
      space_id: String(process.env[`${ENV_PREFIX}_BUSABASE_SPACE_ID`] || busabase.space_id || ""),
      api_key_env: apiKeyEnv,
      api_key_configured: secretReady,
    },
  };
}

async function serveAsset(c: Context, filename: string, type: string) {
  try {
    const body = await fs.readFile(path.join(appDir, filename));
    return c.body(body as unknown as ArrayBuffer, 200, {
      "content-type": `${type}; charset=utf-8`,
      "cache-control": "no-store",
    });
  } catch {
    return c.text("Not found", 404);
  }
}

export function installSetup(app: Hono): void {
  app.use("/api/state", async (c, next) => {
    await next();
    const contentType = c.res.headers.get("content-type") || "";
    if (!contentType.includes("application/json") || !c.res.ok) return;
    try {
      const body = (await c.res.clone().json()) as JsonObject;
      body.setup = await setupPayload(new URL(c.req.url).searchParams.has("demo"));
      body.data_provider = (body.setup as JsonObject).provider;
      const headers = new Headers(c.res.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      headers.set("cache-control", "no-store");
      c.res = new Response(JSON.stringify(body), { status: c.res.status, headers });
    } catch {
      // Preserve non-object or streaming state responses unchanged.
    }
  });

  app.get("/api/setup", async (c) =>
    c.json({ setup: await setupPayload(new URL(c.req.url).searchParams.has("demo")) }),
  );

  app.post("/api/setup/provider", async (c) => {
    if (process.env[`${ENV_PREFIX}_DATA_PROVIDER`]) {
      return c.json({ error: "provider_is_locked_by_environment" }, 409);
    }
    const body = (await c.req.json().catch(() => ({}))) as JsonObject;
    const provider = String(body.provider || "")
      .trim()
      .toLowerCase();
    if (provider !== "local" && !(provider === "busabase" && HAS_BUSABASE)) {
      return c.json({ error: "unsupported_provider" }, 400);
    }
    const current = (await readObject(localConfigPath)) || {};
    const next: JsonObject = { ...current, data_provider: provider };
    if (provider === "busabase") {
      const prior = current.busabase && typeof current.busabase === "object" ? (current.busabase as JsonObject) : {};
      const busabase: JsonObject = {
        ...prior,
        hosting: body.hosting === "self_hosted" ? "self_hosted" : "hosted",
        base_url: String(body.base_url || prior.base_url || ""),
        space_id: String(body.space_id || prior.space_id || ""),
      };
      busabase.api_key = undefined;
      next.busabase = busabase;
    }
    await fs.writeFile(localConfigPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    const setup = await setupPayload();
    if (setup.state === "ready") {
      await fs.mkdir(path.dirname(onboardingPath), { recursive: true });
      await fs.writeFile(
        onboardingPath,
        `${JSON.stringify({ completed: true, completed_at: new Date().toISOString(), config_version: "1" }, null, 2)}\n`,
        { mode: 0o600 },
      );
    }
    return c.json({ ok: true, setup });
  });

  app.get("/setup-gate.js", (c) => serveAsset(c, "setup-gate.js", "text/javascript"));
  app.get("/setup-gate.css", (c) => serveAsset(c, "setup-gate.css", "text/css"));
}
