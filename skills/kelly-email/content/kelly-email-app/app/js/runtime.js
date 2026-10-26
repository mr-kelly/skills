/**
 * Where am I running? — answered by this app's own server, not by the URL.
 *
 * Busabase spawns the App's process in every runtime it hosts and injects
 * `BUSABASE_AIRAPP_RUNTIME` — any non-empty value. Deliberately not enumerated
 * here: an app that lists engine names goes stale every time one is renamed.
 * Nobody else sets it, so its absence is the positive fact "standalone".
 * `server.js` re-exposes it because the browser cannot read env vars.
 *
 * This replaces a loopback-hostname test (minus iframe nesting and the
 * `/api/airapp-preview/` path), which misfires in both directions: a hosted
 * AirApp is served from `localhost` on Desktop and OSS, and a standalone run is
 * routinely reached over a LAN IP or a signed dev tunnel such as
 * `https://3111-….dev.budaapps.com` — where the App decided it was hosted,
 * skipped its own connect gate, called `/api/v1` with no credential, and
 * reported an error the operator could not act on.
 */

import { detectAirAppRuntime, shouldUseLocalAirAppGateway } from "../vendor/busabase-sdk.js";

// Top-level await: every importer's module body runs only after this resolves,
// so the predicate below stays synchronous for its existing call site. The SDK
// probes relative `__airapp/runtime`, checks the content type, times out, and
// degrades to "unknown" — which shows the gate, the safe side.
export const runtime = await detectAirAppRuntime();

/**
 * Whether the local `/auth/*` gateway applies. An unnecessary connect gate is
 * closed by the operator; a missing one strands them — so `unknown` shows it.
 */
export const shouldUseLocalGateway = () => shouldUseLocalAirAppGateway(runtime);
