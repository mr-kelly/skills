import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createBusabaseAirAppLocalGateway, describeBusabaseAirAppRuntime } from "busabase-sdk/airapp-node";
import { Hono } from "hono";

const AIRAPP_ID = "kelly-dog-walk";

const app = new Hono();

// Canonical local gateway from busabase-sdk/airapp-node: OAuth, Space selection and the /api/v1
// proxy. Its proxy sets x-busabase-space from its own validated choice and never trusts the
// browser's header. Only used when this process runs standalone (`pnpm dev`).
const gateway = createBusabaseAirAppLocalGateway({ appId: AIRAPP_ID, successPath: "/", errorPath: "/" });

app.get("/health", (context) => context.json({ ok: true, app: AIRAPP_ID }));

// The only sanctioned way for browser code to learn where it runs: Busabase injects
// BUSABASE_AIRAPP_RUNTIME into the process it hosts, and its absence means standalone.
// Never guessed from the hostname, iframe nesting, or the URL path.
app.get("/__airapp/runtime", (context) => context.json(describeBusabaseAirAppRuntime()));

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
  console.error("kelly-dog-walk server error", error instanceof Error ? error.message : error);
  return context.json({ error: "Internal server error" }, 500);
});

const port = Number.parseInt(process.env.PORT || "3161", 10);
serve({ fetch: app.fetch, port }, () => {
  console.log(`AirApp listening on port ${port}`);
});
