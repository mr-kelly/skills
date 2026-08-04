// Connection UX Contract gate: shown only for an explicitly-requested standalone
// local preview on loopback, before the CRM shell mounts. A deployed AirApp uses
// its ambient Busabase session and never reaches this module's fetch calls.
// Offers Busabase Cloud or a custom server URL and one Connect action — never an
// API key field, device code, or data-provider choice. Renders as a fixed
// overlay over the static shell in index.html, the same technique the retired
// setup-gate.js used, so index.html and the CRM routes need no change.
import { getProvider } from "./providers/index.js?v=0.1.0";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function isStandaloneLocalRuntime() {
  const host = window.location.hostname;
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".localhost");
  const busabaseHosted = window.self !== window.top || window.location.pathname.startsWith("/api/airapp-preview/");
  return loopback && !busabaseHosted;
}

function overlayRoot() {
  let root = document.querySelector("#connectGate");
  if (!root) {
    root = document.createElement("div");
    root.id = "connectGate";
    document.body.prepend(root);
  }
  document.documentElement.classList.add("ks-setup-active");
  return root;
}

export function closeConnectGate() {
  document.querySelector("#connectGate")?.remove();
  document.documentElement.classList.remove("ks-setup-active");
}

async function fetchAuthStatus() {
  const response = await fetch("/auth/status", { headers: { accept: "application/json" } });
  return response.json();
}

function renderConnectScreen(status = {}) {
  const root = overlayRoot();
  const oauthError = new URLSearchParams(window.location.search).get("oauth_error");
  root.innerHTML = `<div class="ks-setup-overlay"><section class="ks-setup-panel" role="dialog" aria-modal="true" aria-labelledby="ksConnectTitle"><div class="ks-setup-head"><div><h1 id="ksConnectTitle">Connect Busabase</h1><p>Kelly Legal Contracts reads and writes through your Busabase workspace.</p></div></div><form class="ks-setup-body" method="post" action="/auth/start">${oauthError ? `<p class="ks-setup-error" role="alert">${escapeHtml(oauthError)}</p>` : ""}${status.expired ? '<p class="ks-setup-loading">Your session expired. Reconnect to continue.</p>' : ""}<h2>Server</h2><div class="ks-provider-grid"><label class="ks-provider-card is-selected ks-connect-option"><input type="radio" name="server_mode" value="cloud" checked><span><strong>Busabase Cloud</strong><span>busabase.com</span></span></label><label class="ks-provider-card ks-connect-option"><input type="radio" name="server_mode" value="custom"><span><strong>Custom server</strong><span>Self-hosted or enterprise address</span></span></label></div><label class="ks-busabase-fields" data-custom-url hidden><span>Busabase URL</span><input type="url" name="custom_base_url" inputmode="url" placeholder="https://busabase.example.com" autocomplete="url"></label><input type="hidden" name="base_url" value="${escapeHtml(status.cloudBaseUrl || "https://busabase.com")}"><div class="ks-setup-footer ks-setup-footer-split"><span class="ks-setup-loading">OAuth credentials stay on this machine (~/.busabase/airapps)</span><button class="ks-setup-primary" type="submit">Connect Busabase</button></div></form></section></div>`;
  const form = root.querySelector("form");
  const customField = form.querySelector("[data-custom-url]");
  const customInput = customField.querySelector("input");
  const hiddenBaseUrl = form.querySelector('input[name="base_url"]');
  form.querySelectorAll('input[name="server_mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const custom = radio.value === "custom";
      form.querySelectorAll(".ks-provider-card").forEach((card) => {
        card.classList.toggle("is-selected", card.querySelector("input").checked);
      });
      customField.hidden = !custom;
      customInput.required = custom;
      hiddenBaseUrl.value = custom ? customInput.value : status.cloudBaseUrl || "https://busabase.com";
      if (custom) customInput.focus();
    });
  });
  customInput.addEventListener("input", () => {
    hiddenBaseUrl.value = customInput.value;
  });
}

function renderSpaceScreen(status, onSelected) {
  const root = overlayRoot();
  const options = (status.spaces || [])
    .map(
      (space) => `<option value="${escapeHtml(space.id)}">${escapeHtml(space.name)} · ${escapeHtml(space.id)}</option>`,
    )
    .join("");
  root.innerHTML = `<div class="ks-setup-overlay"><section class="ks-setup-panel" role="dialog" aria-modal="true" aria-labelledby="ksSpaceTitle"><div class="ks-setup-head"><div><h1 id="ksSpaceTitle">Choose a Busabase Space</h1><p>Signed in to <strong>${escapeHtml(status.baseUrl || "")}</strong>. Choose where Kelly Legal Contracts's data lives.</p></div></div><form class="ks-setup-body" data-space-form><label class="ks-space-select"><span>Space</span><select name="space_id" required>${options}</select></label><p class="ks-setup-error" data-space-error hidden></p><div class="ks-setup-footer ks-setup-footer-split"><span class="ks-setup-loading">Resources are only checked after you confirm</span><button class="ks-setup-primary" type="submit">Use this Space</button></div></form></section></div>`;
  root.querySelector("[data-space-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const error = form.querySelector("[data-space-error]");
    button.disabled = true;
    error.hidden = true;
    const response = await fetch("/auth/space", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(new FormData(form)),
    });
    const result = await response.json();
    if (!response.ok) {
      error.textContent = result.error || "Could not select a Space.";
      error.hidden = false;
      button.disabled = false;
      return;
    }
    onSelected();
  });
}

function renderWorkspaceScreen(error, onRetry) {
  const root = overlayRoot();
  const raw = String(error?.message || error || "SETUP_REQUIRED");
  const [code] = raw.split(":", 1);
  const reason = raw.replace(/^[A-Z_]+:\s*/, "");
  const pending = code === "SETUP_PENDING";
  const retryOnly = ["SETUP_PENDING", "SCHEMA_INCOMPLETE"].includes(code);
  const canProvision = code === "SETUP_REQUIRED";
  const title = pending
    ? "Waiting for workspace approval"
    : canProvision
      ? "Initialize the Busabase workspace"
      : "Workspace not ready";
  const body = canProvision
    ? "<p>Kelly Legal Contracts will create its Folder and Bases in the current Space.</p><p>Submitted as one idempotent Busabase ChangeRequest; nothing existing is deleted or repurposed.</p>"
    : `<p>${escapeHtml(reason)}</p><p>Kelly Legal Contracts never asks you to create Nodes/Bases by hand or switches to local data.</p>`;
  root.innerHTML = `<div class="ks-setup-overlay"><section class="ks-setup-panel" role="dialog" aria-modal="true" aria-labelledby="ksWorkspaceTitle"><div class="ks-setup-head"><div><h1 id="ksWorkspaceTitle">${title}</h1></div></div><div class="ks-setup-body">${body}<p class="ks-setup-error" data-workspace-status hidden></p></div><div class="ks-setup-footer ks-setup-footer-split"><a class="ks-text-link" href="?demo=1#/overview">Open the read-only demo</a>${canProvision ? '<button class="ks-setup-primary" type="button" data-provision>Initialize workspace</button>' : retryOnly ? '<button class="ks-setup-primary" type="button" data-retry>Check again</button>' : ""}</div></section></div>`;
  root.querySelector("[data-retry]")?.addEventListener("click", onRetry);
  root.querySelector("[data-provision]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const status = root.querySelector("[data-workspace-status]");
    button.disabled = true;
    status.hidden = false;
    status.textContent = "Submitting the workspace structure...";
    try {
      const provider = await getProvider();
      await provider.provisionResources();
      onRetry();
    } catch (provisionError) {
      renderWorkspaceScreen(provisionError, onRetry);
    }
  });
}

// Runs before the CRM shell mounts. Returns true once the app is clear to load
// state from the provider (standalone local runtime is connected + Space
// selected, or this is Demo / a deployed AirApp with its ambient session).
// Returns false while a gate screen owns the overlay and is waiting on the
// operator; call again after onSelected() fires.
export async function passConnectGate({ onReady } = {}) {
  const demo = new URLSearchParams(window.location.search).has("demo");
  if (demo || !isStandaloneLocalRuntime()) return true;

  const status = await fetchAuthStatus();
  if (!status.connected) {
    renderConnectScreen(status);
    return false;
  }
  if (status.requiresSpace) {
    renderSpaceScreen(status, onReady);
    return false;
  }
  return true;
}

export function renderSetupRequired(error, onRetry) {
  renderWorkspaceScreen(error, onRetry);
}
