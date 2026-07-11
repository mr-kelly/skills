import { api, toast } from "./api.js";
import { escapeHtml } from "./format.js";
import { applyI18n, t } from "./i18n.js";
import { render } from "./render.js";
import { $, LANG_STORAGE_KEY, project, store } from "./store.js";

function imageConfigPanel() {
  const config = store.imageConfig || {};
  const keyPlaceholder = config.has_api_key
    ? t("image_config_key_configured").replace("{preview}", config.api_key_preview)
    : t("image_config_key_placeholder");
  return `
    <form class="image-config" data-image-config>
      <div class="field">
        <label for="imageBaseUrl">BASE_URL</label>
        <input id="imageBaseUrl" name="base_url" value="${escapeHtml(config.base_url || "https://moonrouter.dev/v1")}" />
      </div>
      <div class="field">
        <label for="imageApiKey">API Key</label>
        <input id="imageApiKey" name="api_key" type="password" placeholder="${escapeHtml(keyPlaceholder)}" value="" />
      </div>
      <div class="field">
        <label for="imageModel">${t("image_config_model")}</label>
        <input id="imageModel" name="model" value="${escapeHtml(config.model || "gpt-image-2")}" />
      </div>
      <div class="field">
        <label for="imageSize">${t("image_config_size")}</label>
        <select id="imageSize" name="size">
          ${["1024x1024", "1536x1024", "1024x1536"].map((size) => `<option value="${size}" ${size === (config.size || "1024x1024") ? "selected" : ""}>${size}</option>`).join("")}
        </select>
      </div>
      <button type="submit">${t("image_config_save")}</button>
    </form>`;
}

function value(form, name) {
  return form.elements[name]?.value ?? "";
}

function bindImageConfigForm() {
  const imageConfigForm = document.querySelector("[data-image-config]");
  if (!imageConfigForm) return;
  imageConfigForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const keepKey = !value(imageConfigForm, "api_key");
    store.imageConfig = await api("/api/image-config", {
      base_url: value(imageConfigForm, "base_url"),
      api_key: keepKey ? "__KEEP__" : value(imageConfigForm, "api_key"),
      model: value(imageConfigForm, "model"),
      size: value(imageConfigForm, "size"),
    });
    toast(t("image_config_saved"));
    openSettings();
  });
}

function bindLangSelect() {
  const langSel = document.getElementById("languageSelect");
  if (!langSel) return;
  langSel.value = store.langPref;
  langSel.addEventListener("change", (e) => {
    store.langPref = e.target.value;
    localStorage.setItem(LANG_STORAGE_KEY, store.langPref);
    render();
    openSettings();
  });
}

export function setSettingsTab(name) {
  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsTab === name);
  });
  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.settingsPanel === name);
  });
}

export function openSettings() {
  const modal = $("settingsModal");
  const titleSuffix = project().series?.title ? `《${project().series.title}》 · ` : "";
  $("settingsSubtitle").textContent = titleSuffix + t("settings_title_default");
  $("imageSettingsMount").innerHTML = imageConfigPanel();
  bindImageConfigForm();
  bindLangSelect();
  setSettingsTab("image");
  applyI18n();
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

export function closeSettings() {
  const modal = $("settingsModal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}
