import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { appDir, currentBatchPath, decisionsPath, defaultHost, defaultPort, lockPath } from "../../lib/paths.mjs";
import { ensureDirs, readJson, writeJson } from "../../lib/common.mjs";

const host = process.env.KELLY_CONTENT_UI_HOST || defaultHost;
const port = Number.parseInt(process.env.KELLY_CONTENT_UI_PORT || String(defaultPort), 10);

await ensureDirs();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/state") return json(res, await state());
    if (url.pathname === "/api/decision" && req.method === "POST") return saveDecision(req, res);
    if (url.pathname.startsWith("/api/")) return json(res, { error: "not found" }, 404);
    return staticFile(url.pathname, res);
  } catch (error) {
    return json(res, { error: error.message }, 500);
  }
});

server.listen(port, host, () => {
  console.log(`Kelly Content UI: http://${host}:${port}/`);
});

async function state() {
  const [batch, decisions, lock] = await Promise.all([
    readJson(currentBatchPath, null),
    readJson(decisionsPath, { decisions: {} }),
    readJson(lockPath, null)
  ]);
  return {
    batch,
    decisions: decisions.decisions || {},
    lock,
    config_summary: {
      provider: "local",
      publishing_connectors: "disabled",
      config_paths: [
        "KELLY_CONTENT_CONFIG",
        "skills/kelly-content/config.local.yml",
        "~/.config/kelly-content/config.yml"
      ]
    }
  };
}

async function saveDecision(req, res) {
  if (await readJson(lockPath, null)) {
    return json(res, { error: "Content files are locked while the agent is writing." }, 423);
  }
  const payload = await readBody(req);
  if (!payload.id) return json(res, { error: "missing id" }, 400);
  const all = await readJson(decisionsPath, { decisions: {} });
  const decisions = all.decisions || {};
  decisions[payload.id] = {
    action: payload.action || "revise",
    title: payload.title || "",
    body: payload.body || "",
    comment: payload.comment || "",
    decided_at: new Date().toISOString()
  };
  await writeJson(decisionsPath, { decisions });
  return json(res, { ok: true, decision: decisions[payload.id] });
}

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
