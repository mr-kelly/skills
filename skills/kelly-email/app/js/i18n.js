import { I18N } from "../i18n/messages.js";
import { toast } from "./api.js";
import { escapeHtml } from "./format.js";
import { ACCENT_THEME_STORAGE_KEY, ACCENT_THEMES, LANGUAGE_OPTIONS, LANGUAGE_STORAGE_KEY, resolveAccentTheme, store, $ } from "./store.js";

// applyLockState/applyProviderGate/renderCounts/renderList/renderDetail all
// live in modules that import from here (i18n applies to their markup), so
// setLanguageMode reaches them lazily to avoid a hard circular import at the
// top level. See main.js, which wires the real functions in after every
// module has finished loading.
const rerenderHooks = { onLanguageChange: () => {} };
export function onLanguageChange(fn) {
  rerenderHooks.onLanguageChange = fn;
}

export function template(value, params = {}) {
  return String(value || "").replace(/\{(\w+)\}/g, (_, key) => params[key] ?? "");
}

export function t(key, params = {}) {
  return template(I18N[store.uiLanguage]?.[key] || I18N.en[key] || key, params);
}

export function optionalT(key) {
  return I18N[store.uiLanguage]?.[key] || I18N.en[key] || "";
}

function browserLanguage() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  return languages.some((lang) => String(lang).toLowerCase().startsWith("zh")) ? "zh-CN" : "en";
}

function resolveLanguage() {
  if (!["auto", "en", "zh-CN"].includes(store.languageMode)) store.languageMode = "auto";
  return store.languageMode === "auto" ? browserLanguage() : store.languageMode;
}

function languageSwitcherHtml(container) {
  const name = container.dataset.languageName || "uiLanguage";
  const title =
    container.dataset.languageTitle === "true"
      ? `<span data-language-title-label>${escapeHtml(t("language.title"))}</span>`
      : "";
  const options = LANGUAGE_OPTIONS.map(
    (option) => `
      <label data-ui-language-option>
        <input
          type="radio"
          name="${escapeHtml(name)}"
          value="${escapeHtml(option.value)}"
          data-ui-language
          ${option.value === store.languageMode ? "checked" : ""}
        />
        <span data-language-label-key="${escapeHtml(option.labelKey)}">${escapeHtml(t(option.labelKey))}</span>
      </label>
    `,
  ).join("");
  return `${title}${options}`;
}

export function renderLanguageSwitchers() {
  document.querySelectorAll("[data-language-switcher]").forEach((container) => {
    if (container.dataset.languageSwitcherReady !== "true") {
      container.innerHTML = languageSwitcherHtml(container);
      container.dataset.languageSwitcherReady = "true";
    }
    container.querySelectorAll("[data-ui-language]").forEach((input) => {
      input.checked = input.value === store.languageMode;
    });
    const title = container.querySelector("[data-language-title-label]");
    if (title) title.textContent = t("language.title");
    container.querySelectorAll("[data-language-label-key]").forEach((label) => {
      label.textContent = t(label.dataset.languageLabelKey);
    });
  });
}

export function renderLanguageSummary() {
  const node = $("languageSummary");
  if (!node) return;
  const current = t(`language.current.${store.uiLanguage}`);
  node.textContent =
    store.languageMode === "auto"
      ? t("language.summary.auto", { language: current })
      : t("language.summary.fixed", { language: current });
}

export function setLanguageMode(value) {
  const nextMode = ["auto", "en", "zh-CN"].includes(value) ? value : "auto";
  if (nextMode === store.languageMode) {
    renderLanguageSwitchers();
    return;
  }
  store.languageMode = nextMode;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, store.languageMode);
  applyTranslations();
  rerenderHooks.onLanguageChange();
  toast(t("language.saved"));
}

export function accentThemeLabel(id = store.accentTheme) {
  return t(`theme.${resolveAccentTheme(id)}`);
}

export function renderThemeSummary() {
  const node = $("themeSummary");
  if (!node) return;
  node.textContent = t("theme.summary", { theme: accentThemeLabel() });
}

export function renderThemeOptions() {
  const node = $("themeOptions");
  if (!node) return;
  node.innerHTML = ACCENT_THEMES.map(
    (theme) => `
      <label class="theme-option" style="--swatch: ${theme.color}; --swatch-check: ${theme.check || "#ffffff"}">
        <input type="radio" name="accentTheme" value="${theme.id}" ${theme.id === store.accentTheme ? "checked" : ""} />
        <span class="theme-swatch" aria-hidden="true"></span>
        <span>${escapeHtml(accentThemeLabel(theme.id))}</span>
      </label>
    `,
  ).join("");
  node.querySelectorAll('input[name="accentTheme"]').forEach((input) => {
    input.onchange = () => setAccentTheme(input.value);
  });
}

export function applyAccentTheme() {
  store.accentTheme = resolveAccentTheme(store.accentTheme);
  document.documentElement.dataset.accentTheme = store.accentTheme;
  document.querySelectorAll('input[name="accentTheme"]').forEach((input) => {
    input.checked = input.value === store.accentTheme;
  });
  renderThemeSummary();
}

export function setAccentTheme(value) {
  store.accentTheme = resolveAccentTheme(value);
  localStorage.setItem(ACCENT_THEME_STORAGE_KEY, store.accentTheme);
  applyAccentTheme();
  toast(t("theme.saved", { theme: accentThemeLabel() }));
}

export function applyTranslations() {
  store.uiLanguage = resolveLanguage();
  document.documentElement.lang = store.uiLanguage === "zh-CN" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("option[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-tooltip]").forEach((node) => {
    const text = t(node.dataset.i18nTooltip);
    node.dataset.tooltip = text;
    node.title = text;
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  renderLanguageSwitchers();
  renderThemeOptions();
  renderLanguageSummary();
  applyAccentTheme();
}
