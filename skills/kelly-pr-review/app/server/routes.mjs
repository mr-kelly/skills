import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "node:querystring";
import { APP_DIR } from "./paths.mjs";
import { lockPayload } from "./lock.mjs";
import { statePayload } from "./state.mjs";
import { updateDetail, updateItems } from "./decisions.mjs";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  send(res, status, body, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
}

async function sendFile(res, pathname) {
  const body = await fs.readFile(pathname);
  send(res, 200, body, {
    "Content-Type": CONTENT_TYPES[path.extname(pathname)] || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function sendI18nFile(res, urlPathname) {
  const relative = decodeURIComponent(urlPathname.replace(/^\/i18n\//, ""));
  const resolved = path.resolve(APP_DIR, "i18n", relative);
  if (!resolved.startsWith(path.resolve(APP_DIR, "i18n") + path.sep) || path.extname(resolved) !== ".js") {
    send(res, 403, "Forbidden");
    return;
  }
  await sendFile(res, resolved);
}

export async function handleRequest(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  try {
    if (req.method === "HEAD" && ["/", "/app.js", "/styles.css", "/api/state", "/api/lock"].includes(url.pathname)) {
      res.writeHead(200);
      res.end();
      return;
    }
    if (req.method === "GET") {
      if (url.pathname === "/") return sendFile(res, path.join(APP_DIR, "index.html"));
      if (url.pathname === "/app.js") return sendFile(res, path.join(APP_DIR, "app.js"));
      if (url.pathname === "/styles.css") return sendFile(res, path.join(APP_DIR, "styles.css"));
      if (url.pathname.startsWith("/i18n/")) return sendI18nFile(res, url.pathname);
      if (url.pathname === "/api/state") return sendJson(res, await statePayload(parse(url.search.slice(1))));
      if (url.pathname === "/api/lock") return sendJson(res, { lock: await lockPayload() });
      send(res, 404, "Not Found");
      return;
    }
    if (req.method === "POST") {
      const body = await readJsonBody(req);
      if (url.pathname === "/api/decision") return sendJson(res, await updateItems(body));
      if (url.pathname === "/api/detail") return sendJson(res, await updateDetail(body));
      if (url.pathname === "/api/reload") return sendJson(res, await statePayload({}));
      send(res, 404, "Not Found");
      return;
    }
    send(res, 405, "Method Not Allowed");
  } catch (error) {
    sendJson(res, { error: error.message, trace: error.stack }, 500);
  }
}
