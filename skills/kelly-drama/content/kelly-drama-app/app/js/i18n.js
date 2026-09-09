import { MESSAGES, resolveLang } from "../i18n/messages.js";
import { store } from "./store.js";

export function lang() {
  return resolveLang(store.langPref);
}

export function t(key) {
  const l = lang();
  return MESSAGES[l]?.[key] || MESSAGES.zh[key] || key;
}

const VALUE_KEYS = {
  supporting: "value_role_supporting",
  "co-protagonist": "value_role_co_protagonist",
  protagonist: "value_role_protagonist",
  helper: "value_role_helper",
  antagonist: "value_role_antagonist",
  "supporting continuity card": "value_supporting_continuity_card",
  "fictional dependency / power romance": "value_fictional_power_romance",
  "clear female assistant": "value_voice_clear_female_assistant",
  efficient: "value_voice_efficient",
  "neutral mandarin": "value_voice_neutral_mandarin",
  "sworn brother / explosive force": "value_role_sworn_explosive",
  "sworn brother / martial pillar": "value_role_sworn_martial",
  "protagonist / rising lord": "value_role_rising_lord",
  "9:16 serialized psychological drama; 8 episodes, 3 continuous generated-video shots per episode.":
    "value_visual_serialized_psychological",
  "semi-realistic cinematic illustration, fictionalized characters, stable approved turnarounds.":
    "value_visual_semi_realistic",
  "vertical 9:16 serialized psychological drama. each episode is a continuous three-shot movement, not a generic montage.":
    "value_visual_continuous_three_shot",
  "semi-realistic cinematic illustration, fictionalized public-cue characters, consistent approved turnarounds.":
    "value_visual_public_cue",
  character: "value_kind_character",
  relationship: "value_kind_relationship",
  episode: "value_kind_episode",
  shot: "value_kind_shot",
  export: "value_kind_export",
};

export function localizeValue(value) {
  const raw = String(value ?? "");
  const key = VALUE_KEYS[raw.trim().toLowerCase()];
  return key ? t(key) : raw;
}

export function canonicalValue(value) {
  const raw = String(value ?? "");
  for (const [canonical, key] of Object.entries(VALUE_KEYS)) {
    if (raw === MESSAGES.zh[key] || raw === MESSAGES.en[key]) return canonical;
  }
  return raw;
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
