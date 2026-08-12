const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const firstHeaderValue = (value) =>
  String(value || "")
    .split(",", 1)[0]
    .trim();

const requestHostname = (request) => {
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  try {
    return forwardedHost ? new URL(`http://${forwardedHost}`).hostname : new URL(request.url).hostname;
  } catch {
    return "";
  }
};

/** The public OAuth client accepts local development callbacks only on loopback. */
export const oauthCallbackCapability = (request) => ({
  oauthCallbackSupported: LOOPBACK_HOSTS.has(requestHostname(request)),
});
