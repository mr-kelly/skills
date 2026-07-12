import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { findBase, listRecords, loadBusabaseConfig } from "../../lib/data-provider/busabase-client.ts";
import { DEMO_SHOTS, DEMO_VIDEOS } from "./demo.ts";
import { APP_DIR } from "./paths.ts";

const cfg = loadBusabaseConfig();

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

interface VideoRow {
  id: string;
  fields: Record<string, unknown>;
}
interface ShotRow {
  id: string;
  fields: Record<string, unknown>;
}

/** Throws with a human-readable message if Busabase isn't reachable or the schema is missing. */
async function loadWorkspace(): Promise<{ videos: VideoRow[]; shots: ShotRow[] }> {
  const videosBase = await findBase(cfg, "videos");
  const shotsBase = await findBase(cfg, "video-shots");
  if (!videosBase || !shotsBase) {
    throw new Error("Schema missing — run `npm run ensure-schema` in the skill folder.");
  }
  const [videosResp, shotsResp] = await Promise.all([
    listRecords(cfg, videosBase.id, 100),
    listRecords(cfg, shotsBase.id, 100),
  ]);
  const videos = (videosResp.records as Array<{ id: string; headCommit: { fields: Record<string, unknown> } }>).map(
    (r) => ({ id: r.id, fields: r.headCommit.fields }),
  );
  const shots = (shotsResp.records as Array<{ id: string; headCommit: { fields: Record<string, unknown> } }>).map(
    (r) => ({ id: r.id, fields: r.headCommit.fields }),
  );
  return { videos, shots };
}

function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function shotCounts(shots: readonly { fields: Record<string, unknown> }[], videoId: string) {
  const mine = shots.filter((s) => s.fields.video === videoId);
  const byStatus: Record<string, number> = {};
  for (const s of mine) {
    const st = String(s.fields["recording-status"] ?? "pending");
    byStatus[st] = (byStatus[st] ?? 0) + 1;
  }
  return { total: mine.length, byStatus };
}

function isDemoQuery(query: Record<string, string>) {
  return "demo" in query;
}

export const app = new Hono();

app.get("/api/state", async (c) => {
  const query = c.req.query();
  if (isDemoQuery(query)) {
    return c.json(
      {
        app: "kelly-demo-video-factory",
        provider: "busabase",
        ready: true,
        baseUrl: "demo",
        videoCount: DEMO_VIDEOS.length,
      },
      200,
      { "cache-control": "no-store" },
    );
  }
  try {
    const ws = await loadWorkspace();
    return c.json(
      {
        app: "kelly-demo-video-factory",
        provider: "busabase",
        baseUrl: cfg.baseUrl,
        ready: true,
        videoCount: ws.videos.length,
      },
      200,
      { "cache-control": "no-store" },
    );
  } catch (err) {
    return c.json(
      {
        app: "kelly-demo-video-factory",
        provider: "busabase",
        baseUrl: cfg.baseUrl,
        ready: false,
        error: errorMessageOf(err),
        videoCount: 0,
      },
      200,
      { "cache-control": "no-store" },
    );
  }
});

app.get("/api/videos", async (c) => {
  const query = c.req.query();
  if (isDemoQuery(query)) {
    return c.json(
      {
        videos: DEMO_VIDEOS.map((v) => ({ id: v.id, fields: v.fields, shots: shotCounts(DEMO_SHOTS, v.id) })),
      },
      200,
      { "cache-control": "no-store" },
    );
  }
  try {
    const ws = await loadWorkspace();
    return c.json(
      { videos: ws.videos.map((v) => ({ id: v.id, fields: v.fields, shots: shotCounts(ws.shots, v.id) })) },
      200,
      { "cache-control": "no-store" },
    );
  } catch (err) {
    return c.json({ error: errorMessageOf(err) }, 503, { "cache-control": "no-store" });
  }
});

app.get("/api/videos/:id", async (c) => {
  const id = c.req.param("id");
  const query = c.req.query();
  if (isDemoQuery(query)) {
    const video = DEMO_VIDEOS.find((v) => v.id === id) ?? DEMO_VIDEOS[0];
    const shots = DEMO_SHOTS.filter((s) => s.fields.video === video.id).sort(
      (a, b) => Number(a.fields["shot-number"]) - Number(b.fields["shot-number"]),
    );
    return c.json({ video, shots }, 200, { "cache-control": "no-store" });
  }
  try {
    const ws = await loadWorkspace();
    const video = ws.videos.find((v) => v.id === id);
    if (!video) return c.json({ error: "Not found" }, 404, { "cache-control": "no-store" });
    const shots = ws.shots
      .filter((s) => s.fields.video === id)
      .sort((a, b) => Number(a.fields["shot-number"]) - Number(b.fields["shot-number"]));
    return c.json({ video, shots }, 200, { "cache-control": "no-store" });
  } catch (err) {
    return c.json({ error: errorMessageOf(err) }, 503, { "cache-control": "no-store" });
  }
});

// ---- Static (vanilla frontend) ----
app.get("*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR)) return c.text("Forbidden", 403);
  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return c.text("Not found", 404);
  }
  return c.body(data as unknown as ArrayBuffer, 200, {
    "content-type": types[path.extname(filePath)] || "application/octet-stream",
  });
});

app.onError((err, c) => c.json({ error: err.message }, 500));
