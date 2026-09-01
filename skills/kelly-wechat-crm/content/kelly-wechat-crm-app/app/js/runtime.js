/**
 * Where am I running? — the app's single source of truth.
 *
 * Answered by this app's own server (`server.js`), which reads the
 * `BUSABASE_AIRAPP_RUNTIME` env var Busabase injects when it spawns the app.
 * No other module may branch on the environment, and nothing anywhere may look
 * at `location.hostname`: a Busabase-hosted AirApp can be served from
 * `localhost`, and a standalone `npm run dev` can be reached over a signed dev
 * tunnel — so both directions of a hostname test are wrong. `scripts/check.mjs`
 * rejects hostname-based detection for exactly this reason.
 *
 * Three outcomes, never two:
 *   hosted      — Busabase serves `/api/v1`; never show a local OAuth gate.
 *   standalone  — this app's own server; the OAuth gate belongs here.
 *   unknown     — the runtime endpoint didn't answer. Say so; don't guess.
 */

const UNKNOWN_RUNTIME = { runtime: "unknown", hosted: false, devProxy: false, determined: false };

let pending = null;

const normalize = (body) => {
  if (!body || typeof body !== "object" || typeof body.runtime !== "string") return UNKNOWN_RUNTIME;
  return {
    runtime: body.runtime,
    hosted: body.hosted === true,
    devProxy: body.devProxy === true,
    determined: true,
  };
};

/**
 * Relative path on purpose: a hosted app can live on a sub-path of Busabase's
 * origin, and `<base href>` makes a relative fetch
 * resolve there. A leading slash would hit busabase's own root and 404.
 *
 * The content-type check is not paranoia — a hosted origin's catch-all route
 * can answer 200 with an HTML shell, and `response.ok` alone would read that
 * as a successful runtime probe.
 */
export async function getRuntime() {
  if (!pending) {
    pending = fetch("__airapp/runtime", { headers: { accept: "application/json" } })
      .then((response) => {
        const type = response.headers.get("content-type") || "";
        if (!response.ok || !type.includes("application/json")) return null;
        return response.json();
      })
      .catch(() => null)
      .then(normalize);
  }
  return pending;
}

/** Human-readable runtime label for the settings panel. */
export const runtimeLabel = (runtime) => (runtime.hosted ? `${runtime.runtime} (Busabase-hosted)` : runtime.runtime);

/**
 * Which explanation fits a failed data load. The message keys live in
 * `messages.js`; this only picks one, so it stays free of copy and locale.
 *
 * Splitting this out is the actual fix for the misleading-copy problem: a
 * fixed "authenticated" string, or one chosen from the environment alone, will
 * eventually be shown in a state where it is false. The pair
 * (where am I, do I have credentials) is what determines the sentence.
 */
export function connectionHintKey(runtime) {
  if (!runtime.determined) return "hintUnknown";
  if (runtime.hosted) return "hintHosted";
  return runtime.devProxy ? "hintDevProxy" : "hintStandalone";
}
