import { store } from "./store.js";

export function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

export function withContextParams(path) {
  const url = new URL(path, window.location.origin);
  for (const key of ["demo", "lang"]) {
    const value = store.params.get(key);
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

// The demo fixture is served by this app's own server; everything else is read
// and written in the page, against Busabase's same-origin `/api/v1` (see
// data/page-api.js). Loaded lazily so the demo never pulls in the SDK bundle.
let pageApi = null;
const loadPageApi = () => (pageApi ||= import("./data/page-api.js"));

export async function api(path, body = null) {
  const url = withContextParams(path);
  const parsed = new URL(url, window.location.origin);
  if (!store.params.has("demo")) {
    const routes = await loadPageApi();
    if (routes.isPageRoute(parsed.pathname)) {
      return routes.callPageRoute(parsed.pathname, Object.fromEntries(parsed.searchParams), body);
    }
  }
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

/** Resolve a saved attachment to a URL the page can open (`""` when it cannot). */
export async function attachmentUrl(url, options = {}) {
  if (store.params.has("demo")) return url;
  return (await loadPageApi()).providerFileUrl(url, options);
}
