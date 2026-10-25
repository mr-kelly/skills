/**
 * Where am I running? — the app's single entry point for that question.
 *
 * The probe itself is the SDK's: `detectAirAppRuntime()` from `busabase-sdk/airapp`
 * (vendored as `../vendor/busabase-airapp.js`) asks this app's own server
 * (`server.js`), which reads the `BUSABASE_AIRAPP_RUNTIME` env var Busabase
 * injects when it spawns the app. The SDK owns the rules that kept breaking in
 * hand-written copies: a relative path, a JSON content-type check, a 3 s
 * timeout, `hosted` taken from the server's own boolean, and an `unknown`
 * outcome when the probe does not answer. Do not re-implement any of it here.
 *
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

import { AIRAPP_RUNTIME_UNKNOWN, detectAirAppRuntime, shouldUseLocalAirAppGateway } from "../vendor/busabase-airapp.js";

/**
 * `{ runtime, hosted, devProxy, determined }`. Never rejects, and the answer is
 * shared page-wide, so every caller may ask without another round trip.
 */
export const getRuntime = () => detectAirAppRuntime();

/**
 * Whether this app's own `/auth/*` connect gate applies — the `shouldGate`
 * answer. `unknown` shows the gate: an unnecessary gate is closed by the
 * operator, a missing one strands them.
 */
export const shouldUseLocalGateway = (runtime) => shouldUseLocalAirAppGateway(runtime ?? AIRAPP_RUNTIME_UNKNOWN);

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
