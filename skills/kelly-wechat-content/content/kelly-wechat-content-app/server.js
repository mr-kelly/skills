import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createBusabaseAirAppLocalGateway, describeBusabaseAirAppRuntime } from "busabase-sdk/airapp-node";
import { Hono } from "hono";

const app = new Hono();
const gateway = createBusabaseAirAppLocalGateway({ appId: "kelly-wechat-content", successPath: "/", errorPath: "/" });
app.get("/health", (c) => c.json({ ok: true, app: "kelly-wechat-content" }));
app.get("/__airapp/runtime", (c) =>
  c.json({ ...describeBusabaseAirAppRuntime(), spaceId: process.env.BUSABASE_SPACE_ID || null }),
);
app.get("/auth/status", (c) => gateway.statusResponse(c.req.raw));
app.post("/auth/start", (c) => gateway.start(c.req.raw));
app.get("/auth/callback", (c) => gateway.callback(c.req.raw));
app.post("/auth/space", (c) => gateway.selectSpace(c.req.raw));
app.post("/auth/logout", (c) => gateway.logout(c.req.raw));
app.all("/api/v1/*", (c) => gateway.proxy(c.req.raw));
app.use("/*", serveStatic({ root: "./app" }));
app.onError((_error, c) => c.json({ error: "服务暂时无法完成请求，请重试。" }, 500));
const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port }, () => console.log(`AirApp listening on port ${port}`));
