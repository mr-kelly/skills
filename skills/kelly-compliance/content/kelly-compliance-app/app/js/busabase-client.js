import { createBusabaseClient } from "../vendor/busabase-sdk.js";

import { appConfig } from "./config.js";

/**
 * One client, one URL, every environment.
 *
 * The app always calls Busabase's public REST surface on its *own* origin.
 * Deployed inside Busabase that origin IS Busabase, so `/api/v1` reaches the
 * real backend and the logged-in user's session cookie authenticates it — no
 * key, no bridge prefix, no Cloud-vs-Desktop fork. Run locally with
 * `npm run dev`, the same `/api/v1` path is served by this app's own dev proxy
 * (see `server.js`), which forwards to whichever Busabase you point
 * `BUSABASE_BASE_URL` at and attaches your key server-side.
 *
 * That is why no credential ever appears in these files: the browser never
 * holds one.
 */
export function createRuntimeClient() {
  return createBusabaseClient({
    baseUrl: window.location.origin,
    ...(appConfig.spaceId ? { spaceId: appConfig.spaceId } : {}),
  });
}
