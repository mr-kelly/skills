// Kelly App-in-Skill — Style picker (family + register).
//
// Companion to editorial.css: injects the ONE Help & Settings control that
// lets the operator change data-theme (colour family) and, when the app
// opts in, data-editorial (layout register). Mirrors accent-theme.js's own
// mount/observe/localStorage shape deliberately — same DOM-injection
// heuristics (#helpBody, #settingsContent, [data-settings-panel="general"],
// a settings route under #content, section.settings), same i18n pattern, so
// an app moving from accent-theme.js to this file changes one <script> src
// and nothing else about how Settings is wired.
//
// Swatch colours (canvas/ink/accent) are a literal copy of editorial.css's
// own light-mode family values — the same pattern accent-theme.js already
// uses for its 8 swatches (that file's colours are a literal copy of
// scripts/accent-theme.css too, not read from the DOM). A dynamic read was
// tried and discarded: editorial.css's selectors are `html:root[data-theme]`
// specifically, so probing via a throwaway element never matches, and the
// only way to make it match is to flip data-theme on <html> itself — which
// flashes the whole page through all 7 families while reading. A literal
// table plus a regression test that diffs it against editorial.css (see
// tests/editorial-theme.test.mjs) closes the drift risk without the flash.
//
// What this intentionally does NOT do: offer a free accent picker. Per
// ui-workflow-patterns.md's "Style: Family, Register, Accent" — "Most apps
// should skip this entirely. The family already carries an accent chosen
// against its own paper, and a free accent picker on top of a warm family is
// how an app ends up with a blue button on cream."

const FAMILIES = [
  { id: "ink-paper", en: "Ink & Paper", zh: "墨与纸", canvas: "#f9f9f7", ink: "#16181c", accent: "#3a5a93" },
  { id: "rose-ochre", en: "Rose & Ochre", zh: "玫瑰赭金", canvas: "#fbf7f4", ink: "#1e1a18", accent: "#b8546b" },
  { id: "mauve-plum", en: "Mauve & Plum", zh: "藕紫", canvas: "#f8f5f8", ink: "#1c1820", accent: "#7e4a72" },
  { id: "coral-amber", en: "Coral & Amber", zh: "珊瑚琥珀", canvas: "#fff9f5", ink: "#22190f", accent: "#d2503c" },
  { id: "sage-clay", en: "Sage & Clay", zh: "鼠尾草陶土", canvas: "#f7f7f3", ink: "#1b1f1a", accent: "#a85a44" },
  { id: "ink-blush", en: "Ink & Blush", zh: "墨色胭脂", canvas: "#fafaf8", ink: "#121212", accent: "#c2415f" },
  { id: "graphite", en: "Graphite", zh: "石墨", canvas: "#f6f7f8", ink: "#14181f", accent: "#2f6fd0" },
];

const REGISTERS = [
  { id: "desk", en: "Desk", zh: "工作台" },
  { id: "spread", en: "Spread", zh: "跨页" },
  { id: "gallery", en: "Gallery", zh: "图文流" },
];

const LABELS = {
  en: {
    familyTitle: "Appearance",
    familySummary: "Current: {family}.",
    familyAria: "Colour family",
    registerTitle: "Layout",
    registerAria: "Layout register",
  },
  zh: {
    familyTitle: "外观",
    familySummary: "当前：{family}。",
    familyAria: "配色家族",
    registerTitle: "版式",
    registerAria: "版式档位",
  },
};

const STORAGE_FAMILY_KEY = `${appSlug()}.editorialTheme`;
const STORAGE_REGISTER_KEY = `${appSlug()}.editorialRegister`;
const DEFAULT_FAMILY = document.documentElement.dataset.theme || "ink-paper";
const DEFAULT_REGISTER = document.documentElement.dataset.editorial || "desk";

let family = resolveFamily(localStorage.getItem(STORAGE_FAMILY_KEY) || DEFAULT_FAMILY);
let register = resolveRegister(localStorage.getItem(STORAGE_REGISTER_KEY) || DEFAULT_REGISTER);
let scheduled = false;

applyFamily(family);
applyRegister(register);

function appSlug() {
  const label =
    document.title ||
    document.querySelector(".brand-title")?.textContent ||
    document.querySelector("[data-i18n='appTitle']")?.textContent ||
    "kelly-app";
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "kelly-app"
  );
}

function resolveFamily(value) {
  return FAMILIES.some((f) => f.id === value) ? value : "ink-paper";
}

function resolveRegister(value) {
  return REGISTERS.some((r) => r.id === value) ? value : "desk";
}

// The app opts in to a register picker by listing the registers it supports
// on <html data-editorial-registers="desk,spread">. Absent that, the
// register picker never renders — per editorial-visual-system.md, "offer it
// only when more than one register genuinely fits the data."
function availableRegisters() {
  const declared = document.documentElement.dataset.editorialRegisters;
  if (!declared) return [];
  const ids = declared
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return REGISTERS.filter((r) => ids.includes(r.id));
}

function activeLocale() {
  const selector = document.querySelector("#language, #languageSelect");
  const selected = selector?.value;
  if (selected && selected !== "auto") return String(selected).toLowerCase().startsWith("zh") ? "zh" : "en";
  const value = document.documentElement.lang || navigator.language || "en";
  return String(value).toLowerCase().startsWith("zh") ? "zh" : "en";
}

function text(key, replacements = {}) {
  const value = LABELS[activeLocale()]?.[key] || LABELS.en[key] || key;
  return Object.entries(replacements).reduce(
    (copy, [name, replacement]) => copy.replace(`{${name}}`, replacement),
    value,
  );
}

function familyLabel(id = family) {
  const found = FAMILIES.find((f) => f.id === id);
  if (!found) return id;
  return activeLocale() === "zh" ? found.zh : found.en;
}

function registerLabel(id) {
  const found = REGISTERS.find((r) => r.id === id);
  if (!found) return id;
  return activeLocale() === "zh" ? found.zh : found.en;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function applyFamily(value) {
  family = resolveFamily(value);
  if (document.documentElement.dataset.theme !== family) {
    document.documentElement.dataset.theme = family;
  }
  document.querySelectorAll('input[name="editorialFamily"]').forEach((input) => {
    const checked = input.value === family;
    if (input.checked !== checked) input.checked = checked;
  });
  refreshCopy();
}

function applyRegister(value) {
  register = resolveRegister(value);
  if (document.documentElement.dataset.editorial !== register) {
    document.documentElement.dataset.editorial = register;
  }
  document.querySelectorAll('input[name="editorialRegister"]').forEach((input) => {
    const checked = input.value === register;
    if (input.checked !== checked) input.checked = checked;
  });
}

function setFamily(value) {
  family = resolveFamily(value);
  localStorage.setItem(STORAGE_FAMILY_KEY, family);
  applyFamily(family);
}

function setRegister(value) {
  register = resolveRegister(value);
  localStorage.setItem(STORAGE_REGISTER_KEY, register);
  applyRegister(register);
}

function familyMarkup() {
  const options = FAMILIES.map((f) => {
    const checked = f.id === family ? "checked" : "";
    return `
      <label class="style-family-option" style="--swatch-canvas: ${f.canvas}; --swatch-ink: ${f.ink}; --swatch-accent: ${f.accent}">
        <input type="radio" name="editorialFamily" value="${f.id}" ${checked} />
        <span class="style-family-swatch" aria-hidden="true"></span>
        <span>${escapeHtml(familyLabel(f.id))}</span>
      </label>
    `;
  }).join("");

  return `
    <div class="style-settings-group">
      <h3 data-style-family-title>${escapeHtml(text("familyTitle"))}</h3>
      <p data-style-family-summary>${escapeHtml(text("familySummary", { family: familyLabel() }))}</p>
      <div class="style-family-options" role="radiogroup" aria-label="${escapeHtml(text("familyAria"))}">
        ${options}
      </div>
    </div>
  `;
}

function registerMarkup() {
  const available = availableRegisters();
  if (available.length < 2) return "";
  const options = available
    .map((r) => {
      const checked = r.id === register ? "checked" : "";
      return `
      <label class="style-register-option">
        <input type="radio" name="editorialRegister" value="${r.id}" ${checked} />
        <span>${escapeHtml(registerLabel(r.id))}</span>
      </label>
    `;
    })
    .join("");

  return `
    <div class="style-settings-group">
      <h3 data-style-register-title>${escapeHtml(text("registerTitle"))}</h3>
      <div class="style-register-options" role="radiogroup" aria-label="${escapeHtml(text("registerAria"))}">
        ${options}
      </div>
    </div>
  `;
}

function styleMarkup() {
  return `
    <section class="style-settings" data-style-settings>
      ${familyMarkup()}
      ${registerMarkup()}
    </section>
  `;
}

function bindStylePicker(root = document) {
  root.querySelectorAll('input[name="editorialFamily"]').forEach((input) => {
    input.onchange = () => setFamily(input.value);
  });
  root.querySelectorAll('input[name="editorialRegister"]').forEach((input) => {
    input.onchange = () => setRegister(input.value);
  });
}

function refreshCopy() {
  document.querySelectorAll("[data-style-settings]").forEach((section) => {
    const familyTitle = section.querySelector("[data-style-family-title]");
    const familySummary = section.querySelector("[data-style-family-summary]");
    const familyGroup = section.querySelector(".style-family-options");
    const registerTitle = section.querySelector("[data-style-register-title]");
    const registerGroup = section.querySelector(".style-register-options");

    const familyTitleText = text("familyTitle");
    const familySummaryText = text("familySummary", { family: familyLabel() });
    const familyAriaText = text("familyAria");
    if (familyTitle && familyTitle.textContent !== familyTitleText) familyTitle.textContent = familyTitleText;
    if (familySummary && familySummary.textContent !== familySummaryText) familySummary.textContent = familySummaryText;
    if (familyGroup && familyGroup.getAttribute("aria-label") !== familyAriaText)
      familyGroup.setAttribute("aria-label", familyAriaText);

    section.querySelectorAll('input[name="editorialFamily"]').forEach((input) => {
      const checked = input.value === family;
      if (input.checked !== checked) input.checked = checked;
      const label = input.closest(".style-family-option")?.querySelector("span:last-child");
      const labelText = familyLabel(input.value);
      if (label && label.textContent !== labelText) label.textContent = labelText;
    });

    const registerTitleText = text("registerTitle");
    if (registerTitle && registerTitle.textContent !== registerTitleText) registerTitle.textContent = registerTitleText;
    if (registerGroup) registerGroup.setAttribute("aria-label", text("registerAria"));
    section.querySelectorAll('input[name="editorialRegister"]').forEach((input) => {
      const checked = input.value === register;
      if (input.checked !== checked) input.checked = checked;
      const label = input.closest(".style-register-option")?.querySelector("span:last-child");
      const labelText = registerLabel(input.value);
      if (label && label.textContent !== labelText) label.textContent = labelText;
    });
  });
}

function isSettingsRoute() {
  const hash = window.location.hash || "";
  if (/settings|help|config/i.test(hash)) return true;
  if (document.querySelector('[data-route="settings"].active, [data-view="settings"].active, .settings-link.active'))
    return true;
  const heading =
    document.querySelector("#page-title, #pageTitle, .page-title, #settingsTitle, #helpTitle")?.textContent || "";
  return /settings|help|设置|配置/i.test(heading);
}

function mountInto(container, mode = "append") {
  if (!container || container.querySelector("[data-style-settings]")) return false;
  if (mode === "prepend") container.insertAdjacentHTML("afterbegin", styleMarkup());
  else container.insertAdjacentHTML("beforeend", styleMarkup());
  bindStylePicker(container);
  return true;
}

function mountStylePicker() {
  applyFamily(family);
  applyRegister(register);

  const helpBody = document.querySelector("#helpBody");
  if (helpBody) mountInto(helpBody, "prepend");

  const settingsContent = document.querySelector("#settingsContent");
  if (settingsContent) mountInto(settingsContent);

  document
    .querySelectorAll('[data-settings-panel="general"], .settings-panel[data-settings-panel="general"]')
    .forEach((panel) => {
      mountInto(panel);
    });

  const content = document.querySelector("#content");
  if (content && isSettingsRoute()) mountInto(content);

  document.querySelectorAll("section.settings, .settings-dock + .modal-backdrop .modal-body").forEach((container) => {
    mountInto(container);
  });

  refreshCopy();
}

function scheduleMount() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    mountStylePicker();
  });
}

window.addEventListener("DOMContentLoaded", scheduleMount);
window.addEventListener("hashchange", scheduleMount);
window.addEventListener("click", () => setTimeout(scheduleMount, 0), true);
document.addEventListener("change", (event) => {
  if (event.target?.matches?.("#language, #languageSelect")) setTimeout(scheduleMount, 0);
});

new MutationObserver(scheduleMount).observe(document.body, { childList: true, subtree: true });

scheduleMount();
