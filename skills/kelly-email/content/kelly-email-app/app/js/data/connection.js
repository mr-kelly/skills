/**
 * Where this data layer reaches Busabase, set once by whoever imports it.
 *
 * The same modules run in two places:
 *
 * - **The page** (every runtime). It calls `/api/v1` on its own origin. Inside
 *   Busabase that origin IS Busabase, and the viewer's session authenticates the
 *   call. Standalone, the same path is this app's local gateway
 *   (`server/local-auth.js`), which attaches the credential and the Space the
 *   operator confirmed. The browser never holds a credential in either case.
 * - **The trusted skill process** (`scripts/*.ts`). It has no page; it reads
 *   its Busabase address and credential from its environment, which the SDK
 *   does by default when no `baseUrl` is given. That is the default here.
 *
 * The earlier shape of this app kept these calls on its own Node server, which
 * built the Busabase address from the incoming request. Hosted, that address is
 * the app's own in-pod server, which has no credential: a hosted AirApp process
 * is given `BUSABASE_AIRAPP_RUNTIME` and nothing else. So setup never finished
 * once installed. The page's same-origin `/api/v1` is the only route to the data.
 */

// Until the page claims it, a Node process is the trusted skill process.
const isNodeProcess = typeof process !== "undefined" && Boolean(process.versions?.node);
const connection = { baseUrl: undefined, trusted: isNodeProcess };

/** The page: same-origin `/api/v1`, no credential, no Space header. */
export function useSameOriginBusabase(origin) {
  connection.baseUrl = origin;
  connection.trusted = false;
}

export const busabaseBaseUrl = () => connection.baseUrl;

/**
 * Only the trusted skill process can see injected Vault secrets, so only it can
 * say whether they are missing. The page reports none missing rather than all.
 */
export const canInspectSecrets = () => connection.trusted;

export function environmentValue(name) {
  if (!connection.trusted || typeof process === "undefined" || !process.env) return "";
  return String(process.env[name] || "");
}
