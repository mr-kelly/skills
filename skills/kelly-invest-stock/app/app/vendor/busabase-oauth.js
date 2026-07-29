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
export {
  BUSABASE_AIRAPP_CLIENT_ID,
  BusabaseOAuthError,
  createBusabaseOAuthRequest,
  exchangeBusabaseOAuthCode,
  parseBusabaseOAuthCallback,
  refreshBusabaseOAuthToken,
  revokeBusabaseOAuthToken
};
