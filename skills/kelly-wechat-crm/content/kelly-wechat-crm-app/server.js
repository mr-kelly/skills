import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createBusabaseAirAppLocalGateway, describeBusabaseAirAppRuntime } from "busabase-sdk/airapp-node";
import { Hono } from "hono";
import { readWechatStatus, searchWechatContacts } from "./wechat-status.mjs";

const app = new Hono();
const gateway = createBusabaseAirAppLocalGateway({
  appId: "kelly-wechat-crm",
  successPath: "/",
  errorPath: "/",
  requestTimeoutMs: 30_000,
});

app.get("/health", (context) => context.json({ ok: true, app: "kelly-wechat-crm" }));
app.get("/__wechat/status", async (context) => {
  context.header("cache-control", "no-store");
  return context.json(await readWechatStatus());
});
app.get("/__wechat/contacts", async (context) => {
  context.header("cache-control", "no-store");
  const query = new URL(context.req.url).searchParams.get("q") || "";
  if (!query.trim()) return context.json({ query: "", totalMatches: 0, results: [] });
  try {
    return context.json(await searchWechatContacts(query));
  } catch {
    return context.json({ error: "WECHAT_CONTACT_SEARCH_FAILED" }, 503);
  }
});

// These routes are used only by a standalone top-level loopback preview. In a
// Busabase-hosted Run, the browser skips this gate and Busabase owns /api/v1.
app.get("/auth/status", (context) => gateway.statusResponse(context.req.raw));
app.post("/auth/start", (context) => gateway.start(context.req.raw));
app.get("/auth/callback", (context) => gateway.callback(context.req.raw));
app.post("/auth/space", (context) => gateway.selectSpace(context.req.raw));
app.post("/auth/logout", (context) => gateway.logout(context.req.raw));
app.all("/api/v1/*", (context) => gateway.proxy(context.req.raw));

/**
 * The ONLY sanctioned way for browser code to learn where it is running.
 *
 * Busabase spawns this very process when it hosts the app and injects a
 * non-empty `BUSABASE_AIRAPP_RUNTIME`. Nobody else sets it, so its absence is
 * the positive fact "standalone". The SDK translates that into the report this
 * route re-exposes to the browser, which cannot read env vars.
 *
 * Never classify the environment by hostname. A Busabase-hosted AirApp is
 * routinely served from `localhost` (Desktop/OSS runs on
 * `http://localhost:15419`), and a standalone `npm run dev` is routinely
 * reached over a LAN IP or a signed dev tunnel such as
 * `https://3111-….dev.budaapps.com`. Either hostname test misfires, and the
 * "not localhost ⇒ hosted" direction fails the worst: the app hides its own
 * connection gate, calls `/api/v1` with no credential, and shows the user an
 * error they have no way to act on.
 *
 * `devProxy` is a separate axis on purpose. "Where am I running" and "do I
 * have credentials" are two different states, and collapsing them into one
 * boolean is what produces UI claiming to be connected when it isn't. It
 * reports only the non-interactive env bootstrap; the interactive answer is
 * the gateway's own `/auth/status`.
 *
 * Browser code must fetch this RELATIVELY (`__airapp/runtime`, no leading
 * slash). A hosted app can be reverse-proxied onto a sub-path of Busabase's
 * origin, so a leading slash resolves against the origin root — Busabase
 * itself — and 404s.
 */
// The SDK decides hosting from presence, preserves unknown future engine names,
// and reports the current known alias separately.
const airappRuntime = describeBusabaseAirAppRuntime();
app.get("/__airapp/runtime", (context) => context.json(airappRuntime));
console.log(`AirApp runtime: ${airappRuntime.runtime}`);

app.use("/*", async (context, next) => {
  await next();
  context.header("cache-control", "no-store");
});
app.use("/*", serveStatic({ root: "./app" }));
app.onError((error, context) => {
  console.error("kelly-wechat-crm server error", error instanceof Error ? error.message : error);
  return context.json({ error: "Internal server error" }, 500);
});

const port = Number.parseInt(process.env.PORT || "3000", 10);
serve({ fetch: app.fetch, port }, () => {
  // Both Busabase runners discover the preview port from this exact phrase.
  console.log(`AirApp listening on port ${port}`);
});
