// @ts-nocheck

// node_modules/.pnpm/busabase-sdk@0.16.1/node_modules/busabase-sdk/dist/airapp-gate.js
function selectAirAppGateScreen(status) {
  if (!status) return "connect";
  switch (status.readiness) {
    case "needs_connection":
    case "needs_auth":
      return "connect";
    case "needs_space":
      return "space";
    case "ready":
      return "ready";
  }
  if (!status.connected) return "connect";
  return status.requiresSpace ? "space" : "ready";
}
function describeAirAppSetupError(error) {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "";
  const raw = String(
    (typeof error === "object" && error !== null && "message" in error ? error.message : error) ?? "SETUP_REQUIRED"
  );
  const parsed = /^([A-Z_]+):\s*(.*)$/s.exec(raw);
  const resolvedCode = code || parsed?.[1] || raw.trim() || "SETUP_REQUIRED";
  const detail = parsed ? parsed[2] : code ? raw : "";
  const pending = resolvedCode === "SETUP_PENDING";
  const canProvision = resolvedCode === "SETUP_REQUIRED";
  return {
    code: resolvedCode,
    detail,
    title: pending ? "Waiting for workspace approval" : canProvision ? "Initialize the Busabase workspace" : "Workspace not ready",
    canProvision,
    canRetry: resolvedCode === "SETUP_PENDING" || resolvedCode === "SCHEMA_INCOMPLETE"
  };
}
var escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
var panel = (labelledBy, head, body, footer) => `<div class="bb-gate-overlay"><section class="bb-gate-panel" role="dialog" aria-modal="true" aria-labelledby="${labelledBy}"><div class="bb-gate-head"><div>${head}</div></div><div class="bb-gate-body">${body}</div><div class="bb-gate-footer">${footer}</div></section></div>`;
var defaultAirAppGateRenderer = {
  connect(view) {
    const head = `<h1 id="bbGateConnectTitle">Connect Busabase</h1><p>${escapeHtml(view.appName)} reads and writes through your Busabase workspace.</p>`;
    const body = (view.oauthError ? `<p class="bb-gate-error" role="alert">${escapeHtml(view.oauthError)}</p>` : "") + (view.reconnect ? `<p class="bb-gate-note">Your session expired. Reconnect to continue.</p>` : "") + `<h2>Server</h2><div class="bb-gate-server-grid"><label class="bb-gate-server-card is-selected"><input type="radio" name="server_mode" value="cloud" checked><span><strong>Busabase Cloud</strong><span>${escapeHtml(hostOf(view.cloudBaseUrl))}</span></span></label><label class="bb-gate-server-card"><input type="radio" name="server_mode" value="custom"><span><strong>Custom server</strong><span>Self-hosted or enterprise address</span></span></label></div><label class="bb-gate-custom-url" data-custom-url hidden><span>Busabase URL</span><input type="url" name="custom_base_url" inputmode="url" placeholder="https://busabase.example.com" autocomplete="url"></label><input type="hidden" name="base_url" value="${escapeHtml(view.cloudBaseUrl)}">`;
    const footer = `<span class="bb-gate-note">OAuth credentials stay on this machine (~/.busabase/airapps)</span><button class="bb-gate-primary" type="submit">Connect Busabase</button>`;
    return `<form method="post" action="${escapeHtml(`${view.authBasePath}/auth/start`)}" data-connect-form>${panel("bbGateConnectTitle", head, body, footer)}</form>`;
  },
  space(view) {
    const options = view.spaces.map(
      (space) => `<option value="${escapeHtml(space.id)}">${escapeHtml(space.name)} \xB7 ${escapeHtml(space.id)}</option>`
    ).join("");
    const head = `<h1 id="bbGateSpaceTitle">Choose a Busabase Space</h1><p>Signed in to <strong>${escapeHtml(view.baseUrl)}</strong>. Choose where ${escapeHtml(view.appName)}'s data lives.</p>`;
    const body = `<label class="bb-gate-space-select"><span>Space</span><select name="space_id" required>${options}</select></label><p class="bb-gate-error" data-space-error hidden></p>`;
    const footer = `<span class="bb-gate-note">Resources are only checked after you confirm</span><button class="bb-gate-primary" type="submit">Use this Space</button>`;
    return `<form data-space-form>${panel("bbGateSpaceTitle", head, body, footer)}</form>`;
  },
  workspace(view) {
    const head = `<h1 id="bbGateWorkspaceTitle">${escapeHtml(view.title)}</h1>`;
    const body = view.canProvision ? `<p>${escapeHtml(view.appName)} will create its Folder and Bases in the current Space.</p><p>Submitted as one idempotent Busabase ChangeRequest; nothing existing is deleted or repurposed.</p><p class="bb-gate-error" data-workspace-status hidden></p>` : `<p>${escapeHtml(view.detail)}</p><p>${escapeHtml(view.appName)} never asks you to create Nodes or Bases by hand, and never silently falls back to local data.</p><p class="bb-gate-error" data-workspace-status hidden></p>`;
    const footer = (view.demoHref ? `<a class="bb-gate-link" href="${escapeHtml(view.demoHref)}">Open the read-only demo</a>` : "<span></span>") + (view.canProvision ? `<button class="bb-gate-primary" type="button" data-provision>Initialize workspace</button>` : view.canRetry ? `<button class="bb-gate-primary" type="button" data-retry>Check again</button>` : "");
    return panel("bbGateWorkspaceTitle", head, body, footer);
  }
};
var hostOf = (baseUrl) => {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
};
var DEFAULT_CLOUD_BASE_URL = "https://busabase.com";
function createAirAppConnectGate(options) {
  const {
    appName,
    authBasePath = "",
    onProvision,
    demoHref = null,
    render = defaultAirAppGateRenderer
  } = options;
  const doFetch = options.fetch ?? globalThis.fetch;
  const root = () => {
    if (options.mount) {
      const element2 = typeof options.mount === "string" ? document.querySelector(options.mount) : options.mount;
      if (!element2) throw new Error(`AirApp gate mount not found: ${String(options.mount)}`);
      document.documentElement.classList.add("bb-gate-active");
      return element2;
    }
    let element = document.querySelector("#busabaseAirAppGate");
    if (!element) {
      element = document.createElement("div");
      element.id = "busabaseAirAppGate";
      document.body.prepend(element);
    }
    document.documentElement.classList.add("bb-gate-active");
    return element;
  };
  const close = () => {
    if (options.mount) {
      const element = typeof options.mount === "string" ? document.querySelector(options.mount) : options.mount;
      if (element) element.innerHTML = "";
    } else {
      document.querySelector("#busabaseAirAppGate")?.remove();
    }
    document.documentElement.classList.remove("bb-gate-active");
  };
  const status = async () => {
    try {
      const response = await doFetch(`${authBasePath}/auth/status`, {
        headers: { accept: "application/json" }
      });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("application/json")) return null;
      return await response.json();
    } catch {
      return null;
    }
  };
  const renderConnect = (current) => {
    const element = root();
    const oauthError = new URLSearchParams(window.location.search).get("oauth_error") ?? "";
    element.innerHTML = render.connect({
      appName,
      cloudBaseUrl: current?.cloudBaseUrl || DEFAULT_CLOUD_BASE_URL,
      reconnect: current?.readiness === "needs_auth",
      oauthError,
      authBasePath
    });
    wireConnect(element, current?.cloudBaseUrl || DEFAULT_CLOUD_BASE_URL);
  };
  const renderSpace = (current, onReady) => {
    const element = root();
    element.innerHTML = render.space({
      appName,
      baseUrl: current.baseUrl ?? "",
      spaces: current.spaces ?? []
    });
    wireSpace(element, onReady);
  };
  const wireConnect = (element, cloudBaseUrl) => {
    const form = element.querySelector("[data-connect-form]");
    if (!form) return;
    const customField = form.querySelector("[data-custom-url]");
    const customInput = customField?.querySelector("input") ?? null;
    const hiddenBaseUrl = form.querySelector('input[name="base_url"]');
    for (const radio of form.querySelectorAll('input[name="server_mode"]')) {
      radio.addEventListener("change", () => {
        const custom = radio.value === "custom";
        for (const card of form.querySelectorAll(".bb-gate-server-card")) {
          card.classList.toggle("is-selected", card.querySelector("input")?.checked === true);
        }
        if (customField) customField.hidden = !custom;
        if (customInput) customInput.required = custom;
        if (hiddenBaseUrl) hiddenBaseUrl.value = custom ? customInput?.value ?? "" : cloudBaseUrl;
        if (custom) customInput?.focus();
      });
    }
    customInput?.addEventListener("input", () => {
      if (hiddenBaseUrl) hiddenBaseUrl.value = customInput.value;
    });
  };
  const wireSpace = (element, onReady) => {
    const form = element.querySelector("[data-space-form]");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type=submit]");
      const error = form.querySelector("[data-space-error]");
      if (button) button.disabled = true;
      if (error) error.hidden = true;
      try {
        const response = await doFetch(`${authBasePath}/auth/space`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(new FormData(form))
        });
        const result = await response.json();
        if (!response.ok) {
          if (error) {
            error.textContent = result.error || "Could not select a Space.";
            error.hidden = false;
          }
          if (button) button.disabled = false;
          return;
        }
        onReady();
      } catch {
        if (error) {
          error.textContent = "Could not reach this app's server.";
          error.hidden = false;
        }
        if (button) button.disabled = false;
      }
    });
  };
  const renderSetupRequired = (error, onRetry) => {
    const element = root();
    element.innerHTML = render.workspace({
      ...describeAirAppSetupError(error),
      appName,
      demoHref
    });
    element.querySelector("[data-retry]")?.addEventListener("click", () => onRetry());
    element.querySelector("[data-provision]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const line = element.querySelector("[data-workspace-status]");
      button.disabled = true;
      if (line) {
        line.hidden = false;
        line.textContent = "Submitting the workspace structure\u2026";
      }
      try {
        await onProvision?.();
        onRetry();
      } catch (provisionError) {
        renderSetupRequired(provisionError, onRetry);
      }
    });
  };
  const pass = async ({ onReady } = {}) => {
    if (options.shouldGate && !await options.shouldGate()) {
      close();
      return true;
    }
    const current = await status();
    if (!current) return true;
    const screen = selectAirAppGateScreen(current);
    if (screen === "ready") {
      close();
      return true;
    }
    if (screen === "space") {
      renderSpace(current, () => {
        close();
        onReady?.();
      });
      return false;
    }
    renderConnect(current);
    return false;
  };
  return { pass, renderSetupRequired, close, status };
}
export {
  DEFAULT_CLOUD_BASE_URL,
  createAirAppConnectGate,
  defaultAirAppGateRenderer,
  describeAirAppSetupError,
  escapeHtml,
  selectAirAppGateScreen
};
