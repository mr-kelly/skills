import fs from "node:fs/promises";
import path from "node:path";
import { APP_DIR } from "./paths.mjs";
import { demoStatePayload, isDemoQuery } from "./demo.mjs";
import { readConfig, readLock, readOnboarding, readSnapshot, summarizeConfig } from "./store.mjs";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function state() {
  const [snapshot, onboarding, lock, configResult] = await Promise.all([
    readSnapshot(),
    readOnboarding(),
    readLock(),
    readConfig()
  ]);
  return {
    app: "kelly-money",
    data_provider: process.env.KELLY_MONEY_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    config_summary: summarizeConfig(configResult),
    snapshot
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

export async function handleRequest(req, res) {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/api/state") {
      const query = Object.fromEntries(url.searchParams.entries());
      sendJson(res, 200, isDemoQuery(query) ? demoStatePayload(query) : await state());
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}
