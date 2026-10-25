import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createBusabaseAirAppLocalGateway, describeBusabaseAirAppRuntime } from "busabase-sdk/airapp-node";
import { Hono } from "hono";

const app = new Hono();
app.use("*", async (context, next) => {
  await next();
  context.header("Cache-Control", "no-store");
  context.header("X-Content-Type-Options", "nosniff");
  context.header("Referrer-Policy", "no-referrer");
});
const gateway = createBusabaseAirAppLocalGateway({
  appId: "kelly-security",
  successPath: "/",
  errorPath: "/",
});

app.get("/health", (context) => context.json({ ok: true, app: "kelly-security" }));

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
 * Busabase spawns this very process when it hosts the app, and injects
 * `BUSABASE_AIRAPP_RUNTIME` (`browser` | `local` | `remote` | `embed`).
 * Nobody else sets it, so its absence is the positive fact "standalone".
 * This route re-exposes that to the browser, which cannot read env vars.
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
 * The browser reads it through the SDK's `detectAirAppRuntime()`
 * (`busabase-sdk/airapp`, see `app/js/runtime.js`), which fetches it
 * RELATIVELY (`__airapp/runtime`, no leading slash). Under the Local Node
 * engine the app is reverse-proxied onto a sub-path of busabase's origin, so a
 * leading slash resolves against the origin root — busabase itself — and 404s.
 */
// Keep presence-based hosting detection centralized in the SDK. The helper
// also preserves unknown future engine names while exposing a narrowed
// `knownRuntime` for callers that genuinely need engine-specific behavior.
const airappRuntime = describeBusabaseAirAppRuntime();
app.get("/__airapp/runtime", (context) => context.json(airappRuntime));
console.log(`AirApp runtime: ${airappRuntime.runtime}`);

app.use("/*", serveStatic({ root: "./app" }));

const port = Number.parseInt(process.env.PORT || "3000", 10);
serve({ fetch: app.fetch, port, hostname: airappRuntime.hosted ? "0.0.0.0" : "127.0.0.1" }, () => {
  // Both Busabase runners discover the preview port from this exact phrase.
  console.log(`AirApp listening on port ${port}`);
});
