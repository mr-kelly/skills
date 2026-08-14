// @ts-nocheck

// node_modules/.pnpm/busabase-sdk@0.15.0/node_modules/busabase-sdk/dist/chunk-5NYQX65A.js
function normalizeBaseUrl(raw) {
  return raw.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

// node_modules/.pnpm/busabase-sdk@0.15.0/node_modules/busabase-sdk/dist/chunk-J2DZKX7A.js
var BUSABASE_AIRAPP_CLIENT_ID = "busabase-airapp";
var BusabaseOAuthError = class extends Error {
  code;
  status;
  constructor(code, message, status) {
    super(message);
    this.name = "BusabaseOAuthError";
    this.code = code;
    this.status = status;
  }
};
var oauthBaseUrl = (raw) => {
  let url;
  try {
    url = new URL(normalizeBaseUrl(raw));
  } catch {
    throw new BusabaseOAuthError("invalid_base_url", "Busabase base URL is invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" && url.pathname !== "") {
    throw new BusabaseOAuthError(
      "invalid_base_url",
      "Busabase base URL must be an HTTP(S) origin without credentials, query, or path"
    );
  }
  return url.origin;
};
var randomBase64Url = (byteLength) => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
var digestBase64Url = async (value) => {
  const encoded = new TextEncoder().encode(value);
  const data = encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function createBusabaseOAuthRequest(input) {
  const baseUrl = oauthBaseUrl(input.baseUrl);
  const redirectUri = new URL(input.redirectUri).toString();
  const clientId = input.clientId ?? BUSABASE_AIRAPP_CLIENT_ID;
  const codeVerifier = randomBase64Url(32);
  const state = input.state ?? randomBase64Url(24);
  const resource = new URL("/api/v1", baseUrl).toString();
  const authorizeUrl = new URL("/api/oauth/authorize", baseUrl);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    resource,
    scope: "api",
    code_challenge: await digestBase64Url(codeVerifier),
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
    state
  }).toString();
  if (input.prompt) authorizeUrl.searchParams.set("prompt", input.prompt);
  return {
    authorizeUrl: authorizeUrl.toString(),
    baseUrl,
    clientId,
    codeVerifier,
    redirectUri,
    resource,
    state
  };
}
function parseBusabaseOAuthCallback(callbackUrl, request) {
  const callback = new URL(callbackUrl);
  const error = callback.searchParams.get("error");
  if (error) {
    throw new BusabaseOAuthError(
      error,
      callback.searchParams.get("error_description") || "Busabase authorization was denied"
    );
  }
  if (callback.searchParams.get("state") !== request.state) {
    throw new BusabaseOAuthError("state_mismatch", "OAuth callback state did not match");
  }
  const issuer = callback.searchParams.get("iss");
  let issuerMatches = false;
  try {
    issuerMatches = Boolean(issuer && new URL(issuer).origin === new URL(request.baseUrl).origin);
  } catch {
    issuerMatches = false;
  }
  if (!issuerMatches) {
    throw new BusabaseOAuthError("issuer_mismatch", "OAuth callback issuer did not match");
  }
  const code = callback.searchParams.get("code");
  if (!code) throw new BusabaseOAuthError("missing_code", "OAuth callback had no code");
  return code;
}
var parseTokenResponse = async (response) => {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof body?.error === "string" ? body.error : "token_request_failed";
    const message = typeof body?.error_description === "string" ? body.error_description : `Busabase OAuth token request failed (${response.status})`;
    throw new BusabaseOAuthError(code, message, response.status);
  }
  if (typeof body?.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new BusabaseOAuthError(
      "invalid_token_response",
      "Busabase returned an invalid token set"
    );
  }
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : void 0,
    expiresIn: body.expires_in,
    expiresAt: new Date(Date.now() + body.expires_in * 1e3).toISOString(),
    scope: typeof body.scope === "string" ? body.scope.split(/\s+/).filter(Boolean) : [],
    tokenType: typeof body.token_type === "string" ? body.token_type : "Bearer",
    user: body.user && typeof body.user === "object" ? body.user : void 0
  };
};
async function exchangeBusabaseOAuthCode(request, code, fetchImpl = fetch) {
  const response = await fetchImpl(new URL("/api/oauth/token", request.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: request.clientId,
      code,
      code_verifier: request.codeVerifier,
      redirect_uri: request.redirectUri,
      resource: request.resource
    })
  });
  return parseTokenResponse(response);
}
async function refreshBusabaseOAuthToken(input, fetchImpl = fetch) {
  const baseUrl = oauthBaseUrl(input.baseUrl);
  const response = await fetchImpl(new URL("/api/oauth/token", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      client_id: input.clientId ?? BUSABASE_AIRAPP_CLIENT_ID,
      resource: new URL("/api/v1", baseUrl).toString()
    })
  });
  return parseTokenResponse(response);
}
async function revokeBusabaseOAuthToken(input, fetchImpl = fetch) {
  const baseUrl = oauthBaseUrl(input.baseUrl);
  const response = await fetchImpl(new URL("/api/oauth/revoke", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: input.token,
      client_id: input.clientId ?? BUSABASE_AIRAPP_CLIENT_ID
    })
  });
  if (!response.ok) {
    throw new BusabaseOAuthError(
      "revoke_failed",
      `Busabase OAuth revocation failed (${response.status})`,
      response.status
    );
  }
}

// node_modules/.pnpm/busabase-sdk@0.15.0/node_modules/busabase-sdk/dist/chunk-B2AWPFDI.js
import { randomUUID } from "crypto";
import { readFileSync, mkdirSync, chmodSync, writeFileSync, renameSync, rmSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
var STORE_VERSION = 1;
var APP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var REFRESH_WINDOW_MS = 6e4;
var refreshesByCredentialPath = /* @__PURE__ */ new Map();
var assertAppId = (appId) => {
  if (!APP_ID_RE.test(appId)) {
    throw new BusabaseOAuthError(
      "invalid_airapp_id",
      "AirApp id must use letters, digits, dot, dash, or underscore"
    );
  }
  return appId;
};
var storeRoot = (options = {}) => options.rootDir ?? join(homedir(), ".busabase");
var busabaseAirAppCredentialsDir = (options = {}) => join(storeRoot(options), "airapps");
var busabaseAirAppCredentialPath = (appId, options = {}) => join(busabaseAirAppCredentialsDir(options), `${assertAppId(appId)}.json`);
var normalizeOrigin = (raw) => {
  const url = new URL(normalizeBaseUrl(raw));
  if (url.username || url.password || url.search || url.hash) {
    throw new BusabaseOAuthError("invalid_base_url", "Busabase base URL must be an origin");
  }
  return url.origin;
};
var parseCredential = (raw, expectedAppId) => {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new BusabaseOAuthError("invalid_local_credential", "AirApp OAuth credential is invalid");
  }
  const item = value;
  if (item.version !== STORE_VERSION || item.appId !== expectedAppId || typeof item.baseUrl !== "string" || typeof item.clientId !== "string" || typeof item.accessToken !== "string" || typeof item.refreshToken !== "string" || typeof item.expiresAt !== "string" || !Array.isArray(item.scope) || item.scope.some((scope) => typeof scope !== "string") || typeof item.tokenType !== "string") {
    throw new BusabaseOAuthError("invalid_local_credential", "AirApp OAuth credential is invalid");
  }
  if (item.selectedSpace !== void 0 && (typeof item.selectedSpace !== "object" || item.selectedSpace === null || typeof item.selectedSpace.id !== "string" || typeof item.selectedSpace.name !== "string")) {
    throw new BusabaseOAuthError("invalid_local_credential", "AirApp OAuth credential is invalid");
  }
  return item;
};
function loadBusabaseAirAppOAuthCredential(appId, options = {}) {
  const path = busabaseAirAppCredentialPath(appId, options);
  try {
    return parseCredential(readFileSync(path, "utf8"), appId);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function storeBusabaseAirAppOAuthCredential(input, options = {}) {
  if (!input.tokenSet.refreshToken) {
    throw new BusabaseOAuthError(
      "missing_refresh_token",
      "A refresh token is required for a persistent local AirApp login"
    );
  }
  const credential = {
    version: STORE_VERSION,
    appId: assertAppId(input.appId),
    baseUrl: normalizeOrigin(input.baseUrl),
    clientId: input.clientId ?? BUSABASE_AIRAPP_CLIENT_ID,
    accessToken: input.tokenSet.accessToken,
    refreshToken: input.tokenSet.refreshToken,
    expiresAt: input.tokenSet.expiresAt,
    scope: input.tokenSet.scope,
    tokenType: input.tokenSet.tokenType,
    ...input.selectedSpace ? { selectedSpace: input.selectedSpace } : {}
  };
  const path = busabaseAirAppCredentialPath(input.appId, options);
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 448 });
  try {
    chmodSync(directory, 448);
  } catch {
  }
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(credential, null, 2)}
`, { mode: 384 });
  try {
    chmodSync(temporaryPath, 384);
  } catch {
  }
  renameSync(temporaryPath, path);
  return credential;
}
async function getBusabaseAirAppAccessToken(appId, options = {}, fetchImpl = fetch) {
  const credential = loadBusabaseAirAppOAuthCredential(appId, options);
  if (!credential) return null;
  const expiresAt = Date.parse(credential.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + REFRESH_WINDOW_MS) return credential;
  const credentialPath = busabaseAirAppCredentialPath(appId, options);
  const activeRefresh = refreshesByCredentialPath.get(credentialPath);
  if (activeRefresh) return activeRefresh;
  const refresh = (async () => {
    const tokenSet = await refreshBusabaseOAuthToken(
      {
        baseUrl: credential.baseUrl,
        refreshToken: credential.refreshToken,
        clientId: credential.clientId
      },
      fetchImpl
    );
    return storeBusabaseAirAppOAuthCredential(
      {
        appId,
        baseUrl: credential.baseUrl,
        clientId: credential.clientId,
        tokenSet: {
          ...tokenSet,
          refreshToken: tokenSet.refreshToken ?? credential.refreshToken
        },
        selectedSpace: credential.selectedSpace
      },
      options
    );
  })();
  refreshesByCredentialPath.set(credentialPath, refresh);
  try {
    return await refresh;
  } finally {
    if (refreshesByCredentialPath.get(credentialPath) === refresh) {
      refreshesByCredentialPath.delete(credentialPath);
    }
  }
}
function storeBusabaseAirAppSelectedSpace(appId, selectedSpace, options = {}) {
  const credential = loadBusabaseAirAppOAuthCredential(appId, options);
  if (!credential) {
    throw new BusabaseOAuthError(
      "missing_local_credential",
      "Connect this local AirApp before selecting a Space"
    );
  }
  const next = {
    ...credential,
    ...selectedSpace ? { selectedSpace } : { selectedSpace: void 0 }
  };
  const path = busabaseAirAppCredentialPath(appId, options);
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}
`, { mode: 384 });
  try {
    chmodSync(temporaryPath, 384);
  } catch {
  }
  renameSync(temporaryPath, path);
  return next;
}
function clearBusabaseAirAppOAuthCredential(appId, options = {}) {
  rmSync(busabaseAirAppCredentialPath(appId, options), { force: true });
}
async function revokeBusabaseAirAppOAuthCredential(appId, options = {}, fetchImpl = fetch) {
  const credential = loadBusabaseAirAppOAuthCredential(appId, options);
  if (!credential) return;
  try {
    await revokeBusabaseOAuthToken(
      {
        baseUrl: credential.baseUrl,
        token: credential.refreshToken,
        clientId: credential.clientId
      },
      fetchImpl
    );
  } finally {
    clearBusabaseAirAppOAuthCredential(appId, options);
  }
}

// node_modules/.pnpm/busabase-sdk@0.15.0/node_modules/busabase-sdk/dist/airapp-node.js
var DEFAULT_CLOUD_BASE_URL = "https://busabase.com";
var DEFAULT_PENDING_TTL_MS = 5 * 6e4;
var DEFAULT_TIMEOUT_MS = 8e3;
var BUSABASE_AIRAPP_GATEWAY_REASONS = {
  authRequired: "AUTH_REQUIRED",
  authUnavailable: "AUTH_UNAVAILABLE",
  connectionRequired: "CONNECTION_REQUIRED",
  oauthCallbackInvalid: "OAUTH_CALLBACK_INVALID",
  spaceNotAllowed: "SPACE_NOT_ALLOWED",
  spaceSelectionRequired: "SPACE_SELECTION_REQUIRED"
};
var jsonError = (status, reason, message, data) => Response.json(
  {
    error: message,
    code: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status === 409 ? "CONFLICT" : status === 503 ? "SERVICE_UNAVAILABLE" : "BAD_REQUEST",
    data: { reason, ...data }
  },
  { status }
);
var normalizeOrigin2 = (raw, fallback = DEFAULT_CLOUD_BASE_URL) => {
  const withoutApi = String(raw || fallback).trim().replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  let url;
  try {
    url = new URL(withoutApi);
  } catch {
    throw new BusabaseOAuthError("invalid_base_url", "Busabase base URL is invalid");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" && url.pathname !== "") {
    throw new BusabaseOAuthError("invalid_base_url", "Busabase base URL must be an origin");
  }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new BusabaseOAuthError(
      "invalid_base_url",
      "Busabase requires HTTPS except for a loopback development server"
    );
  }
  return url.origin;
};
var requestOrigin = (request) => new URL(request.url).origin;
var assertSameOrigin = (request) => {
  const origin = request.headers.get("origin");
  if (origin && origin !== requestOrigin(request)) {
    throw new BusabaseOAuthError("origin_mismatch", "Request origin did not match");
  }
};
var readInput = async (request) => {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await request.json().catch(() => ({}));
  }
  const form = await request.formData().catch(() => new FormData());
  return Object.fromEntries(form.entries());
};
var safeSpaces = (spaces) => spaces.map(({ id, name, slug, plan }) => ({ id, name, slug, plan }));
var BusabaseAirAppLocalGateway = class {
  #options;
  #pendingOAuth = /* @__PURE__ */ new Map();
  #environmentSelectedSpace;
  constructor(options) {
    this.#options = {
      ...options,
      appId: options.appId,
      cloudBaseUrl: normalizeOrigin2(options.cloudBaseUrl || DEFAULT_CLOUD_BASE_URL),
      clientId: options.clientId || BUSABASE_AIRAPP_CLIENT_ID,
      oauthPendingTtlMs: options.oauthPendingTtlMs ?? DEFAULT_PENDING_TTL_MS,
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      successPath: options.successPath || "/",
      errorPath: options.errorPath || "/"
    };
  }
  get cloudBaseUrl() {
    return this.#options.cloudBaseUrl;
  }
  #fetch() {
    return this.#options.fetch ?? fetch;
  }
  #now() {
    return this.#options.now?.() ?? Date.now();
  }
  #environment() {
    return this.#options.environment ?? process.env;
  }
  async #target() {
    const environment = this.#environment();
    if (environment.BUSABASE_BASE_URL) {
      const selectedSpaceId = environment.BUSABASE_SPACE_ID?.trim();
      return {
        baseUrl: normalizeOrigin2(environment.BUSABASE_BASE_URL),
        accessToken: environment.BUSABASE_API_KEY || "",
        source: environment.BUSABASE_API_KEY ? "environment" : "open-server",
        ...selectedSpaceId ? { selectedSpace: { id: selectedSpaceId, name: selectedSpaceId } } : this.#environmentSelectedSpace ? { selectedSpace: this.#environmentSelectedSpace } : {}
      };
    }
    const credential = await getBusabaseAirAppAccessToken(
      this.#options.appId,
      this.#options.credentialStore,
      this.#fetch()
    );
    return credential ? {
      baseUrl: credential.baseUrl,
      accessToken: credential.accessToken,
      source: "airapp-oauth-local",
      ...credential.selectedSpace ? { selectedSpace: credential.selectedSpace } : {}
    } : null;
  }
  async #authInfo(target, spaceId = "") {
    const headers = new Headers({ accept: "application/json" });
    if (target.accessToken) headers.set("authorization", `Bearer ${target.accessToken}`);
    if (spaceId) headers.set("x-busabase-space", spaceId);
    const response = await this.#fetch()(new URL("/api/v1/auth", target.baseUrl), {
      headers,
      signal: AbortSignal.timeout(this.#options.requestTimeoutMs)
    });
    if (!response.ok) {
      throw new BusabaseOAuthError(
        response.status === 401 ? "auth_required" : "auth_verification_failed",
        `Busabase auth verification failed (${response.status})`,
        response.status
      );
    }
    const info = await response.json();
    if (!Array.isArray(info.spaces)) {
      throw new BusabaseOAuthError(
        "invalid_auth_response",
        "Busabase auth response did not include Spaces"
      );
    }
    return info;
  }
  #persistSelectedSpace(target, selectedSpace) {
    if (target.source === "airapp-oauth-local") {
      storeBusabaseAirAppSelectedSpace(
        this.#options.appId,
        selectedSpace ? { id: selectedSpace.id, name: selectedSpace.name } : null,
        this.#options.credentialStore
      );
    } else {
      this.#environmentSelectedSpace = selectedSpace || void 0;
    }
  }
  async status() {
    let target = null;
    try {
      target = await this.#target();
      if (!target) {
        return {
          connected: false,
          cloudBaseUrl: this.cloudBaseUrl,
          readiness: "needs_connection",
          action: "connect",
          reason: BUSABASE_AIRAPP_GATEWAY_REASONS.connectionRequired
        };
      }
      const info = await this.#authInfo(target);
      const spaces = safeSpaces(info.spaces);
      if (!spaces.length) {
        this.#persistSelectedSpace(target, null);
        return {
          connected: true,
          cloudBaseUrl: this.cloudBaseUrl,
          baseUrl: target.baseUrl,
          source: target.source,
          readiness: "needs_space",
          action: "retry",
          requiresSpace: true,
          selectedSpace: null,
          space: null,
          spaces,
          reason: BUSABASE_AIRAPP_GATEWAY_REASONS.spaceSelectionRequired,
          message: "This account has no accessible Busabase Space"
        };
      }
      const selectedSpaceId = target.selectedSpace?.id;
      let selected = selectedSpaceId ? spaces.find((space) => space.id === selectedSpaceId) : void 0;
      if (!selected && spaces.length === 1) selected = spaces[0];
      if (target.selectedSpace && !selected) this.#persistSelectedSpace(target, null);
      if (selected && selected.id !== selectedSpaceId) {
        await this.#authInfo(target, selected.id);
        this.#persistSelectedSpace(target, selected);
      }
      return {
        connected: true,
        cloudBaseUrl: this.cloudBaseUrl,
        baseUrl: target.baseUrl,
        source: target.source,
        readiness: selected ? "ready" : "needs_space",
        action: selected ? "continue" : "select_space",
        requiresSpace: !selected,
        selectedSpace: selected || null,
        space: selected || null,
        spaces,
        ...selected ? {} : { reason: BUSABASE_AIRAPP_GATEWAY_REASONS.spaceSelectionRequired }
      };
    } catch (error) {
      const authRequired = error instanceof BusabaseOAuthError && error.status === 401;
      return {
        connected: Boolean(target) && !authRequired,
        cloudBaseUrl: this.cloudBaseUrl,
        ...target ? { baseUrl: target.baseUrl, source: target.source, requiresSpace: true } : {},
        readiness: authRequired ? "needs_auth" : "retry",
        action: authRequired ? "reconnect" : "retry",
        reason: authRequired ? BUSABASE_AIRAPP_GATEWAY_REASONS.authRequired : BUSABASE_AIRAPP_GATEWAY_REASONS.authUnavailable,
        message: error instanceof Error ? error.message : "Busabase auth verification failed"
      };
    }
  }
  statusResponse = async () => Response.json(await this.status());
  start = async (request) => {
    try {
      assertSameOrigin(request);
      const body = await readInput(request);
      const baseUrl = normalizeOrigin2(String(body.base_url || ""), this.cloudBaseUrl);
      const redirectUri = new URL("/auth/callback", requestOrigin(request)).toString();
      const oauthRequest = await createBusabaseOAuthRequest({
        baseUrl,
        redirectUri,
        clientId: this.#options.clientId
      });
      const probe = await this.#fetch()(oauthRequest.authorizeUrl, {
        headers: { accept: "text/html" },
        redirect: "manual",
        signal: AbortSignal.timeout(this.#options.requestTimeoutMs)
      });
      if (probe.status >= 400) {
        throw new BusabaseOAuthError(
          "oauth_unavailable",
          `Busabase OAuth is unavailable (${probe.status})`,
          probe.status
        );
      }
      this.#pendingOAuth.set(oauthRequest.state, {
        ...oauthRequest,
        expiresAt: this.#now() + this.#options.oauthPendingTtlMs
      });
      return Response.redirect(oauthRequest.authorizeUrl, 303);
    } catch (error) {
      const redirect = new URL(this.#options.errorPath, requestOrigin(request));
      redirect.searchParams.set(
        "oauth_error",
        error instanceof Error ? error.message : "Unable to start Busabase OAuth"
      );
      return Response.redirect(redirect, 303);
    }
  };
  callback = async (request) => {
    const callback = new URL(request.url);
    const state = callback.searchParams.get("state") || "";
    const pending = this.#pendingOAuth.get(state);
    this.#pendingOAuth.delete(state);
    try {
      if (!pending || pending.expiresAt <= this.#now()) {
        throw new BusabaseOAuthError("oauth_request_expired", "OAuth request expired");
      }
      const code = parseBusabaseOAuthCallback(callback.toString(), pending);
      const tokenSet = await exchangeBusabaseOAuthCode(pending, code, this.#fetch());
      storeBusabaseAirAppOAuthCredential(
        {
          appId: this.#options.appId,
          baseUrl: pending.baseUrl,
          clientId: this.#options.clientId,
          tokenSet
        },
        this.#options.credentialStore
      );
      return Response.redirect(new URL(this.#options.successPath, requestOrigin(request)), 303);
    } catch (error) {
      const redirect = new URL(this.#options.errorPath, requestOrigin(request));
      redirect.searchParams.set(
        "oauth_error",
        error instanceof Error ? error.message : "Busabase OAuth callback failed"
      );
      return Response.redirect(redirect, 303);
    }
  };
  selectSpace = async (request) => {
    try {
      assertSameOrigin(request);
      const body = await readInput(request);
      const spaceId = String(body.space_id || "").trim();
      const target = await this.#target();
      if (!target) {
        return jsonError(
          401,
          BUSABASE_AIRAPP_GATEWAY_REASONS.connectionRequired,
          "Connect Busabase before selecting a Space"
        );
      }
      const info = await this.#authInfo(target);
      const selected = info.spaces.find((space) => space.id === spaceId);
      if (!selected) {
        return jsonError(
          403,
          BUSABASE_AIRAPP_GATEWAY_REASONS.spaceNotAllowed,
          "The selected Space is not accessible to this account"
        );
      }
      await this.#authInfo(target, selected.id);
      this.#persistSelectedSpace(target, selected);
      return Response.json({ ok: true, space: { id: selected.id, name: selected.name } });
    } catch (error) {
      return jsonError(
        400,
        BUSABASE_AIRAPP_GATEWAY_REASONS.authUnavailable,
        error instanceof Error ? error.message : "Unable to select Busabase Space"
      );
    }
  };
  logout = async (request) => {
    try {
      assertSameOrigin(request);
      if (loadBusabaseAirAppOAuthCredential(this.#options.appId, this.#options.credentialStore)) {
        await revokeBusabaseAirAppOAuthCredential(
          this.#options.appId,
          this.#options.credentialStore,
          this.#fetch()
        ).catch(() => void 0);
      }
      this.#environmentSelectedSpace = void 0;
      return Response.json({ ok: true });
    } catch (error) {
      return jsonError(
        400,
        BUSABASE_AIRAPP_GATEWAY_REASONS.authUnavailable,
        error instanceof Error ? error.message : "Unable to disconnect Busabase"
      );
    }
  };
  proxy = async (request) => {
    let target;
    try {
      target = await this.#target();
    } catch {
      return jsonError(
        401,
        BUSABASE_AIRAPP_GATEWAY_REASONS.authRequired,
        "Busabase authentication expired"
      );
    }
    if (!target) {
      return jsonError(
        401,
        BUSABASE_AIRAPP_GATEWAY_REASONS.connectionRequired,
        "Busabase connection required"
      );
    }
    let selectedSpace = target.selectedSpace;
    if (!selectedSpace) {
      try {
        const info = await this.#authInfo(target);
        if (info.spaces.length === 1) {
          selectedSpace = info.spaces[0];
          this.#persistSelectedSpace(target, selectedSpace);
        }
      } catch {
        return jsonError(
          503,
          BUSABASE_AIRAPP_GATEWAY_REASONS.authUnavailable,
          "Busabase authentication could not be verified"
        );
      }
    }
    if (!selectedSpace) {
      return jsonError(
        409,
        BUSABASE_AIRAPP_GATEWAY_REASONS.spaceSelectionRequired,
        "Busabase Space selection required"
      );
    }
    const incoming = new URL(request.url);
    const targetUrl = new URL(incoming.pathname + incoming.search, target.baseUrl);
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    const accept = request.headers.get("accept");
    if (contentType) headers.set("content-type", contentType);
    if (accept) headers.set("accept", accept);
    headers.set("x-busabase-space", selectedSpace.id);
    if (target.accessToken) headers.set("authorization", `Bearer ${target.accessToken}`);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    let upstream;
    try {
      upstream = await this.#fetch()(targetUrl, {
        method: request.method,
        headers,
        body: hasBody ? await request.arrayBuffer() : void 0,
        redirect: "manual"
      });
    } catch {
      return jsonError(
        503,
        BUSABASE_AIRAPP_GATEWAY_REASONS.authUnavailable,
        "Busabase API is temporarily unavailable"
      );
    }
    const responseHeaders = new Headers();
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) responseHeaders.set("content-type", upstreamType);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  };
};
var createBusabaseAirAppLocalGateway = (options) => new BusabaseAirAppLocalGateway(options);
export {
  BUSABASE_AIRAPP_GATEWAY_REASONS,
  BusabaseAirAppLocalGateway,
  createBusabaseAirAppLocalGateway
};
