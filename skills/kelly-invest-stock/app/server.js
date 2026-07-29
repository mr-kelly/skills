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
const AIRAPP_ID = "kelly-invest-stock";
const AIRAPP_CLIENT_ID = "busabase-airapp";
const pendingOAuth = new Map();

const app = new Hono();

const normalizeBaseUrl = (raw) => {
  const withoutApi = String(raw || CLOUD_BASE_URL)
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "");
  const url = new URL(withoutApi);
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Busabase 地址必须是纯服务器地址，不能包含账号、查询参数或路径。");
  }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("自定义 Busabase 需要 HTTPS；本机 localhost 可使用 HTTP。");
  }
  return url.origin;
};

const requestOrigin = (context) => new URL(context.req.url).origin;

const assertSameOrigin = (context) => {
  const origin = context.req.header("origin");
  if (origin && origin !== requestOrigin(context)) throw new Error("请求来源不匹配。");
};

const getLocalCredential = () => getBusabaseAirAppAccessToken(AIRAPP_ID);

const assertOAuthSupported = async (oauthRequest) => {
  let response;
  try {
    response = await fetch(oauthRequest.authorizeUrl, {
      headers: { accept: "text/html" },
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error("无法连接此 Busabase 服务器，请检查地址和网络后重试。");
  }
  if (response.status < 400) return;

  const body = await response.json().catch(() => null);
  if (body?.error === "invalid_request") {
    throw new Error("此 Busabase 服务器尚未启用本地 AirApp OAuth。AirApp 内无需 OAuth；本地运行请连接已升级的服务器。");
  }
  throw new Error(`Busabase OAuth 暂不可用（HTTP ${response.status}）。`);
};

app.get("/health", (context) => context.json({ ok: true, app: "kelly-invest-stock", mode: "read-only" }));

app.get("/auth/status", async (context) => {
  const envBaseUrl = process.env.BUSABASE_BASE_URL;
  if (envBaseUrl) {
    return context.json({
      connected: true,
      baseUrl: normalizeBaseUrl(envBaseUrl),
      source: process.env.BUSABASE_API_KEY ? "environment" : "open-server",
    });
  }
  try {
    const credential = await getLocalCredential();
    if (!credential) return context.json({ connected: false, cloudBaseUrl: CLOUD_BASE_URL });
    return context.json({
      connected: true,
      baseUrl: credential.baseUrl,
      source: "airapp-oauth-local",
    });
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
    url.searchParams.set("oauth_error", error instanceof Error ? error.message : "无法开始 OAuth 登录。");
    return context.redirect(url.toString(), 303);
  }
});

app.get("/auth/callback", async (context) => {
  const callback = new URL(context.req.url);
  const state = callback.searchParams.get("state") || "";
  const pending = pendingOAuth.get(state);
  pendingOAuth.delete(state);
  try {
    if (!pending || pending.expiresAt <= Date.now()) throw new Error("OAuth 请求已过期，请重新连接。");
    const code = parseBusabaseOAuthCallback(callback.toString(), pending);
    const tokenSet = await exchangeBusabaseOAuthCode(pending, code);
    storeBusabaseAirAppOAuthCredential({
      appId: AIRAPP_ID,
      baseUrl: pending.baseUrl,
      clientId: AIRAPP_CLIENT_ID,
      tokenSet,
    });
    return context.redirect("/#/strategies", 303);
  } catch (error) {
    const url = new URL("/", requestOrigin(context));
    url.searchParams.set("oauth_error", error instanceof Error ? error.message : "OAuth 登录失败。");
    return context.redirect(url.toString(), 303);
  }
});

app.post("/auth/logout", async (context) => {
  try {
    assertSameOrigin(context);
    const credential = loadBusabaseAirAppOAuthCredential(AIRAPP_ID);
    if (credential) {
      await revokeBusabaseAirAppOAuthCredential(AIRAPP_ID).catch(() => null);
    }
    return context.json({ ok: true });
  } catch {
    return context.json({ error: "无法退出 Busabase。" }, 400);
  }
});

app.all("/api/v1/*", async (context) => {
  const envBaseUrl = process.env.BUSABASE_BASE_URL ? normalizeBaseUrl(process.env.BUSABASE_BASE_URL) : "";
  let credential = null;
  if (!envBaseUrl) {
    try {
      credential = await getLocalCredential();
    } catch {
      return context.json({ error: "Busabase OAuth session expired" }, 401);
    }
  }
  const baseUrl = envBaseUrl || credential?.baseUrl;
  if (!baseUrl) return context.json({ error: "Busabase connection required" }, 401);

  const incoming = new URL(context.req.url);
  const target = new URL(incoming.pathname + incoming.search, baseUrl);
  const headers = new Headers();
  const contentType = context.req.header("content-type");
  const accept = context.req.header("accept");
  const spaceId = context.req.header("x-busabase-space") || process.env.BUSABASE_SPACE_ID;
  if (contentType) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);
  if (spaceId) headers.set("x-busabase-space", spaceId);
  if (process.env.BUSABASE_API_KEY) {
    headers.set("authorization", `Bearer ${process.env.BUSABASE_API_KEY}`);
  } else if (credential) {
    headers.set("authorization", `Bearer ${credential.accessToken}`);
  }

  const hasBody = !["GET", "HEAD"].includes(context.req.method);
  const upstream = await fetch(target, {
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
  console.error("Kelly Invest Stock server error", error instanceof Error ? error.message : error);
  return context.json({ error: "Internal server error" }, 500);
});

const port = Number.parseInt(process.env.PORT || "3107", 10);
serve({ fetch: app.fetch, port }, () => {
  console.log(`AirApp listening on port ${port}`);
});
