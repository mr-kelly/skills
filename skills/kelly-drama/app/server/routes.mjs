import fs from "node:fs/promises";
import path from "node:path";
import { APP_DIR } from "./paths.mjs";
import { assertUnlocked } from "./lock.mjs";
import { loadProject, saveProject, upsertById } from "./project-store.mjs";
import { statePayload } from "./state.mjs";
import { slug } from "./utils.mjs";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
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

function idFor(kind, item) {
  if (item.id) return String(item.id);
  const prefix = { characters: "char", relationships: "rel", episodes: "ep", shots: "shot", tasks: "task" }[kind] || "item";
  const base = item.name || item.title || item.type || Date.now();
  return `${prefix}-${slug(base)}`;
}

async function updateCollection(kind, item) {
  await assertUnlocked();
  const project = await loadProject();
  const nextItem = { ...item, id: idFor(kind, item) };
  project[kind] = upsertById(project[kind] || [], nextItem);
  await saveProject(project);
  return statePayload();
}

async function deleteCollectionItem(kind, id) {
  await assertUnlocked();
  const project = await loadProject();
  project[kind] = (project[kind] || []).filter((item) => String(item.id) !== String(id));
  await saveProject(project);
  return statePayload();
}

export async function handleRequest(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  try {
    if (req.method === "HEAD" && ["/", "/app.js", "/styles.css", "/api/state"].includes(url.pathname)) {
      res.writeHead(200);
      res.end();
      return;
    }
    if (req.method === "GET") {
      if (url.pathname === "/") return sendFile(res, path.join(APP_DIR, "index.html"));
      if (url.pathname === "/app.js") return sendFile(res, path.join(APP_DIR, "app.js"));
      if (url.pathname === "/styles.css") return sendFile(res, path.join(APP_DIR, "styles.css"));
      if (url.pathname.startsWith("/i18n/")) return sendFile(res, path.join(APP_DIR, url.pathname));
      if (url.pathname === "/api/state") return sendJson(res, await statePayload());
      send(res, 404, "Not Found");
      return;
    }
    if (req.method === "POST") {
      const body = await readJsonBody(req);
      if (url.pathname === "/api/series") {
        await assertUnlocked();
        const project = await loadProject();
        project.series = body.series || body;
        await saveProject(project);
        return sendJson(res, await statePayload());
      }
      const match = url.pathname.match(/^\/api\/(characters|relationships|episodes|shots|tasks)(?:\/([^/]+))?$/);
      if (match) {
        const [, kind, id] = match;
        if (body.delete || req.headers["x-delete"] === "1") return sendJson(res, await deleteCollectionItem(kind, id || body.id));
        return sendJson(res, await updateCollection(kind, { ...body, id: id || body.id }));
      }
      send(res, 404, "Not Found");
      return;
    }
    send(res, 405, "Method Not Allowed");
  } catch (error) {
    sendJson(res, { error: error.message, trace: error.stack }, 500);
  }
}
