/**
 * The app's four reads and writes, answered in the page.
 *
 * These used to be `/api/state`, `/api/lock`, `/api/decision` and `/api/detail`
 * on the app's own server, which then called Busabase itself. Hosted, that
 * server has no credential and no Busabase address, so every one of them failed
 * (see `connection.js`). The page now runs the same data layer against its own
 * same-origin `/api/v1`; the server only serves files, the runtime report, the
 * demo fixture and (standalone) the local gateway.
 */
import { useSameOriginBusabase } from "./connection.js";
import { updateDetail, updateItems } from "./decisions.js";
import { createProvider } from "./index.js";
import { lockPayload } from "./lock.js";
import { statePayload } from "./state.js";

useSameOriginBusabase(window.location.origin);

const ROUTES = {
  "/api/state": (query) => statePayload(query),
  "/api/lock": async () => ({ lock: await lockPayload() }),
  "/api/decision": (_query, body) => updateItems(body),
  "/api/detail": (_query, body) => updateDetail(body),
};

/** Whether `pathname` is one of the routes answered here. */
export const isPageRoute = (pathname) => Object.hasOwn(ROUTES, pathname);

export function callPageRoute(pathname, query, body) {
  return ROUTES[pathname](query, body ?? {});
}

/**
 * An attachment saved by the trusted skill process, as a URL the page can open.
 * Its record stores `/api/provider-file/<path>`; the bytes live in the app's
 * Drive, which only the page can read once hosted.
 */
const PROVIDER_FILE = "/api/provider-file/";
const objectUrls = new Map();

/**
 * `inline` answers a `data:` URL: an image inside the email's sandboxed `srcdoc`
 * frame runs in an opaque origin, which cannot load this page's `blob:` URLs.
 */
export async function providerFileUrl(url, { inline = false } = {}) {
  if (!String(url || "").startsWith(PROVIDER_FILE)) return url;
  const key = `${inline ? "inline" : "blob"}:${url}`;
  if (objectUrls.has(key)) return objectUrls.get(key);
  const pathname = decodeURIComponent(url.slice(PROVIDER_FILE.length));
  const file = await createProvider().getFile(pathname);
  if (!file || typeof file.data !== "string") return "";
  const type = String(file.meta?.content_type || "application/octet-stream");
  const base64 = file.meta?.encoding === "base64";
  let resolved;
  if (inline) {
    const data = base64 ? file.data : btoa(String.fromCharCode(...new TextEncoder().encode(file.data)));
    resolved = `data:${type};base64,${data}`;
  } else {
    const bytes = base64
      ? Uint8Array.from(atob(file.data), (char) => char.charCodeAt(0))
      : new TextEncoder().encode(file.data);
    resolved = URL.createObjectURL(new Blob([bytes], { type }));
  }
  objectUrls.set(key, resolved);
  return resolved;
}
