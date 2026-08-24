/**
 * Where am I running? — answered by this app's own server, not by the URL.
 *
 * Busabase spawns the App's process in every runtime it hosts and injects
 * `BUSABASE_AIRAPP_RUNTIME` (`nodepod` | `local-node` | `srt` | `embed`).
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

const UNKNOWN_RUNTIME = { runtime: "unknown", hosted: false, determined: false };
const HOSTED = new Set(["nodepod", "local-node", "srt", "embed"]);

const normalize = (body) => {
  if (!body || typeof body !== "object" || typeof body.runtime !== "string") return UNKNOWN_RUNTIME;
  return {
    runtime: body.runtime,
    hosted: body.hosted === true || HOSTED.has(body.runtime),
    determined: true,
  };
};

/**
 * Relative path on purpose: under the Local Node engine the App is served from a
 * sub-path of busabase's origin, so a leading slash would resolve against that
 * origin's root. The content-type check matters too — a hosted origin's
 * catch-all route can answer 200 with an HTML shell, which `response.ok` alone
 * would read as a successful probe. The timeout keeps a hung probe from holding
 * the module graph open; it degrades to "unknown", which every caller below
 * treats as its own safe side.
 */
const probe = async () => {
  try {
    const response = await fetch("__airapp/runtime", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !type.includes("application/json")) return UNKNOWN_RUNTIME;
    return normalize(await response.json());
  } catch {
    return UNKNOWN_RUNTIME;
  }
};

// Top-level await: every importer's module body runs only after this resolves,
// so the predicates below stay synchronous for their existing call sites.
export const runtime = await probe();

/**
 * Whether the local `/auth/*` gateway applies. An unnecessary connect gate is
 * closed by the operator; a missing one strands them — so `unknown` shows it.
 */
export const shouldUseLocalGateway = () => !runtime.hosted;

/**
 * Whether this process may merge its own writes instead of raising a
 * ChangeRequest. `unknown` must read as NOT standalone: a reviewable write can
 * still be approved, but one that auto-merged has already crossed the boundary.
 */
export const isStandaloneLocalRuntime = () => runtime.determined && !runtime.hosted;
