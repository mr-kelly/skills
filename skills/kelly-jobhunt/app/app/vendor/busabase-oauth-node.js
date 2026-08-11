// ../../../../../.codex/worktrees/busabase-sdk-oauth/kapps/apps/busabase-sdk/dist/chunk-5NYQX65A.js
function normalizeBaseUrl(raw) {
  return raw.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

// ../../../../../.codex/worktrees/busabase-sdk-oauth/kapps/apps/busabase-sdk/dist/chunk-J2DZKX7A.js
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

// ../../../../../.codex/worktrees/busabase-sdk-oauth/kapps/apps/busabase-sdk/dist/oauth-node.js
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
    tokenType: input.tokenSet.tokenType
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
        }
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
export {
  busabaseAirAppCredentialPath,
  busabaseAirAppCredentialsDir,
  clearBusabaseAirAppOAuthCredential,
  getBusabaseAirAppAccessToken,
  loadBusabaseAirAppOAuthCredential,
  revokeBusabaseAirAppOAuthCredential,
  storeBusabaseAirAppOAuthCredential
};
