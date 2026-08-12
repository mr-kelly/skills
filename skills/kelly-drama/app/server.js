import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createBusabaseAirAppLocalGateway } from "busabase-sdk/airapp-node";
import { Hono } from "hono";

const AIRAPP_ID = "kelly-drama";

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

app.get("/health", (context) => context.json({ ok: true, app: "kelly-drama" }));

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

// Kelly Drama-specific addition (not part of the shared template every other
// converted skill's server.js copies verbatim): busabase-sdk's real `assets`
// client (createUploadUrl/confirm/get/download — verified present in the
// pinned busabase-sdk@0.11.0, see js/config.js's header comment) returns
// root-relative URLs OUTSIDE `/api/v1/*` for the actual bytes. Per
// packages/openlib/storage docs, a production self-hosted server's
// `LocalStorage` adapter is meant to mount its unauthenticated,
// key-addressed relay at `/api/storage/upload` (PUT) / `/api/storage/<key>`
// (GET) — apps/busabase/src/app/api/storage/**, real production routes, not
// under the versioned API. Proxying only that prefix is not enough in
// practice, though: live-tested against `npx busabase@0.11.0 server` (the
// exact target every converted skill's OSS integration test runs), that
// standalone CLI's `assets.createUploadUrl` returns an `/api/dev/upload`
// URL instead — and `/api/dev/*` 404s under the CLI's own production
// NODE_ENV ("Not available in production"), so a real Asset upload/download
// round trip does not complete against this specific CLI build regardless
// of this proxy (confirmed via a raw PUT + the SDK's own confirm()/get()
// against a fresh instance — see the PR description for the full trace).
// This is an upstream busabase-package gap, not something an AirApp can
// route around; `/api/dev/*` is proxied too so a differently-configured or
// future server that serves it (or does honor the `/api/storage/*` default)
// still works without a code change here.
// Reuses the same gateway.proxy() the /api/v1/* relay uses above, instead of
// a second hand-rolled fetch. It used to call a local authTarget() helper
// that lived in the pre-gateway server.js; that helper no longer exists post-
// migration, and the try/catch around it was silently turning the resulting
// ReferenceError into a misleading "Busabase OAuth session expired" for every
// request. gateway.proxy() derives the upstream URL from the request's own
// pathname (it isn't hardcoded to /api/v1), so it relays /api/storage/* and
// /api/dev/* correctly, and its disconnected-state error ("Busabase
// connection required") is exactly what this route contractually returns.
// It also now attaches x-busabase-space, which the old hand-rolled version
// never did — Busabase's Asset endpoints are Space-scoped like everything
// else, so this was a gap the old code had, not a behavior worth preserving.
// Hono's route matcher does not reliably multiplex a single `app.all(array,
// ...)` registration across two independent wildcard patterns (confirmed
// live: both patterns 404'd when registered together, but work individually)
// — so this is two registrations sharing one handler, not one call.
const storageRelay = (context) => gateway.proxy(context.req.raw);
app.all("/api/storage/*", storageRelay);
app.all("/api/dev/*", storageRelay);

app.use("/*", async (context, next) => {
  await next();
  context.header("cache-control", "no-store");
});
app.use("/*", serveStatic({ root: "./app" }));
app.onError((error, context) => {
  console.error("kelly-drama server error", error instanceof Error ? error.message : error);
  return context.json({ error: "Internal server error" }, 500);
});

const port = Number.parseInt(process.env.PORT || "3140", 10);
serve({ fetch: app.fetch, port }, () => {
  console.log(`AirApp listening on port ${port}`);
});
