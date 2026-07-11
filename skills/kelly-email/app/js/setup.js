import { api, toast } from "./api.js";
import { escapeHtml } from "./format.js";
import { t } from "./i18n.js";
import {
  connectionStatusText,
  localizedOnboardingMessage,
  providerModeLabel,
  providerStatus,
  setupNeeded,
  setupState,
} from "./provider.js";
import { $, store } from "./store.js";

// applyProviderGate/autosaveBusabaseConfig call refresh() (list-detail.js),
// which in turn calls applyLockState() (shell.js) -> applyProviderGate() —
// a real cycle. main.js registers the live refresh() once every module is
// loaded, same pattern as router.js's hooks.
const hooks = { refresh: async () => {} };
export function registerSetupHooks(overrides) {
  Object.assign(hooks, overrides);
}

export function setupPrompt() {
  const setup = setupState();
  const status = providerStatus();
  const connection = status.connection || {};
  const provider = setup.provider || status.provider || "local";
  if (!setup.provider_selected) {
    return t("setup.prompt.choose");
  }
  if (provider === "busabase") {
    return t("setup.prompt.busabase", {
      config: setup.recommended_config || "busabase:drive/config/config.json",
      vault: setup.recommended_env || "busabase:vault/kelly-email",
      baseUrl: status.base_url || connection.base_url || "http://127.0.0.1:15419",
      baseId: status.base_id || connection.base_id || "kelly-email",
      apiKeyEnv: connection.api_key === "configured" ? "KELLY_EMAIL_BUSABASE_API_KEY (configured)" : "none",
    });
  }
  return t("setup.prompt.local", {
    config: setup.recommended_config || "~/.config/kelly-email/config.json",
    env: setup.recommended_env || "~/.config/kelly-email/.env",
  });
}

export function setupChecklistHtml() {
  const setup = setupState();
  const status = providerStatus();
  const connection = status.connection || {};
  const onboarding = store.state.email_accounts?.onboarding || {};
  const providerSelected = Boolean(setup.provider_selected);
  const busabaseSelected = providerSelected && status.provider === "busabase";
  const missingSecrets = setup.missing_env || [];
  const secretsReady = Boolean(onboarding.configured && missingSecrets.length === 0);
  const providerFirst = t("setup.choose_first");
  const localStorageLabel = t("setup.local_storage");
  const rows = [
    [t("setup.check.provider"), providerSelected, providerModeLabel(status)],
    [
      t("setup.check.connection"),
      providerSelected && status.ok !== false,
      providerSelected ? connectionStatusText(status) : providerFirst,
    ],
    [
      t("setup.check.folder"),
      busabaseSelected ? Boolean(connection.folder_exists) : providerSelected,
      busabaseSelected ? status.folder_slug || "" : providerSelected ? localStorageLabel : providerFirst,
    ],
    [
      t("setup.check.base"),
      busabaseSelected ? Boolean(connection.base_exists) : providerSelected,
      busabaseSelected ? status.base_id || "" : providerSelected ? localStorageLabel : providerFirst,
    ],
    [
      t("setup.check.contacts"),
      busabaseSelected ? Boolean(connection.contacts_base_exists) : providerSelected,
      busabaseSelected ? status.contacts_base_id || "" : providerSelected ? localStorageLabel : providerFirst,
    ],
    [
      t("setup.check.drive"),
      busabaseSelected ? Boolean(connection.drive_exists) : providerSelected,
      busabaseSelected ? status.drive_slug || "" : providerSelected ? localStorageLabel : providerFirst,
    ],
    [t("setup.check.config"), Boolean(onboarding.configured), setup.recommended_config || ""],
    [
      t("setup.check.secrets"),
      secretsReady,
      missingSecrets.length ? missingSecrets.join(", ") : setup.recommended_env || "",
    ],
  ];
  return rows
    .map(([label, ok, detail]) => {
      const stateClass = ok ? "ok" : "warn";
      const stateText = ok ? t("setup.ready") : t("setup.todo");
      return `
        <div class="setup-check">
          <span class="env-pill ${stateClass}">${escapeHtml(stateText)}</span>
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(detail || "")}</small>
        </div>
      `;
    })
    .join("");
}

export async function chooseProvider(provider) {
  store.forceChooseStep = false;
  if (provider !== "busabase") store.busabaseFormVisible = false;
  try {
    await api("/api/setup/provider", { provider });
    toast(t("setup.provider_saved", { provider }));
    await hooks.refresh({ preserveScroll: false });
  } catch (error) {
    toast(error.message);
  }
}

// The card the user clicks only sets a pending choice — it does not save or
// navigate. Next is what confirms it, so choosing a provider is a deliberate
// two-step action instead of a click that immediately commits.
export function selectProviderDraft(provider) {
  store.chooseStepDraft = provider;
  applyProviderGate();
}

function pendingProviderChoice() {
  if (store.chooseStepDraft) return store.chooseStepDraft;
  const setup = setupState();
  const status = providerStatus();
  return setup.provider_selected ? setup.provider || status.provider || "local" : "";
}

export async function confirmProviderChoice() {
  const choice = pendingProviderChoice();
  if (!choice) return;
  store.chooseStepDraft = null;
  if (choice === "busabase") {
    goToBusabaseStep();
  } else {
    await chooseProvider("local");
  }
}

export function goToBusabaseStep() {
  store.forceChooseStep = false;
  store.busabaseFormVisible = true;
  applyProviderGate();
}

export function backFromBusabaseStep() {
  store.busabaseFormVisible = false;
  // Keep Busabase highlighted with Next enabled — the user picked it on
  // purpose; losing that on Back would make them re-click the card for no
  // reason when nothing about their choice changed.
  store.chooseStepDraft = "busabase";
  applyProviderGate();
}

const BUSABASE_HOSTING_DEFAULT_BASE_URL = { cloud: "https://busabase.com", self_hosted: "http://127.0.0.1:15419" };

export function busabaseHosting() {
  return document.querySelector("[data-busabase-hosting]:checked")?.value === "cloud" ? "cloud" : "self_hosted";
}

export function updateBusabaseFormVisibility() {
  const hosting = busabaseHosting();
  const isCloud = hosting === "cloud";
  $("busabaseSpaceIdRow")?.classList.toggle("is-hidden", !isCloud);
  $("busabaseApiKeyRow")?.classList.toggle("is-hidden", !isCloud);
  const baseUrlInput = $("busabaseBaseUrlInput");
  if (baseUrlInput && document.activeElement !== baseUrlInput) {
    const current = baseUrlInput.value.trim();
    const otherDefault = BUSABASE_HOSTING_DEFAULT_BASE_URL[isCloud ? "self_hosted" : "cloud"];
    // Only swap in the new mode's default if the field is empty or still
    // holds the other mode's default — never clobber a value the user typed.
    if (!current || current === otherDefault) baseUrlInput.value = BUSABASE_HOSTING_DEFAULT_BASE_URL[hosting];
  }
}

export function fillBusabaseForm() {
  const status = providerStatus();
  const hosting = status.hosting === "cloud" ? "cloud" : "self_hosted";
  const hostingInput = document.querySelector(`[data-busabase-hosting][value="${hosting}"]`);
  if (hostingInput && document.activeElement?.name !== "busabaseHosting") hostingInput.checked = true;
  const baseUrlInput = $("busabaseBaseUrlInput");
  if (baseUrlInput && document.activeElement !== baseUrlInput) {
    baseUrlInput.value = status.base_url || baseUrlInput.value || "";
  }
  const spaceIdInput = $("busabaseSpaceIdInput");
  if (spaceIdInput && document.activeElement !== spaceIdInput) {
    spaceIdInput.value = status.space_id || spaceIdInput.value || "";
  }
  const apiKeyConfigured = status.connection?.api_key === "configured";
  const apiPill = $("busabaseApiKeyPill");
  if (apiPill) {
    apiPill.classList.toggle("ok", apiKeyConfigured);
    apiPill.classList.toggle("warn", !apiKeyConfigured);
    apiPill.textContent = apiKeyConfigured ? t("setup.ready") : t("setup.todo");
  }
  const apiHint = $("busabaseApiKeyHint");
  if (apiHint) apiHint.textContent = t("setup.busabase.api_key_hint", { env: "KELLY_EMAIL_BUSABASE_API_KEY" });
  updateBusabaseFormVisibility();
}

function setBusabaseAutosaveStatus(text, kind) {
  const status = $("busabaseAutosaveStatus");
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("is-saved", kind === "saved");
  status.classList.toggle("is-error", kind === "error");
}

export function scheduleBusabaseAutosave() {
  clearTimeout(store.busabaseAutosaveTimer);
  setBusabaseAutosaveStatus("", "");
  store.busabaseAutosaveTimer = setTimeout(() => autosaveBusabaseConfig(), 700);
}

// Debounced: fires ~700ms after the user stops typing in any field, and
// immediately on a hosting-mode change. No manual "Save" button — matches
// the rest of the app's auto-refresh/autosave feel instead of a form submit.
export async function autosaveBusabaseConfig() {
  const hosting = busabaseHosting();
  const baseUrl = ($("busabaseBaseUrlInput")?.value || "").trim();
  const spaceId = ($("busabaseSpaceIdInput")?.value || "").trim();
  if (!baseUrl) {
    setBusabaseAutosaveStatus(t("setup.busabase.base_url_required"), "error");
    return false;
  }
  if (hosting === "cloud" && !spaceId) {
    setBusabaseAutosaveStatus(t("setup.busabase.space_id_required"), "error");
    return false;
  }
  const token = ++store.busabaseAutosaveToken;
  setBusabaseAutosaveStatus(t("setup.busabase.autosave_saving"), "");
  try {
    await api("/api/setup/provider", {
      provider: "busabase",
      hosting,
      base_url: baseUrl,
      space_id: spaceId,
    });
    if (token !== store.busabaseAutosaveToken) return true;
    setBusabaseAutosaveStatus(t("setup.busabase.autosave_saved"), "saved");
    await hooks.refresh({ preserveScroll: false });
    return true;
  } catch (error) {
    if (token !== store.busabaseAutosaveToken) return false;
    setBusabaseAutosaveStatus(error.message || t("setup.busabase.autosave_error"), "error");
    return false;
  }
}

export async function continueFromBusabaseStep() {
  clearTimeout(store.busabaseAutosaveTimer);
  const ok = await autosaveBusabaseConfig();
  if (!ok) return;
  store.busabaseFormVisible = false;
  applyProviderGate();
}

export async function copySetupPrompt() {
  const text = setupPrompt();
  await navigator.clipboard.writeText(text);
  toast(t("setup.prompt_copied"));
}

// One step visible at a time, wizard-style, instead of every control on one
// long scrolling screen: choose a provider -> (Busabase only) connect ->
// ready. Deliberately derived from existing signals rather than its own
// persisted field: busabaseFormVisible means "the user is actively looking
// at the connection step"; forceChooseStep lets a user back out to the
// provider choice even after one is already saved.
export function setupStep() {
  if (store.busabaseFormVisible) return "configure_busabase";
  if (store.forceChooseStep) return "choose_provider";
  return setupState().provider_selected ? "ready" : "choose_provider";
}

export function returnToChooseStep() {
  store.forceChooseStep = true;
  applyProviderGate();
}

export function applyProviderGate() {
  const unavailable = setupNeeded();
  const gate = $("providerGate");
  if (!gate) return;
  const status = providerStatus();
  const setup = setupState();
  gate.classList.toggle("is-hidden", !unavailable);
  gate.setAttribute("aria-hidden", String(!unavailable));

  const step = setupStep();
  $("setupStepChoose")?.classList.toggle("is-hidden", step !== "choose_provider");
  $("setupStepBusabase")?.classList.toggle("is-hidden", step !== "configure_busabase");
  $("setupStepReady")?.classList.toggle("is-hidden", step !== "ready");
  $("setupActionsReady")?.classList.toggle("is-hidden", step !== "ready");
  if (step !== store.lastSetupStep) {
    store.lastSetupStep = step;
    // Otherwise a leftover scroll position from a longer step can leave the
    // next (shorter) step looking blank until the user manually scrolls up.
    $("providerGateBody")?.scrollTo(0, 0);
  }

  const message = $("providerGateMessage");
  if (message) message.textContent = t("setup.choose_provider");

  const activeProvider = setup.provider || status.provider || "local";

  if (step === "configure_busabase") fillBusabaseForm();

  if (step === "ready") {
    const messageReady = $("providerGateMessageReady");
    if (messageReady) messageReady.textContent = localizedOnboardingMessage(status);
    const gateMode = $("providerGateMode");
    if (gateMode) gateMode.textContent = providerModeLabel(status);
    const showBusabaseMeta = activeProvider === "busabase";
    for (const id of [
      "providerGateBaseUrlLabel",
      "providerGateBaseUrl",
      "providerGateBaseIdLabel",
      "providerGateBaseId",
    ]) {
      $(id)?.classList.toggle("is-hidden", !showBusabaseMeta);
    }
    const baseUrl = $("providerGateBaseUrl");
    if (baseUrl) baseUrl.textContent = status.base_url || t("settings.not_configured");
    const baseId = $("providerGateBaseId");
    if (baseId) baseId.textContent = status.base_id || t("settings.not_configured");
    const action = $("providerGateAction");
    if (action) action.textContent = status.action || t("setup.next_action");
    const checklist = $("setupChecklist");
    if (checklist) checklist.innerHTML = setupChecklistHtml();
    const prompt = $("setupPromptText");
    if (prompt) prompt.textContent = setupPrompt();
    const promptTitle = $("setupPromptTitle");
    if (promptTitle) promptTitle.textContent = t("setup.prompt_title.provider", { provider: activeProvider });
    const reconfigure = $("busabaseReconfigureButton");
    if (reconfigure) reconfigure.classList.toggle("is-hidden", activeProvider !== "busabase");
  }

  const localButton = $("setupChooseLocal");
  const busabaseButton = $("setupChooseBusabase");
  const currentChoice = step === "configure_busabase" ? "busabase" : pendingProviderChoice();
  for (const button of [localButton, busabaseButton]) {
    if (!button) continue;
    button.classList.toggle("active", button.dataset.providerChoice === currentChoice);
    button.disabled = Boolean(setup.provider_env_locked);
  }
  const nextButton = $("setupChooseNextButton");
  if (nextButton) nextButton.disabled = !pendingProviderChoice() || Boolean(setup.provider_env_locked);
  const busabaseForm = $("busabaseConfigForm");
  if (busabaseForm) {
    busabaseForm.querySelectorAll("input, button").forEach((node) => {
      node.disabled = Boolean(setup.provider_env_locked);
    });
  }
}
