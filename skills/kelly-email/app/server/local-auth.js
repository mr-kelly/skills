import {
  getBusabaseAirAppAccessToken,
  loadBusabaseAirAppOAuthCredential,
  revokeBusabaseAirAppOAuthCredential,
  storeBusabaseAirAppOAuthCredential,
} from "busabase-sdk/oauth-node";
import {
  createBusabaseOAuthRequest,
  exchangeBusabaseOAuthCode,
  parseBusabaseOAuthCallback,
} from "busabase-sdk/oauth";

const CLOUD_BASE_URL = "https://busabase.com";
const AIRAPP_CLIENT_ID = "busabase-airapp";

export function installLocalBusabaseAuth(app, { appId }) {
  const spaceCookie = `${appId}-space`;
  const pendingOAuth = new Map();
  const requestOrigin = (context) => new URL(context.req.url).origin;

  const normalizeBaseUrl = (raw) => {
    const withoutApi = String(raw || CLOUD_BASE_URL).trim().replace(/\/+$/, "").replace(/\/api\/v1$/, "");
    const url = new URL(withoutApi);
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
      throw new Error("Busabase URL must be a server origin without credentials, query, or path.");
    }
    const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
      throw new Error("Custom Busabase servers require HTTPS; localhost may use HTTP.");
    }
    return url.origin;
  };

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
      `${spaceCookie}=${encodeURIComponent(spaceId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
    );
  };

  const authTarget = async () => {
    if (process.env.BUSABASE_BASE_URL) {
      return {
        baseUrl: normalizeBaseUrl(process.env.BUSABASE_BASE_URL),
        accessToken: process.env.BUSABASE_API_KEY || "",
        source: process.env.BUSABASE_API_KEY ? "environment" : "open-server",
      };
    }
    const credential = await getBusabaseAirAppAccessToken(appId);
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

  const assertOAuthSupported = async (oauthRequest) => {
    let response;
    try {
      response = await fetch(oauthRequest.authorizeUrl, {
        headers: { accept: "text/html" },
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new Error("Could not reach this Busabase server.");
    }
    if (response.status < 400) return;
    const body = await response.json().catch(() => null);
    if (body?.error === "invalid_request") {
      throw new Error("This Busabase server has not enabled local AirApp OAuth.");
    }
    throw new Error(`Busabase OAuth is unavailable (HTTP ${response.status}).`);
  };

  app.get("/auth/status", async (context) => {
    try {
      const target = await authTarget();
      if (!target) return context.json({ connected: false, cloudBaseUrl: CLOUD_BASE_URL });
      const info = await fetchAuthInfo(target);
      if (!info.spaces.length) throw new Error("No accessible Busabase Space");
      const requested = process.env.BUSABASE_SPACE_ID || cookieValue(context, spaceCookie);
      let selected = requested ? info.spaces.find((space) => space.id === requested) : null;
      if (!selected && info.spaces.length === 1) {
        selected = info.spaces[0];
        writeSpaceCookie(context, selected.id);
      }
      if (requested && !selected) writeSpaceCookie(context, "", 0);
      return context.json({
        connected: true,
        baseUrl: target.baseUrl,
        source: target.source,
        requiresSpace: !selected,
        space: selected || null,
        spaces: info.spaces.map(({ id, name, slug, plan }) => ({ id, name, slug, plan })),
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
      const oauthRequest = await createBusabaseOAuthRequest({ baseUrl, redirectUri, clientId: AIRAPP_CLIENT_ID });
      await assertOAuthSupported(oauthRequest);
      pendingOAuth.set(oauthRequest.state, { ...oauthRequest, expiresAt: Date.now() + 5 * 60_000 });
      return context.redirect(oauthRequest.authorizeUrl, 303);
    } catch (error) {
      const url = new URL("/", requestOrigin(context));
      url.searchParams.set("oauth_error", error instanceof Error ? error.message : "Could not start OAuth.");
      return context.redirect(url.toString(), 303);
    }
  });

  app.get("/auth/callback", async (context) => {
    const callback = new URL(context.req.url);
    const state = callback.searchParams.get("state") || "";
    const pending = pendingOAuth.get(state);
    pendingOAuth.delete(state);
    try {
      if (!pending || pending.expiresAt <= Date.now()) throw new Error("OAuth request expired; connect again.");
      const code = parseBusabaseOAuthCallback(callback.toString(), pending);
      const tokenSet = await exchangeBusabaseOAuthCode(pending, code);
      storeBusabaseAirAppOAuthCredential({ appId, baseUrl: pending.baseUrl, clientId: AIRAPP_CLIENT_ID, tokenSet });
      writeSpaceCookie(context, "", 0);
      return context.redirect("/", 303);
    } catch (error) {
      const url = new URL("/", requestOrigin(context));
      url.searchParams.set("oauth_error", error instanceof Error ? error.message : "OAuth login failed.");
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
      if (!selected) throw new Error("The selected Space is not accessible to this account.");
      await fetchAuthInfo(target, selected.id);
      writeSpaceCookie(context, selected.id);
      return context.json({ ok: true, space: { id: selected.id, name: selected.name } });
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : "Could not select Space." }, 400);
    }
  });

  app.post("/auth/logout", async (context) => {
    try {
      assertSameOrigin(context);
      if (loadBusabaseAirAppOAuthCredential(appId)) {
        await revokeBusabaseAirAppOAuthCredential(appId).catch(() => null);
      }
      writeSpaceCookie(context, "", 0);
      return context.json({ ok: true });
    } catch {
      return context.json({ error: "Could not disconnect Busabase." }, 400);
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
    for (const name of ["content-type", "accept"]) {
      const value = context.req.header(name);
      if (value) headers.set(name, value);
    }
    const spaceId = process.env.BUSABASE_SPACE_ID || cookieValue(context, spaceCookie) || context.req.header("x-busabase-space");
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
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  });
}
