import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { appDir, exportReportPath, exportsDir } from "../../lib/paths.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoState, isDemoQuery } from "./demo.ts";
import { installSetup } from "./setup.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the data-provider, so the same app
// runs under @hono/node-server locally and — once the data layer moves to a
// cloud provider — on other fetch-based runtimes.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const provider = await createProvider();
const contentRoot = path.resolve(process.env.KELLY_WRITER_CONTENT_ROOT || "/space/content-writer");
const imageTypes = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
console.log(`Kelly Writer data provider: ${provider.kind}`);

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

// The original demo helpers read query params via URLSearchParams (.get). Rebuild
// one from the request URL so demo-mode detection and localization stay identical.
function searchParams(c) {
  return new URL(c.req.url).searchParams;
}

export const app = new Hono();
installSetup(app);
app.use("/api/state", attachDemoVisuals);

// ---- API ----
app.get("/api/state", async (c) => {
  const query = searchParams(c);
  const state = isDemoQuery(query) ? demoState(query) : await provider.getState();
  return c.json({ app: "kelly-writer", ...state });
});

app.post("/api/decision", async (c) => {
  const query = searchParams(c);
  if (isDemoQuery(query)) {
    return c.json({ ok: true, demo: true, message: "Demo mode: no local content files were changed." });
  }
  const body = await c.req.json().catch(() => ({}));
  if (body.action === "request_changes" && !String(body.comment || "").trim()) {
    return c.json({ error: "specific revision instructions are required" }, 400);
  }
  return c.json(await provider.saveDecision(body));
});

app.post("/api/confirm-direction", async (c) => {
  const query = searchParams(c);
  if (isDemoQuery(query)) {
    return c.json({ ok: true, demo: true, message: "Demo mode: no local content files were changed." });
  }
  const body = await c.req.json().catch(() => ({}));
  return c.json(await provider.confirmDirection(body));
});

app.post("/api/complete-todo", async (c) => {
  const query = searchParams(c);
  if (isDemoQuery(query)) {
    return c.json({ ok: true, demo: true, message: "Demo mode: no local content files were changed." });
  }
  const body = await c.req.json().catch(() => ({}));
  return c.json(await provider.completeTodo(body));
});

app.post("/api/request-distribution", async (c) => {
  const query = searchParams(c);
  if (isDemoQuery(query)) {
    return c.json({ ok: true, demo: true, message: "Demo mode: no local content files were changed." });
  }
  const body = await c.req.json().catch(() => ({}));
  return c.json(await provider.requestDistribution(body));
});

app.post("/api/complete-distribution-revision", async (c) => {
  const query = searchParams(c);
  if (isDemoQuery(query)) {
    return c.json({ ok: true, demo: true, message: "Demo mode: no local content files were changed." });
  }
  if (typeof provider.completeDistributionRevision !== "function") {
    return c.json({ error: "Agent revision completion is handled by the active data provider." }, 405);
  }
  const body = await c.req.json().catch(() => ({}));
  return c.json(await provider.completeDistributionRevision(body));
});

app.post("/api/export", async (c) => {
  const query = searchParams(c);
  if (isDemoQuery(query)) {
    return c.json({ ok: true, demo: true, message: "Demo mode: no local content files were changed." });
  }
  const result = await provider.exportApproved();
  const exported = Array.isArray(result?.exported) ? result.exported : [];
  const downloads = exported
    .filter((item) => item?.id && item?.file)
    .map((item) => ({
      id: item.id,
      name: path.basename(item.file),
      url: `/api/export-download?id=${encodeURIComponent(item.id)}`,
    }));
  return c.json({ ...result, downloads });
});

app.get("/api/export-download", async (c) => {
  const id = String(c.req.query("id") || "");
  if (!id) return c.text("Not found", 404);

  try {
    const report = JSON.parse(await fs.readFile(exportReportPath, "utf8"));
    const entry = Array.isArray(report?.exported) ? report.exported.find((item) => item?.id === id) : null;
    const target = entry?.file ? path.resolve(entry.file) : "";
    if (!target || !isInside(path.resolve(exportsDir), target)) return c.text("Not found", 404);

    const data = await fs.readFile(target);
    const name = path.basename(target);
    const fallback = name.replace(/[^A-Za-z0-9._-]/g, "_") || "kelly-writer-export.zip";
    const contentType =
      path.extname(target).toLowerCase() === ".zip" ? "application/zip" : "text/markdown; charset=utf-8";
    return c.body(data as unknown as ArrayBuffer, 200, {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "content-type": contentType,
    });
  } catch {
    return c.text("Not found", 404);
  }
});

app.get("/api/agent-tasks", async (c) => {
  return c.json({ tasks: (await provider.listAgentTasks?.()) || [] });
});

app.get("/api/content-asset", async (c) => {
  const source = path.resolve(c.req.query("source") || "");
  const asset = c.req.query("asset") || "";
  const state = await provider.getState();
  const batch = state?.batch || {};
  const allowedSources = [
    batch.main_content?.draft_path,
    ...(batch.distribution || []).map((item) => item.source_draft_path),
  ]
    .filter(Boolean)
    .map((item) => path.resolve(item));
  if (!allowedSources.includes(source) || !isInside(contentRoot, source) || path.extname(source) !== ".md") {
    return c.text("Not found", 404);
  }
  const [projectDirectory] = path.relative(contentRoot, source).split(path.sep);
  const projectRoot = path.join(contentRoot, projectDirectory);
  const target = path.resolve(path.dirname(source), asset);
  const contentType = imageTypes[path.extname(target).toLowerCase()];
  if (!asset || !contentType || !isInside(projectRoot, target) || !isInside(contentRoot, target)) {
    return c.text("Not found", 404);
  }
  try {
    const data = await fs.readFile(target);
    return c.body(data as unknown as ArrayBuffer, 200, {
      "cache-control": "private, max-age=300",
      "content-type": contentType,
    });
  } catch {
    return c.text("Not found", 404);
  }
});

// Any other /api/ path is a 404 JSON error (matches the inline handler).
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

// ---- Static (vanilla frontend) ----
// Serve any non-API path from appDir. "/" maps to index.html and the same
// prefix guard keeps requests inside appDir (blocking traversal / .data access).
app.get("*", async (c) => {
  const urlPath = new URL(c.req.url).pathname;
  const clean = urlPath === "/" ? "/index.html" : urlPath;
  const file = path.normalize(path.join(appDir, clean));
  if (!file.startsWith(appDir)) return c.text("Forbidden", 403);
  const ext = path.extname(file);
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  let data: Buffer;
  try {
    data = await fs.readFile(file);
  } catch {
    return c.text("Not found", 404);
  }
  return c.body(data as unknown as ArrayBuffer, 200, {
    "cache-control": ext === ".html" || ext === ".js" || ext === ".css" ? "no-store" : "private, max-age=300",
    "content-type": `${types[ext] || "application/octet-stream"}; charset=utf-8`,
  });
});

app.onError((err, c) => c.json({ error: err.message }, 500));
