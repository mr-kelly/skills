import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import {
  demoAsset,
  demoImageConfigPayload,
  demoNotice,
  demoSongConfigPayload,
  demoStatePayload,
  isDemoQuery,
} from "./demo.ts";
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
import { generateSongDraft, importSong, songConfigPayload, updateSong, uploadSong } from "./song-service.ts";
import { setActiveProject, statePayload } from "./state.ts";
import { uploadShotAsset } from "./upload-service.ts";
import { slug } from "./utils.ts";
import { generateShotVideoDraft, generateShotVideoProd } from "./video-service.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the logic/service modules, so the
// same app runs under @hono/node-server locally and could deploy elsewhere once
// the data layer is cloud-backed.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything. Generated media under .data/generated is
// served read-only through the /generated/* route exactly as before.

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
    // Missing file must never crash the server — return 404 instead.
    return c.text("Not Found", 404);
  }
  return c.body(body as unknown as ArrayBuffer, 200, {
    "Content-Type": CONTENT_TYPES[path.extname(absPath)] || "application/octet-stream",
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
  });
}

function idFor(kind, item) {
  if (item.id) return String(item.id);
  const prefix = { characters: "char", shots: "shot", tasks: "task" }[kind] || "item";
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

// ---- HEAD (readiness probes) ----
// Mirror the original hand-rolled handler: 200 with empty body for these paths.
for (const p of ["/", "/app.js", "/styles.css", "/api/state"]) {
  app.on("HEAD", p, (c) => c.body(null, 200));
}

// ---- API (GET) ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await statePayload());
});
app.get("/api/image-config", async (c) =>
  c.json(isDemoQuery(c.req.query()) ? demoImageConfigPayload() : await imageConfigPayload()),
);
app.get("/api/song-config", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoSongConfigPayload(query) : await songConfigPayload());
});
app.get("/api/storyboard-prompt", async (c) => {
  const query = c.req.query();
  // Demo mode has no real project to derive a prompt from — mirror main's 403.
  if (isDemoQuery(query)) return c.json({ error: demoNotice(query) }, /** @type {any} */ (403));
  return c.json(await storyboardPromptPreview(String(c.req.query("shot_id") || "")));
});

// ---- API (POST) ----
// Demo mode is strictly read-only: reject every write endpoint before any
// project file could be touched (mirrors main's blanket POST demo guard).
app.post("/api/*", async (c, next) => {
  const query = c.req.query();
  if (isDemoQuery(query)) return c.json({ error: demoNotice(query) }, /** @type {any} */ (403));
  return next();
});

app.post("/api/treatment", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  const project = await loadProject();
  project.treatment = body.treatment || body;
  await saveProject(project);
  return c.json(await statePayload());
});

app.post("/api/song", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await updateSong(body.song || body));
});

app.post("/api/song-import", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await importSong(body));
});

app.post("/api/song-upload", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await uploadSong(body));
});

app.post("/api/shot-asset-upload", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await uploadShotAsset(body));
});

app.post("/api/song-generate", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await (generateSongDraft as (b: unknown) => Promise<unknown>)(body));
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
  const mode = String(body.mode || "draft");
  return c.json(
    mode === "prod"
      ? await (generateShotVideoProd as (id: string) => Promise<unknown>)(String(body.shot_id || ""))
      : await generateShotVideoDraft(String(body.shot_id || "")),
  );
});

app.post("/api/shot-active", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await setShotActive(String(body.shot_id || ""), String(body.kind || "image"), String(body.path || "")));
});

app.post("/api/visual-background-image", async (c) => {
  await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await generateVisualBackground());
});

app.post("/api/character-card-image", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await assertUnlocked();
  return c.json(await generateCharacterCard(String(body.character_id || "")));
});

// Collection upsert/delete: /api/characters|shots|tasks[/:id]
app.post("/api/:kind{characters|shots|tasks}/:id?", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const kind = c.req.param("kind");
  const id = c.req.param("id");
  if (body.delete || c.req.header("x-delete") === "1") {
    return c.json(await deleteCollectionItem(kind, id || body.id));
  }
  return c.json(await updateCollection(kind, { ...body, id: id || body.id }));
});

// ---- Static (vanilla frontend) + generated media ----
app.get("/", (c) => sendFile(c, path.join(APP_DIR, "index.html")));
app.get("/app.js", (c) => sendFile(c, path.join(APP_DIR, "app.js")));
app.get("/styles.css", (c) => sendFile(c, path.join(APP_DIR, "styles.css")));

// i18n locale modules. Decode percent-encoding so non-ASCII filenames resolve,
// and guard against path traversal outside the i18n directory.
app.get("/i18n/*", (c) => {
  const decodedPath = decodeURIComponent(new URL(c.req.url).pathname);
  const resolved = path.resolve(APP_DIR, `.${decodedPath}`);
  const root = path.resolve(APP_DIR, "i18n");
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved);
});

// Demo media is synthesized in-memory (no disk access). Must precede the
// on-disk /generated/* route so demo asset paths resolve to demoAsset().
app.get("/generated/demo/*", (c) => {
  const decodedPath = decodeURIComponent(new URL(c.req.url).pathname);
  const asset = demoAsset(decodedPath);
  if (asset) {
    return c.body(asset.body, 200, {
      "Content-Type": asset.type,
      "Content-Length": String(asset.body.length),
      "Cache-Control": "no-store",
    });
  }
  return c.text("Not Found", 404);
});

// Generated media lives on disk under .data/generated, served read-only with a
// path-traversal guard. This route only reads; it never writes .data.
app.get("/generated/*", (c) => {
  const decodedPath = decodeURIComponent(new URL(c.req.url).pathname);
  const rel = decodedPath.replace(/^\/generated\//, "");
  const resolved = path.resolve(GENERATED_DIR, rel);
  const root = path.resolve(GENERATED_DIR);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved);
});

// Unmatched routes. The original returned 404 "Not Found" for GET/POST that
// fell through and 405 "Method Not Allowed" for any other verb.
app.notFound((c) => {
  const method = c.req.method;
  if (method === "GET" || method === "POST" || method === "HEAD") {
    return c.text("Not Found", 404);
  }
  return c.text("Method Not Allowed", 405);
});

app.onError((err, c) => c.json({ error: err.message, trace: err.stack }, 500));
