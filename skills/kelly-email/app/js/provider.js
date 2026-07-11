import { t } from "./i18n.js";
import { store } from "./store.js";

export function providerStatus() {
  const status = store.state.provider_status || {};
  const provider =
    status.provider || store.state.email_accounts?.data_provider || store.state.email_accounts?.data_reader || "local";
  return {
    ...status,
    provider,
    mode: status.mode || provider,
  };
}

export function providerReady() {
  return providerStatus().ok !== false;
}

export function onboardingReady() {
  return store.state.email_accounts?.onboarding?.configured !== false;
}

export function setupNeeded() {
  return !providerReady() || !onboardingReady();
}

export function providerModeLabel(status = providerStatus()) {
  const provider = status.provider || "local";
  const mode = status.mode || provider;
  return provider === mode ? provider : `${provider} / ${mode}`;
}

export function providerStatusText(status = providerStatus()) {
  if (status.ok === false) return status.message || t("provider.not_ready_message");
  return status.message || t("provider.ready_message");
}

const ONBOARDING_STATE_KEYS = {
  needs_config: "setup.state.needs_config",
  missing_secrets: "setup.state.missing_secrets",
  ready: "setup.state.ready",
};

// Prefer a translated string for known onboarding states; connection failures
// (provider.ok === false) can carry a live, non-enumerable error detail, so
// those still fall back to the raw backend message via providerStatusText.
export function localizedOnboardingMessage(status = providerStatus()) {
  if (status.ok === false) return providerStatusText(status);
  const onboarding = store.state.email_accounts?.onboarding || {};
  const key = ONBOARDING_STATE_KEYS[onboarding.state];
  return key ? t(key) : onboarding.message || providerStatusText(status);
}

// Same idea for the checklist's "storage connection" row: enumerable ready
// states get a translated string, live connection errors keep the raw message.
export function connectionStatusText(status = providerStatus()) {
  if (status.ok === false) return status.message || t("provider.not_ready_message");
  if (status.provider === "local") return t("setup.local_storage");
  if (status.provider === "busabase") return t("setup.busabase.connected");
  return status.message || t("provider.ready_message");
}

export function setupState() {
  return store.state.setup || {};
}
