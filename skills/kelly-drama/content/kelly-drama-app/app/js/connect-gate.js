// Connection UX Contract gate — now `busabase-sdk/airapp-gate`, configured.
//
// The three screens (connect / choose a Space / initialize the workspace), the
// state machine behind them, and their stylesheet used to be duplicated in
// this app. All of that is the SDK's now; what remains here is the part that
// is genuinely this app's own: its name, whether this run owes a gate at all,
// and what "initialize" does.
//
// `shouldGate` is passed explicitly rather than letting the SDK infer it from a
// status probe: where this app runs is a fact its host states
// (BUSABASE_AIRAPP_RUNTIME, surfaced by ./runtime.js), never something to guess
// from the hostname. `shouldUseLocalGateway` drives the connect gate;
// `isStandaloneLocalRuntime` drives whether writes may merge. They differ only
// when the runtime is undetermined, where each falls to its own safe side.
import { createAirAppConnectGate, escapeHtml } from "../vendor/busabase-airapp-gate.js";
import { t } from "./i18n.js";
import { getProvider } from "./providers/index.js?v=0.1.0";
import { isStandaloneLocalRuntime, shouldUseLocalGateway } from "./runtime.js";

export { isStandaloneLocalRuntime, shouldUseLocalGateway };

const isDemo = () => new URLSearchParams(window.location.search).has("demo");

const replace = (key, values = {}) =>
  Object.entries(values).reduce((copy, [name, value]) => copy.replace(`{${name}}`, value), t(key));
const hostOf = (baseUrl) => {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
};
const panel = (labelledBy, head, body, footer) =>
  `<div class="bb-gate-overlay"><section class="bb-gate-panel" role="dialog" aria-modal="true" aria-labelledby="${labelledBy}"><div class="bb-gate-head"><div>${head}</div></div><div class="bb-gate-body">${body}</div><div class="bb-gate-footer">${footer}</div></section></div>`;
const gateRenderer = {
  connect(view) {
    const head = `<h1 id="bbGateConnectTitle">${t("gate_connect_title")}</h1><p>${escapeHtml(replace("gate_connect_body", { app: view.appName }))}</p>`;
    const body = [
      view.oauthError ? `<p class="bb-gate-error" role="alert">${escapeHtml(view.oauthError)}</p>` : "",
      view.reconnect ? `<p class="bb-gate-note">${t("gate_session_expired")}</p>` : "",
      `<h2>${t("gate_server")}</h2><div class="bb-gate-server-grid"><label class="bb-gate-server-card is-selected"><input type="radio" name="server_mode" value="cloud" checked><span><strong>${t("gate_cloud")}</strong><span>${escapeHtml(hostOf(view.cloudBaseUrl))}</span></span></label><label class="bb-gate-server-card"><input type="radio" name="server_mode" value="custom"><span><strong>${t("gate_custom_server")}</strong><span>${t("gate_custom_server_desc")}</span></span></label></div><label class="bb-gate-custom-url" data-custom-url hidden><span>${t("gate_url")}</span><input type="url" name="custom_base_url" inputmode="url" placeholder="https://busabase.example.com" autocomplete="url"></label><input type="hidden" name="base_url" value="${escapeHtml(view.cloudBaseUrl)}">`,
    ].join("");
    return `<form method="post" action="${escapeHtml(`${view.authBasePath}/auth/start`)}" data-connect-form>${panel("bbGateConnectTitle", head, body, `<span class="bb-gate-note">${t("gate_oauth_note")}</span><button class="bb-gate-primary" type="submit">${t("gate_connect_button")}</button>`)}</form>`;
  },
  space(view) {
    const options = view.spaces
      .map(
        (space) =>
          `<option value="${escapeHtml(space.id)}">${escapeHtml(space.name)} · ${escapeHtml(space.id)}</option>`,
      )
      .join("");
    const head = `<h1 id="bbGateSpaceTitle">${t("gate_space_title")}</h1><p>${replace("gate_space_body", { url: `<strong>${escapeHtml(view.baseUrl)}</strong>`, app: escapeHtml(view.appName) })}</p>`;
    const body = `<label class="bb-gate-space-select"><span>${t("gate_space_label")}</span><select name="space_id" required>${options}</select></label><p class="bb-gate-error" data-space-error hidden></p>`;
    return `<form data-space-form>${panel("bbGateSpaceTitle", head, body, `<span class="bb-gate-note">${t("gate_resources_note")}</span><button class="bb-gate-primary" type="submit">${t("gate_use_space")}</button>`)}</form>`;
  },
  workspace(view) {
    const title = view.canProvision
      ? t("gate_workspace_initialize")
      : view.canRetry
        ? t("gate_workspace_waiting")
        : t("gate_workspace_not_ready");
    const head = `<h1 id="bbGateWorkspaceTitle">${title}</h1>`;
    const body = view.canProvision
      ? `<p>${escapeHtml(replace("gate_workspace_create", { app: view.appName }))}</p><p>${t("gate_workspace_change_request")}</p><p class="bb-gate-error" data-workspace-status hidden></p>`
      : `<p>${escapeHtml(view.detail)}</p><p>${escapeHtml(replace("gate_workspace_no_manual", { app: view.appName }))}</p><p class="bb-gate-error" data-workspace-status hidden></p>`;
    const footer = [
      view.demoHref
        ? `<a class="bb-gate-link" href="${escapeHtml(view.demoHref)}">${t("gate_open_demo")}</a>`
        : "<span></span>",
      view.canProvision
        ? `<button class="bb-gate-primary" type="button" data-provision>${t("gate_initialize_button")}</button>`
        : view.canRetry
          ? `<button class="bb-gate-primary" type="button" data-retry>${t("gate_retry_button")}</button>`
          : "",
    ].join("");
    return panel("bbGateWorkspaceTitle", head, body, footer);
  },
};

const gate = createAirAppConnectGate({
  appName: "Kelly Drama",
  demoHref: "?demo=1#/overview",
  shouldGate: () => !isDemo() && shouldUseLocalGateway(),
  onProvision: async () => (await getProvider()).provisionResources(),
  render: gateRenderer,
  messages: {
    selectSpaceFailed: t("gate_select_space_failed"),
    serverUnreachable: t("gate_server_unreachable"),
    submittingWorkspace: t("gate_submitting"),
  },
});

export const passConnectGate = (options) => gate.pass(options);
export const closeConnectGate = () => gate.close();
export const renderSetupRequired = (error, onRetry) => gate.renderSetupRequired(error, onRetry);
