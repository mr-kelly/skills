import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { appDir, defaultHost, defaultPort } from "../../lib/paths.mjs";
import { ensureDirs } from "../../lib/common.mjs";
import { createProvider } from "../../lib/data-provider/index.mjs";
import { demoState, isDemoQuery } from "./demo.mjs";

const host = process.env.KELLY_CONTENT_UI_HOST || defaultHost;
const port = Number.parseInt(process.env.KELLY_CONTENT_UI_PORT || String(defaultPort), 10);

await ensureDirs();
const provider = await createProvider();
console.log(`Kelly Content data provider: ${provider.kind}`);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const demo = isDemoQuery(url.searchParams);
    if (url.pathname === "/api/state") {
      const state = demo ? demoState(url.searchParams) : await provider.getState();
      return json(res, { app: "kelly-content", ...state });
    }
    if (demo && req.method === "POST" && [
      "/api/decision",
      "/api/confirm-direction",
      "/api/start-todo",
      "/api/export",
    ].includes(url.pathname)) {
      return json(res, { ok: true, demo: true, message: "Demo mode: no local content files were changed." });
    }
    if (url.pathname === "/api/decision" && req.method === "POST") {
      return json(res, await provider.saveDecision(await readBody(req)));
    }
    if (url.pathname === "/api/confirm-direction" && req.method === "POST") {
      return json(res, await provider.confirmDirection(await readBody(req)));
    }
    if (url.pathname === "/api/start-todo" && req.method === "POST") {
      return json(res, await provider.startTodo(await readBody(req)));
    }
    if (url.pathname === "/api/export" && req.method === "POST") {
      return json(res, await provider.exportApproved());
    }
    if (url.pathname === "/api/agent-tasks") {
      return json(res, { tasks: (await provider.listAgentTasks?.()) || [] });
    }
    if (url.pathname.startsWith("/api/")) return json(res, { error: "not found" }, 404);
    return staticFile(url.pathname, res);
  } catch (error) {
    return json(res, { error: error.message }, error.statusCode || 500);
  }
});

server.listen(port, host, () => {
  console.log(`Kelly Content UI: http://${host}:${port}/`);
});

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function staticFile(urlPath, res) {
  const clean = urlPath === "/" ? "/index.html" : urlPath;
  const file = path.normalize(path.join(appDir, clean));
  if (!file.startsWith(appDir)) return text(res, "Forbidden", 403);
  const ext = path.extname(file);
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { "content-type": `${types[ext] || "application/octet-stream"}; charset=utf-8` });
    res.end(data);
  } catch {
    text(res, "Not found", 404);
  }
}

function json(res, body, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function text(res, body, status = 200) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}
