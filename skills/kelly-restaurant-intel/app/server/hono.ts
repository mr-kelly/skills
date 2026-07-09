import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { appDir } from "./paths.ts";
import { readBatch, readDecisions, readState, saveDecision } from "./store.ts";

export const app = new Hono();

function wantsDemo(c: any) {
  return Boolean(c.req.query("demo"));
}

app.get("/api/state", async (c) => c.json(await readState(wantsDemo(c))));
app.get("/api/batch", async (c) => c.json(await readBatch(wantsDemo(c))));
app.get("/api/decisions", async (c) => c.json(await readDecisions()));
app.post("/api/decisions/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await saveDecision(c.req.param("id"), body);
  return c.json(result, result.ok ? 200 : 409);
});

async function fileResponse(relativePath: string, contentType: string) {
  const body = await fs.readFile(path.join(appDir, relativePath), "utf8");
  return new Response(body, { headers: { "content-type": contentType } });
}

app.get("/app.js", async () => fileResponse("app.js", "text/javascript; charset=utf-8"));
app.get("/styles.css", async () => fileResponse("styles.css", "text/css; charset=utf-8"));
app.get("/i18n/messages.js", async () =>
  fileResponse(path.join("i18n", "messages.js"), "text/javascript; charset=utf-8"),
);
app.get("/", async (c) => c.html(await fs.readFile(path.join(appDir, "index.html"), "utf8")));
app.get("*", async (c) => c.html(await fs.readFile(path.join(appDir, "index.html"), "utf8")));
