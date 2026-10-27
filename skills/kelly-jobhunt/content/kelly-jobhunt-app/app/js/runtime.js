/**
 * Where am I running? — answered once, by this app's own server.
 *
 * Busabase spawns the AirApp's process in every runtime it hosts and injects
 * `BUSABASE_AIRAPP_RUNTIME` with a non-empty value.
 * Nobody else sets it, so its absence is the positive fact "standalone".
 * `server.js` re-exposes it at `__airapp/runtime` because the browser cannot
 * read environment variables.
 *
 * This replaces a URL-shaped guess (loopback hostname + iframe nesting +
 * `/api/airapp-preview/` path), which misfires in both directions. A
 * Busabase-hosted AirApp is served from `localhost` on Desktop and OSS, and a
 * standalone `npm run dev` is routinely reached over a LAN IP or a signed dev
 * tunnel such as `https://3111-….dev.budaapps.com` — neither loopback nor a
 * hosted preview path, so the app skipped its own connect gate, called
 * `/api/v1` with no credential, and reported an error nobody could act on.
 */

const UNKNOWN_RUNTIME = { runtime: "unknown", hosted: false, determined: false };

/**
 * The cache lives on a global slot, not in module scope, because this app
 * imports its modules with and without a `?v=` cache-busting query — and those
 * are two different module records with two separate module scopes. A
 * module-level cache would be filled by whichever copy `app.js` loaded and read
 * empty by the copy the provider loaded, so every write would silently fall
 * back to "not standalone" even in a local preview.
 */
const SLOT = "__airappRuntimeState";
globalThis[SLOT] = globalThis[SLOT] || { cached: null, pending: null };
const store = globalThis[SLOT];

const normalize = (body) => {
  if (!body || typeof body !== "object" || typeof body.runtime !== "string") return UNKNOWN_RUNTIME;
  return { runtime: body.runtime, hosted: body.hosted === true, determined: true };
};

/**
 * Relative path on purpose: a hosted app can be served from a sub-path of
 * Busabase's origin, and a leading slash would resolve against that origin's
 * root instead. The content-type check is not paranoia either — a
 * hosted origin's catch-all route can answer 200 with an HTML shell, which
 * `response.ok` alone would read as a successful probe.
 *
 * Call once at boot, before anything asks a question whose answer depends on it.
 */
export async function initRuntime() {
  if (!store.pending) {
    store.pending = fetch("__airapp/runtime", { headers: { accept: "application/json" } })
      .then((response) => {
        const type = response.headers.get("content-type") || "";
        if (!response.ok || !type.includes("application/json")) return null;
        return response.json();
      })
      .catch(() => null)
      .then((body) => {
        store.cached = normalize(body);
        return store.cached;
      });
  }
  return store.pending;
}

/** The resolved runtime, or the `unknown` placeholder before `initRuntime()`. */
export const runtimeSnapshot = () => store.cached || UNKNOWN_RUNTIME;

/**
 * Whether the local `/auth/*` gateway applies. Showing a connect gate that turns
 * out to be unnecessary is recoverable — the operator closes it. Skipping one
 * that was needed is the reported bug, so an undetermined runtime shows it.
 * Where the app runs never decides whether a write merges: Busabase decides that
 * from the person's own permission.
 */
export const shouldUseLocalGateway = (runtime = runtimeSnapshot()) => !runtime.hosted;
