export function createBusabaseOAuthRequest(opts) { return Promise.resolve({ authorizeUrl: opts.baseUrl + "/oauth/authorize", state: "state-123", baseUrl: opts.baseUrl }); }
export function parseBusabaseOAuthCallback(url, pending) { return "code-123"; }
export function exchangeBusabaseOAuthCode(pending, code) { return Promise.resolve({ access_token: "token-123" }); }
