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
    if (url.pathname === "/api/confirm-direction" && req.method === "POST") return confirmDirection(req, res);
    if (url.pathname === "/api/start-todo" && req.method === "POST") return startTodo(req, res);
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
        "skills/kelly-content/config.local.json",
        "~/.config/kelly-content/config.json"
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

async function confirmDirection(req, res) {
  if (await readJson(lockPath, null)) {
    return json(res, { error: "Content files are locked while the agent is writing." }, 423);
  }
  const payload = await readBody(req);
  if (!payload.topic_id || !payload.direction_id) return json(res, { error: "missing topic_id or direction_id" }, 400);
  const batch = await readJson(currentBatchPath, null);
  if (!batch) return json(res, { error: "missing batch" }, 404);

  const topic = (batch.topics || []).find((item) => item.id === payload.topic_id);
  const direction = topic?.directions?.find((item) => item.id === payload.direction_id);
  if (!topic || !direction) return json(res, { error: "topic or direction not found" }, 404);

  topic.status = "confirmed";
  for (const candidate of topic.directions || []) {
    candidate.status = candidate.id === direction.id ? "selected" : "ready";
  }

  batch.todos ||= [];
  const todoId = `todo-${topic.id}-${direction.id}`;
  const existing = batch.todos.find((item) => item.id === todoId);
  const todo = {
    id: todoId,
    topic_id: topic.id,
    direction_id: direction.id,
    title: direction.title,
    description: direction.description,
    subject: topic.subject || topic.title,
    status: "todo",
    assignee: "AI writer",
    source: topic.source || "local",
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (existing) Object.assign(existing, todo);
  else batch.todos.push(todo);

  await writeJson(currentBatchPath, batch);
  return json(res, { ok: true, todo });
}

async function startTodo(req, res) {
  if (await readJson(lockPath, null)) {
    return json(res, { error: "Content files are locked while the agent is writing." }, 423);
  }
  const payload = await readBody(req);
  if (!payload.id) return json(res, { error: "missing id" }, 400);
  const batch = await readJson(currentBatchPath, null);
  if (!batch) return json(res, { error: "missing batch" }, 404);

  const todo = (batch.todos || []).find((item) => item.id === payload.id);
  if (!todo) return json(res, { error: "todo not found" }, 404);

  for (const item of batch.todos || []) {
    if (item.status === "in_progress") item.status = "todo";
  }
  todo.status = "in_progress";
  todo.started_at = new Date().toISOString();
  todo.updated_at = todo.started_at;

  batch.main_content ||= {
    id: "main-blog",
    title: todo.title,
    status: "writing",
    hero_alt: "Editorial cover preview",
    cover_brief: "AI writer will prepare the cover and image brief after drafting starts.",
    dek: todo.description,
    html: ""
  };
  batch.main_content.title = todo.title;
  batch.main_content.status = "writing";
  batch.main_content.dek = todo.description;
  if (!batch.main_content.html || batch.main_content.html.includes("还没有开工")) {
    batch.main_content.html = `<p>${escapeHtmlForServer(todo.description)}</p><h3>Draft queue</h3><p>AI writer has started this main draft. Generate the outline, body, and media brief next.</p>`;
  }

  await writeJson(currentBatchPath, batch);
  return json(res, { ok: true, todo, main_content: batch.main_content });
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

function escapeHtmlForServer(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}
