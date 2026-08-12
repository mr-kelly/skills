import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createBusabaseAirAppLocalGateway } from "busabase-sdk/airapp-node";
import { Hono } from "hono";

const AIRAPP_ID = "kelly-social";

const app = new Hono();

/**
 * Canonical local gateway from busabase-sdk/airapp-node — see
 * kelly-app-skill-creator/references/busabase-data-contract.md: "do not
 * copy PKCE, token refresh, Space persistence, or proxy code into each
 * server.js." This replaces hand-rolled OAuth/Space/proxy code that
 * predated the export (busabase-sdk 0.11.0 didn't have it).
 *
 * Its proxy() always sets x-busabase-space from its OWN validated
 * selectedSpace — it never reads the header off the incoming request, which
 * is also what closes the confused-deputy gap the hand-rolled version had.
 */
const gateway = createBusabaseAirAppLocalGateway({
  appId: AIRAPP_ID,
  successPath: "/#/overview",
  errorPath: "/",
});

app.get("/health", (context) => context.json({ ok: true, app: "kelly-social" }));

/**
 * The ONLY sanctioned way for browser code to learn where it is running.
 * Busabase injects BUSABASE_AIRAPP_RUNTIME into the process it spawns; nobody
 * else sets it, so its absence is the positive fact "standalone". Never
 * classify this by hostname, iframe nesting, or path — a hosted AirApp is
 * served from localhost on Desktop/OSS, and a standalone run is reached over
 * LAN IPs and dev tunnels, so both directions of that guess are wrong.
 */
const AIRAPP_HOSTED_RUNTIMES = new Set(["nodepod", "local-node", "srt", "embed"]);
const airappRuntime = (process.env.BUSABASE_AIRAPP_RUNTIME || "").trim();
app.get("/__airapp/runtime", (context) =>
  context.json({
    runtime: airappRuntime || "standalone",
    hosted: AIRAPP_HOSTED_RUNTIMES.has(airappRuntime),
  }),
);

app.get("/auth/status", (context) => gateway.statusResponse(context.req.raw));
app.post("/auth/start", (context) => gateway.start(context.req.raw));
app.get("/auth/callback", (context) => gateway.callback(context.req.raw));
app.post("/auth/space", (context) => gateway.selectSpace(context.req.raw));
app.post("/auth/logout", (context) => gateway.logout(context.req.raw));
app.all("/api/v1/*", (context) => gateway.proxy(context.req.raw));

app.use("/*", async (context, next) => {
  await next();
  context.header("cache-control", "no-store");
});
app.use("/*", serveStatic({ root: "./app" }));
app.onError((error, context) => {
  console.error("kelly-social server error", error instanceof Error ? error.message : error);
  return context.json({ error: "Internal server error" }, 500);
});

const port = Number.parseInt(process.env.PORT || "3141", 10);
serve({ fetch: app.fetch, port }, () => {
  console.log(`AirApp listening on port ${port}`);
});
