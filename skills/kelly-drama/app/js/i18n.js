import { MESSAGES, resolveLang } from "/i18n/messages.js";
import { store } from "./store.js";

export function lang() {
  return resolveLang(store.langPref);
}

export function t(key) {
  const l = lang();
  return MESSAGES[l]?.[key] || MESSAGES.zh[key] || key;
}

export function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  document.documentElement.lang = lang() === "en" ? "en" : "zh-CN";
  const langSel = document.getElementById("languageSelect");
  if (langSel) {
    langSel.value = store.langPref;
    langSel.querySelectorAll("[data-i18n]").forEach((opt) => {
      opt.textContent = t(opt.dataset.i18n);
    });
  }
}
