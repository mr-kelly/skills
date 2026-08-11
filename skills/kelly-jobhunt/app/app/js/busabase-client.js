import { createBusabaseClient } from "../vendor/busabase-sdk.js";

import { appConfig } from "./config.js";

export function createRuntimeClient() {
  return createBusabaseClient({
    baseUrl: window.location.origin,
    ...(appConfig.spaceId ? { spaceId: appConfig.spaceId } : {}),
  });
}

// A standalone loopback preview is the trusted operator's own machine, so its
// writes merge immediately. A deployed AirApp is inside the Busabase review
// boundary and must leave every write as a pending ChangeRequest.
export function isStandaloneLocalRuntime() {
  const loopbackHost =
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) ||
    window.location.hostname.endsWith(".localhost");
  const busabaseHosted = window.self !== window.top || window.location.pathname.startsWith("/api/airapp-preview/");
  return loopbackHost && !busabaseHosted;
}
