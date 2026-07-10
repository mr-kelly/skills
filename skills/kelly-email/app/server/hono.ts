import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type Context, Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { updateDetail, updateItems } from "./decisions.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoDecisionResponse, demoStatePayload, isDemoQuery } from "./demo.ts";
import { lockPayload } from "./lock.ts";
import { APP_DIR, ATTACHMENTS_DIR } from "./paths.ts";
import { statePayload } from "./state.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the logic modules (data-provider
// backed), so the same app runs under @hono/node-server locally and — once the
// data layer moves to a cloud provider like Busabase — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".zip": "application/zip",
};

async function sendFile(c: Context, absPath: string, { store = false }: { store?: boolean } = {}) {
  let body: Buffer;
  try {
    body = await fs.readFile(absPath);
  } catch {
    return c.text("Not Found", 404);
  }
  return c.body(body as unknown as ArrayBuffer, 200, {
    "Content-Type": CONTENT_TYPES[path.extname(absPath)] || "application/octet-stream",
    "Cache-Control": store ? "public, max-age=3600" : "no-store",
  });
}

export const app = new Hono();
app.use("/api/state", attachDemoVisuals);

function providerBootstrapConfig(kind: string) {
  if (kind === "busabase") {
    return {
      data_provider: "busabase",
      busabase: {
        base_url: process.env.KELLY_EMAIL_BUSABASE_URL || "http://127.0.0.1:15419",
        base_id: process.env.KELLY_EMAIL_BUSABASE_BASE_ID || "kelly-email",
        base_slug: process.env.KELLY_EMAIL_BUSABASE_BASE_SLUG || "kelly-email",
        contacts_base_id: process.env.KELLY_EMAIL_BUSABASE_CONTACTS_BASE_ID || "kelly-email-contacts",
        contacts_base_slug: process.env.KELLY_EMAIL_BUSABASE_CONTACTS_BASE_SLUG || "kelly-email-contacts",
        folder_slug: process.env.KELLY_EMAIL_BUSABASE_FOLDER_SLUG || "kelly-email-workspace",
        drive_slug: process.env.KELLY_EMAIL_BUSABASE_DRIVE_SLUG || "kelly-email-workspace-files",
        drive_id: process.env.KELLY_EMAIL_BUSABASE_DRIVE_ID || "kelly-email-files",
        secrets_namespace: process.env.KELLY_EMAIL_BUSABASE_SECRETS_NAMESPACE || "kelly-email",
        api_key_env: "KELLY_EMAIL_BUSABASE_API_KEY",
      },
      mailboxes: [],
      identities: [],
    };
  }
  return {
    data_provider: "local",
    mailboxes: [],
    identities: [],
  };
}

async function saveProviderBootstrap(kind: string) {
  if (process.env.KELLY_EMAIL_DATA_PROVIDER || process.env.KELLY_EMAIL_DATA_READER) {
    throw new Error("KELLY_EMAIL_DATA_PROVIDER is set in the process environment; change that env var to switch mode.");
  }
  const normalized = kind === "busabase" ? "busabase" : kind === "local" ? "local" : "";
  if (!normalized) throw new Error('Provider must be "local" or "busabase".');
  const configPath = path.join(os.homedir(), ".config", "kelly-email", "config.json");
  await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(configPath, `${JSON.stringify(providerBootstrapConfig(normalized), null, 2)}\n`, "utf8");
  return { provider: normalized, config_path: configPath };
}

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await statePayload(query));
});

app.get("/api/lock", async (c) => {
  const query = c.req.query();
  return c.json({ lock: isDemoQuery(query) ? { locked: false } : await lockPayload() });
});

app.post("/api/decision", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  if (isDemoQuery(query)) return c.json(demoDecisionResponse(body));
  return c.json((await updateItems(body)) as any);
});

app.post("/api/detail", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  if (isDemoQuery(query)) return c.json(demoDecisionResponse(body));
  return c.json((await updateDetail(body)) as any);
});

app.post("/api/reload", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await statePayload({}));
});

app.post("/api/setup/provider", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const saved = await saveProviderBootstrap(String(body.provider || ""));
  return c.json({ ok: true, ...saved, state: await statePayload({}) });
});

// ---- Static (vanilla frontend) ----
app.get("/", (c) => sendFile(c, path.join(APP_DIR, "index.html")));
app.get("/app.js", (c) => sendFile(c, path.join(APP_DIR, "app.js")));
app.get("/styles.css", (c) => sendFile(c, path.join(APP_DIR, "styles.css")));

app.get("/i18n/*", (c) => {
  const rel = decodeURIComponent(c.req.path.replace(/^\/i18n\//, ""));
  const resolved = path.resolve(APP_DIR, "i18n", rel);
  if (!resolved.startsWith(path.resolve(APP_DIR, "i18n") + path.sep) || path.extname(resolved) !== ".js") {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved);
});

// Attachments live on disk under .data/, served through with a path-traversal guard.
app.get("/attachments/*", (c) => {
  const rel = decodeURIComponent(c.req.path.replace(/^\/attachments\//, ""));
  const resolved = path.resolve(ATTACHMENTS_DIR, rel);
  if (!resolved.startsWith(path.resolve(ATTACHMENTS_DIR) + path.sep)) {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved, { store: false });
});

app.get("/api/provider-file/*", async (c) => {
  const pathname = decodeURIComponent(c.req.path.replace(/^\/api\/provider-file\//, ""));
  const provider = createProvider();
  if (!provider.getFile) return c.text("Not Found", 404);
  const file = await provider.getFile(pathname).catch(() => null);
  const data = file?.data;
  if (typeof data !== "string") return c.text("Not Found", 404);
  const meta = (file.meta && typeof file.meta === "object" ? file.meta : {}) as Record<string, unknown>;
  const buffer = Buffer.from(data, meta.encoding === "base64" ? "base64" : "utf8");
  return c.body(buffer as unknown as ArrayBuffer, 200, {
    "Content-Type": String(meta.content_type || "application/octet-stream"),
    "Cache-Control": "no-store",
  });
});

app.onError((err, c) => c.json({ error: err.message, trace: err.stack }, 500));
