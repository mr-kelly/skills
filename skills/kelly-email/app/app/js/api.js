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

export async function api(path, body = null) {
  const url = withContextParams(path);
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}
