import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { demoAsset, demoImageConfigPayload, demoNotice, demoStatePayload, isDemoQuery } from "./demo.ts";
import { hyperframeProjectStatus } from "./hyperframe-service.ts";
import {
  generateCharacterCard,
  generateStoryboardImage,
  generateVisualBackground,
  imageConfigPayload,
  saveImageConfig,
  storyboardPromptPreview,
} from "./image-service.ts";
import { assertUnlocked } from "./lock.ts";
import { APP_DIR, GENERATED_DIR } from "./paths.ts";
import { loadProject, saveProject, upsertById } from "./project-store.ts";
import { getProvider } from "./provider.ts";
import { setActiveProject, statePayload } from "./state.ts";
import { slug } from "./utils.ts";
import { generateShotVideoDraft, generateShotVideoProd } from "./video-service.ts";
import { generateCharacterVoice, setCharacterVoiceActive } from "./voice-service.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the logic/service modules, so the
// same app runs under @hono/node-server locally. The frontend is the original
// zero-build vanilla app (index.html + app.js + styles.css + i18n); Hono only
// serves those static files, generated media, and the JSON API.

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

async function sendFile(c, absPath) {
  let body: Buffer;
  try {
    body = await fs.readFile(absPath);
  } catch {
    return c.text("Not Found", 404);
  }
  return c.body(body as unknown as ArrayBuffer, 200, {
    "Content-Type": CONTENT_TYPES[path.extname(absPath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
}

function idFor(kind, item) {
  if (item.id) return String(item.id);
  const prefix =
    { characters: "char", relationships: "rel", episodes: "ep", shots: "shot", tasks: "task" }[kind] || "item";
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

export const app = new Hono();

// ---- HEAD (health probes for a small set of paths) ----
app.on("HEAD", ["/", "/app.js", "/styles.css", "/api/state"], (c) => c.body(null, 200));

// ---- GET API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await statePayload());
});

app.get("/api/image-config", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoImageConfigPayload() : await imageConfigPayload());
});

app.get("/api/hyperframe-status", async (c) => {
  const query = c.req.query();
  if (isDemoQuery(query)) return c.json({ ok: false, error: demoNotice(query) });
  const project = await loadProject();
  const requestedPath = String(
    c.req.query("path") ||
      project.series?.hyperframe_project_path ||
      project.series?.hyperframe_source?.project_path ||
      "",
  );
  return c.json(await hyperframeProjectStatus(requestedPath));
});

app.get("/api/storyboard-prompt", async (c) => {
  const query = c.req.query();
  if (isDemoQuery(query)) return c.json({ error: demoNotice(query) }, /** @type {any} */ (403));
  return c.json(await storyboardPromptPreview(String(c.req.query("shot_id") || "")));
});

// ---- POST API ----
// Demo mode is strictly read-only: reject every write endpoint before any
// project file could be touched. This mirrors the single guard the node:http
// router placed at the top of its POST block.
app.post("/api/*", async (c, next) => {
  const query = c.req.query();
  if (isDemoQuery(query)) return c.json({ error: demoNotice(query) }, /** @type {any} */ (403));
  await next();
});

app.post("/api/series", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  const project = await loadProject();
  project.series = body.series || body;
  await saveProject(project);
  return c.json(await statePayload());
});

app.post("/api/active-project", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(await setActiveProject(String(body.project_id || "")));
});

app.post("/api/image-config", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(await saveImageConfig(body));
});

app.post("/api/storyboard-image", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await generateStoryboardImage(String(body.shot_id || "")));
});

app.post("/api/shot-video", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  // Unified: every backend just appends a video candidate. Default = Seedance (cloud).
  const backend = String(body.backend || body.mode || "seedance");
  return c.json(
    backend === "ltx"
      ? await generateShotVideoDraft(String(body.shot_id || ""))
      : await generateShotVideoProd(String(body.shot_id || "")),
  );
});

app.post("/api/shot-active", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await setShotActive(String(body.shot_id || ""), String(body.kind || "image"), String(body.path || "")));
});

app.post("/api/visual-background-image", async (c) => {
  await assertUnlocked();
  return c.json(await generateVisualBackground());
});

app.post("/api/character-card-image", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await generateCharacterCard(String(body.character_id || "")));
});

app.post("/api/character-voice", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await generateCharacterVoice(String(body.character_id || "")));
});

app.post("/api/character-voice-active", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await setCharacterVoiceActive(String(body.character_id || ""), String(body.path || "")));
});

app.post("/api/:kind{characters|relationships|episodes|shots|tasks}/:id?", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const kind = c.req.param("kind");
  const id = c.req.param("id");
  if (body.delete || c.req.header("x-delete") === "1") return c.json(await deleteCollectionItem(kind, id || body.id));
  return c.json(await updateCollection(kind, { ...body, id: id || body.id }));
});

// ---- Static (vanilla frontend + generated media) ----
app.get("/", (c) => sendFile(c, path.join(APP_DIR, "index.html")));
app.get("/app.js", (c) => sendFile(c, path.join(APP_DIR, "app.js")));
app.get("/styles.css", (c) => sendFile(c, path.join(APP_DIR, "styles.css")));

app.get("/i18n/*", (c) => {
  const rel = decodeURIComponent(c.req.path.replace(/^\/i18n\//, ""));
  const base = path.resolve(APP_DIR, "i18n");
  const resolved = path.resolve(base, rel);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return c.text("Forbidden", 403);
  return sendFile(c, resolved);
});

// Demo placeholder assets are generated in memory under /generated/demo/*.
// This must be matched before the real /generated/* handler so demo mode never
// touches app/.data.
app.get("/generated/demo/*", (c) => {
  const asset = demoAsset(c.req.path);
  if (asset) {
    return c.body(asset.body, 200, {
      "Content-Type": asset.type,
      "Cache-Control": "no-store",
    });
  }
  return c.text("Not Found", 404);
});

// Generated media (storyboards, references, videos, voices) are served through
// the data-provider so the same route works for local disk and remote backends.
// A path-traversal guard still runs against the local .data/generated root so a
// crafted "/generated/../.." path can never escape; no other .data path is
// exposed. The provider reads the bytes by the "/generated/..." public path.
app.get("/generated/*", async (c) => {
  const rel = decodeURIComponent(c.req.path.replace(/^\/generated\//, ""));
  const base = path.resolve(GENERATED_DIR);
  const resolved = path.resolve(base, rel);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return c.text("Forbidden", 403);
  const publicPath = `/generated/${rel}`;
  let body: Buffer;
  try {
    body = await (await getProvider()).readGeneratedAsset(publicPath);
  } catch {
    return c.text("Not Found", 404);
  }
  return c.body(body as unknown as ArrayBuffer, 200, {
    "Content-Type": CONTENT_TYPES[path.extname(resolved)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
});

app.onError((err, c) => c.json({ error: err.message, trace: err.stack }, 500));
