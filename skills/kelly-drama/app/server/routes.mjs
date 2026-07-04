import fs from "node:fs/promises";
import path from "node:path";
import { APP_DIR, GENERATED_DIR } from "./paths.mjs";
import { assertUnlocked } from "./lock.mjs";
import { demoAsset, demoImageConfigPayload, demoNotice, demoStatePayload, isDemoQuery } from "./demo.mjs";
import { generateCharacterCard, generateStoryboardImage, generateVisualBackground, imageConfigPayload, saveImageConfig, storyboardPromptPreview } from "./image-service.mjs";
import { generateShotVideoDraft, generateShotVideoProd } from "./video-service.mjs";
import { generateCharacterVoice, setCharacterVoiceActive } from "./voice-service.mjs";
import { hyperframeProjectStatus } from "./hyperframe-service.mjs";
import { loadProject, saveProject, upsertById } from "./project-store.mjs";
import { setActiveProject, statePayload } from "./state.mjs";
import { slug } from "./utils.mjs";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
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
  let body;
  try {
    body = await fs.readFile(pathname);
  } catch {
    // Missing file must never crash the server — return 404 instead.
    send(res, 404, "Not Found");
    return;
  }
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

async function setShotActive(shotId, kind, assetPath) {
  await assertUnlocked();
  const project = await loadProject();
  const shot = (project.shots || []).find((s) => String(s.id) === shotId);
  if (!shot) throw new Error(`Unknown shot: ${shotId}`);
  const isVideo = kind === "video";
  const candidates = (isVideo ? shot.video_candidates : shot.image_candidates) || [];
  const match = candidates.find((c) => c.path === assetPath);
  if (!match) throw new Error("该候选不存在，无法设为选用。");
  if (isVideo) {
    shot.video_asset = match.path;
    shot.video_generated_at = match.generated_at;
    shot.video_generation = match.generation;
  } else {
    shot.image_asset = match.path;
    shot.image_generated_at = match.generated_at;
    shot.image_generation = match.generation;
  }
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
  const query = Object.fromEntries(url.searchParams.entries());
  const demo = isDemoQuery(query);
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
      if (url.pathname.startsWith("/generated/demo/")) {
        const asset = demoAsset(url.pathname);
        if (asset) return send(res, 200, asset.body, { "Content-Type": asset.type, "Content-Length": asset.body.length, "Cache-Control": "no-store" });
        send(res, 404, "Not Found");
        return;
      }
      if (url.pathname.startsWith("/generated/")) return sendFile(res, path.join(GENERATED_DIR, url.pathname.replace(/^\/generated\//, "")));
      if (url.pathname === "/api/state") return sendJson(res, demo ? demoStatePayload(query) : await statePayload());
      if (url.pathname === "/api/image-config") return sendJson(res, demo ? demoImageConfigPayload() : await imageConfigPayload());
      if (url.pathname === "/api/hyperframe-status") {
        if (demo) return sendJson(res, { ok: false, error: demoNotice(query) });
        const project = await loadProject();
        const requestedPath = String(url.searchParams.get("path") || project.series?.hyperframe_project_path || project.series?.hyperframe_source?.project_path || "");
        return sendJson(res, await hyperframeProjectStatus(requestedPath));
      }
      if (url.pathname === "/api/storyboard-prompt") {
        if (demo) return sendJson(res, { error: demoNotice(query) }, 403);
        return sendJson(res, await storyboardPromptPreview(String(url.searchParams.get("shot_id") || "")));
      }
      send(res, 404, "Not Found");
      return;
    }
    if (req.method === "POST") {
      // Demo mode is strictly read-only: reject every write endpoint before
      // any project file could be touched.
      if (demo) return sendJson(res, { error: demoNotice(query) }, 403);
      const body = await readJsonBody(req);
      if (url.pathname === "/api/series") {
        await assertUnlocked();
        const project = await loadProject();
        project.series = body.series || body;
        await saveProject(project);
        return sendJson(res, await statePayload());
      }
      if (url.pathname === "/api/active-project") {
        return sendJson(res, await setActiveProject(String(body.project_id || "")));
      }
      if (url.pathname === "/api/image-config") {
        return sendJson(res, await saveImageConfig(body));
      }
      if (url.pathname === "/api/storyboard-image") {
        await assertUnlocked();
        return sendJson(res, await generateStoryboardImage(String(body.shot_id || "")));
      }
      if (url.pathname === "/api/shot-video") {
        await assertUnlocked();
        // Unified: every backend just appends a video candidate. Default = Seedance (cloud).
        const backend = String(body.backend || body.mode || "seedance");
        return sendJson(res, backend === "ltx"
          ? await generateShotVideoDraft(String(body.shot_id || ""))
          : await generateShotVideoProd(String(body.shot_id || "")));
      }
      if (url.pathname === "/api/shot-active") {
        await assertUnlocked();
        return sendJson(res, await setShotActive(String(body.shot_id || ""), String(body.kind || "image"), String(body.path || "")));
      }
      if (url.pathname === "/api/visual-background-image") {
        await assertUnlocked();
        return sendJson(res, await generateVisualBackground());
      }
      if (url.pathname === "/api/character-card-image") {
        await assertUnlocked();
        return sendJson(res, await generateCharacterCard(String(body.character_id || "")));
      }
      if (url.pathname === "/api/character-voice") {
        await assertUnlocked();
        return sendJson(res, await generateCharacterVoice(String(body.character_id || "")));
      }
      if (url.pathname === "/api/character-voice-active") {
        await assertUnlocked();
        return sendJson(res, await setCharacterVoiceActive(String(body.character_id || ""), String(body.path || "")));
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
