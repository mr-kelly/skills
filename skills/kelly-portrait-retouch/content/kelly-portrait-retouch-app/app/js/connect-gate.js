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
import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { getProvider } from "./providers/index.js?v=0.1.0";
import { isStandaloneLocalRuntime, shouldUseLocalGateway } from "./runtime.js";

export { isStandaloneLocalRuntime, shouldUseLocalGateway };

const isDemo = () => new URLSearchParams(window.location.search).has("demo");
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const overlayRoot = () => {
  let root = document.querySelector("#connectGate");
  if (!root) {
    root = document.createElement("div");
    root.id = "connectGate";
    document.body.prepend(root);
  }
  document.documentElement.classList.add("ks-setup-active");
  return root;
};

const gate = createAirAppConnectGate({
  appName: "Kelly Portrait Retouch",
  demoHref: "?demo=queue#/queue",
  shouldGate: () => !isDemo() && shouldUseLocalGateway(),
  onProvision: async () => (await getProvider()).provisionResources(),
});

export const passConnectGate = (options) => gate.pass(options);
export const closeConnectGate = () => gate.close();
export const renderSetupRequired = (error, onRetry) => gate.renderSetupRequired(error, onRetry);

export const renderProductOnboarding = (data, onRetry) => {
  const root = overlayRoot();
  const readiness = data?.readiness || {};
  const settings = data?.snapshot?.settings || {};
  const waiting = readiness.action === "review_change_request";
  const changeRequestId = readiness.change_request_id || "pending";
  root.innerHTML = `<div class="ks-setup-overlay"><section class="ks-setup-panel" role="dialog" aria-modal="true" aria-labelledby="ksOnboardingTitle">
    <div class="ks-setup-head"><div><h1 id="ksOnboardingTitle">${waiting ? "Review the configuration request" : "Set portrait defaults"}</h1><p>Runtime resources are ready. Complete product setup before portrait records are shown.</p></div></div>
    <div class="ks-setup-body">
      ${
        waiting
          ? `<p>The onboarding ChangeRequest <strong>${escapeHtml(changeRequestId)}</strong> is waiting for review.</p>`
          : `<form data-onboarding-form>
              <label class="ks-space-select"><span>Default preset</span><select name="default_preset"><option value="natural">Natural</option><option value="fresh">Fresh</option><option value="studio">Studio</option></select></label>
              <label class="ks-space-select"><span>Default strength (0-100)</span><input name="default_strength" type="number" min="0" max="100" step="1" value="${escapeHtml(settings.default_strength ?? 35)}" required></label>
              <h2>Fixed privacy policy</h2>
              <ul><li>Strip image metadata by default</li><li>External upload only after explicit approval</li><li>Never overwrite an original without explicit approval</li></ul>
              <p class="ks-setup-error" data-onboarding-error hidden></p>
            </form>`
      }
    </div>
    <div class="ks-setup-footer ks-setup-footer-split"><a class="ks-text-link" href="?demo=queue#/queue">Open the read-only demo</a><button class="ks-setup-primary" type="button" ${waiting ? "data-onboarding-retry" : "data-onboarding-save"}>${waiting ? "Check again" : "Submit configuration"}</button></div>
  </section></div>`;
  root
    .querySelector("select[name=default_preset]")
    ?.querySelector(`option[value="${settings.default_preset || "natural"}"]`)
    ?.setAttribute("selected", "");
  root.querySelector("[data-onboarding-retry]")?.addEventListener("click", onRetry);
  root.querySelector("[data-onboarding-save]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const form = root.querySelector("[data-onboarding-form]");
    const error = root.querySelector("[data-onboarding-error]");
    if (!form.reportValidity()) return;
    button.disabled = true;
    error.hidden = true;
    try {
      const provider = await getProvider();
      await provider.saveOnboarding(Object.fromEntries(new FormData(form)));
      await onRetry();
    } catch (saveError) {
      error.textContent = saveError instanceof Error ? saveError.message : String(saveError);
      error.hidden = false;
      button.disabled = false;
    }
  });
};
