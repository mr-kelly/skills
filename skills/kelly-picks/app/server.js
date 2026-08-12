import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import {
  getBusabaseAirAppAccessToken,
  loadBusabaseAirAppOAuthCredential,
  revokeBusabaseAirAppOAuthCredential,
  storeBusabaseAirAppOAuthCredential,
} from "./app/vendor/busabase-oauth-node.js";
import {
  createBusabaseOAuthRequest,
  exchangeBusabaseOAuthCode,
  parseBusabaseOAuthCallback,
} from "./app/vendor/busabase-oauth.js";

const CLOUD_BASE_URL = "https://busabase.com";
const AIRAPP_ID = "kelly-picks";
const AIRAPP_CLIENT_ID = "busabase-airapp";
const SPACE_COOKIE = `${AIRAPP_ID}-space`;
const pendingOAuth = new Map();

const app = new Hono();

const normalizeBaseUrl = (raw) => {
  const withoutApi = String(raw || CLOUD_BASE_URL)
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "");
  const url = new URL(withoutApi);
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Busabase URL must be a bare server address without credentials, query, or path.");
  }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("A custom Busabase server requires HTTPS; localhost may use HTTP.");
  }
  return url.origin;
};

const requestOrigin = (context) => new URL(context.req.url).origin;

const assertSameOrigin = (context) => {
  const origin = context.req.header("origin");
  if (origin && origin !== requestOrigin(context)) throw new Error("Request origin mismatch.");
};

const cookieValue = (context, name) => {
  const prefix = `${name}=`;
  const item = String(context.req.header("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
};

const writeSpaceCookie = (context, spaceId, maxAge = 60 * 60 * 24 * 30) => {
  const secure = requestOrigin(context).startsWith("https:") ? "; Secure" : "";
  context.header(
    "set-cookie",
    `${SPACE_COOKIE}=${encodeURIComponent(spaceId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  );
};

const getLocalCredential = () => getBusabaseAirAppAccessToken(AIRAPP_ID);

const authTarget = async () => {
  const envBaseUrl = process.env.BUSABASE_BASE_URL;
  if (envBaseUrl) {
    return {
      baseUrl: normalizeBaseUrl(envBaseUrl),
      accessToken: process.env.BUSABASE_API_KEY || "",
      source: process.env.BUSABASE_API_KEY ? "environment" : "open-server",
    };
  }
  const credential = await getLocalCredential();
  return credential
    ? { baseUrl: credential.baseUrl, accessToken: credential.accessToken, source: "airapp-oauth-local" }
    : null;
};

const fetchAuthInfo = async (target, spaceId = "") => {
  const headers = new Headers({ accept: "application/json" });
  if (target.accessToken) headers.set("authorization", `Bearer ${target.accessToken}`);
  if (spaceId) headers.set("x-busabase-space", spaceId);
  const response = await fetch(new URL("/api/v1/auth", target.baseUrl), {
    headers,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Busabase auth verification failed (${response.status})`);
  const info = await response.json();
  if (!Array.isArray(info?.spaces)) throw new Error("Busabase auth response has no spaces");
  return info;
};

const sanitizedAuthStatus = async (context, target) => {
  const info = await fetchAuthInfo(target);
  if (!info.spaces.length) throw new Error("This account has no accessible Busabase Space.");
  const requested = process.env.BUSABASE_SPACE_ID || cookieValue(context, SPACE_COOKIE);
  let selected = requested ? info.spaces.find((space) => space.id === requested) : null;
  if (!selected && info.spaces.length === 1) {
    selected = info.spaces[0];
    writeSpaceCookie(context, selected.id);
  }
  if (requested && !selected) writeSpaceCookie(context, "", 0);
  return {
    connected: true,
    baseUrl: target.baseUrl,
    source: target.source,
    requiresSpace: !selected,
    space: selected || null,
    spaces: info.spaces.map(({ id, name, slug, plan }) => ({ id, name, slug, plan })),
  };
};

const assertOAuthSupported = async (oauthRequest) => {
  let response;
  try {
    response = await fetch(oauthRequest.authorizeUrl, {
      headers: { accept: "text/html" },
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error("Could not reach this Busabase server. Check the address and network, then retry.");
  }
  if (response.status < 400) return;

  const body = await response.json().catch(() => null);
  if (body?.error === "invalid_request") {
    throw new Error(
      "This Busabase server does not yet support local AirApp OAuth. The AirApp itself needs no OAuth; local runs need an upgraded server.",
    );
  }
  throw new Error(`Busabase OAuth is unavailable (HTTP ${response.status}).`);
};

app.get("/health", (context) => context.json({ ok: true, app: "kelly-picks" }));

/**
 * The ONLY sanctioned way for browser code to learn where it is running.
 * Busabase injects BUSABASE_AIRAPP_RUNTIME into the process it spawns; nobody
 * else sets it, so its absence is the positive fact "standalone". Never
 * classify this by hostname, iframe nesting, or path — a hosted AirApp is
 * served from localhost on Desktop/OSS, and a standalone run is reached over
 * LAN IPs and dev tunnels, so both directions of that guess are wrong.
 */
const AIRAPP_HOSTED_RUNTIMES = new Set(["nodepod", "local-node", "srt", "embed"]);
const airappRuntime = (process.env.BUSABASE_AIRAPP_RUNTIME || "").trim();
app.get("/__airapp/runtime", (context) =>
  context.json({
    runtime: airappRuntime || "standalone",
    hosted: AIRAPP_HOSTED_RUNTIMES.has(airappRuntime),
  }),
);

app.get("/auth/status", async (context) => {
  try {
    const target = await authTarget();
    if (!target) return context.json({ connected: false, cloudBaseUrl: CLOUD_BASE_URL });
    return context.json(await sanitizedAuthStatus(context, target));
  } catch {
    return context.json({ connected: false, cloudBaseUrl: CLOUD_BASE_URL, expired: true });
  }
});

app.post("/auth/start", async (context) => {
  try {
    assertSameOrigin(context);
    const body = await context.req.parseBody();
    const baseUrl = normalizeBaseUrl(body.base_url);
    const redirectUri = new URL("/auth/callback", requestOrigin(context)).toString();
    const oauthRequest = await createBusabaseOAuthRequest({
      baseUrl,
      redirectUri,
      clientId: AIRAPP_CLIENT_ID,
    });
    await assertOAuthSupported(oauthRequest);
    pendingOAuth.set(oauthRequest.state, {
      ...oauthRequest,
      expiresAt: Date.now() + 5 * 60_000,
    });
    return context.redirect(oauthRequest.authorizeUrl, 303);
  } catch (error) {
    const url = new URL("/", requestOrigin(context));
    url.searchParams.set("oauth_error", error instanceof Error ? error.message : "Could not start OAuth sign-in.");
    return context.redirect(url.toString(), 303);
  }
});

app.get("/auth/callback", async (context) => {
  const callback = new URL(context.req.url);
  const state = callback.searchParams.get("state") || "";
  const pending = pendingOAuth.get(state);
  pendingOAuth.delete(state);
  try {
    if (!pending || pending.expiresAt <= Date.now()) throw new Error("The OAuth request expired; reconnect.");
    const code = parseBusabaseOAuthCallback(callback.toString(), pending);
    const tokenSet = await exchangeBusabaseOAuthCode(pending, code);
    storeBusabaseAirAppOAuthCredential({
      appId: AIRAPP_ID,
      baseUrl: pending.baseUrl,
      clientId: AIRAPP_CLIENT_ID,
      tokenSet,
    });
    writeSpaceCookie(context, "", 0);
    return context.redirect("/#/overview", 303);
  } catch (error) {
    const url = new URL("/", requestOrigin(context));
    url.searchParams.set("oauth_error", error instanceof Error ? error.message : "OAuth sign-in failed.");
    return context.redirect(url.toString(), 303);
  }
});

app.post("/auth/space", async (context) => {
  try {
    assertSameOrigin(context);
    const body = await context.req.parseBody();
    const spaceId = String(body.space_id || "").trim();
    const target = await authTarget();
    if (!target) throw new Error("Busabase connection required");
    const info = await fetchAuthInfo(target);
    const selected = info.spaces.find((space) => space.id === spaceId);
    if (!selected) throw new Error("The selected Space does not belong to this account.");
    await fetchAuthInfo(target, selected.id);
    writeSpaceCookie(context, selected.id);
    return context.json({ ok: true, space: { id: selected.id, name: selected.name } });
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : "Could not select a Space." }, 400);
  }
});

app.post("/auth/logout", async (context) => {
  try {
    assertSameOrigin(context);
    const credential = loadBusabaseAirAppOAuthCredential(AIRAPP_ID);
    if (credential) {
      await revokeBusabaseAirAppOAuthCredential(AIRAPP_ID).catch(() => null);
    }
    writeSpaceCookie(context, "", 0);
    return context.json({ ok: true });
  } catch {
    return context.json({ error: "Could not sign out of Busabase." }, 400);
  }
});

app.all("/api/v1/*", async (context) => {
  let target;
  try {
    target = await authTarget();
  } catch {
    return context.json({ error: "Busabase OAuth session expired" }, 401);
  }
  if (!target) return context.json({ error: "Busabase connection required" }, 401);

  const incoming = new URL(context.req.url);
  const targetUrl = new URL(incoming.pathname + incoming.search, target.baseUrl);
  const headers = new Headers();
  const contentType = context.req.header("content-type");
  const accept = context.req.header("accept");
  const spaceId =
    process.env.BUSABASE_SPACE_ID || cookieValue(context, SPACE_COOKIE);
  if (contentType) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);
  if (!spaceId) return context.json({ error: "Busabase Space selection required" }, 409);
  headers.set("x-busabase-space", spaceId);
  if (target.accessToken) headers.set("authorization", `Bearer ${target.accessToken}`);

  const hasBody = !["GET", "HEAD"].includes(context.req.method);
  const upstream = await fetch(targetUrl, {
    method: context.req.method,
    headers,
    body: hasBody ? await context.req.arrayBuffer() : undefined,
    redirect: "manual",
  });
  const responseHeaders = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) responseHeaders.set("content-type", upstreamType);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
});

app.use("/*", async (context, next) => {
  await next();
  context.header("cache-control", "no-store");
});
app.use("/*", serveStatic({ root: "./app" }));
app.onError((error, context) => {
  console.error("Kelly Picks server error", error instanceof Error ? error.message : error);
  return context.json({ error: "Internal server error" }, 500);
});

const port = Number.parseInt(process.env.PORT || "3142", 10);
serve({ fetch: app.fetch, port }, () => {
  console.log(`AirApp listening on port ${port}`);
});
