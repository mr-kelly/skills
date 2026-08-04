// The browser now talks to Busabase directly through js/providers/*.js
// (see js/state.js) instead of fetch()-ing a server /api/* route — this
// module keeps only the toast() helper every other view module imports, plus
// a re-export of getProvider() for call sites that need the provider
// directly (actions.js, settings.js).
export { getProvider } from "./providers/index.js?v=0.1.0";

export function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2800);
}
