import { DEMO_SCENARIO, URL_LANG } from "./store.js";

export function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2800);
}

export function withDemoParams(path) {
  if (!DEMO_SCENARIO) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("demo", DEMO_SCENARIO);
  if (URL_LANG) url.searchParams.set("lang", URL_LANG);
  return url.pathname + url.search;
}

export async function api(path, body = null) {
  const res = await fetch(withDemoParams(path), {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}
