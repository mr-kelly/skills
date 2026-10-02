const ACCENT_THEMES = [
  { id: "blue", color: "#0a84ff" },
  { id: "purple", color: "#bf5af2" },
  { id: "pink", color: "#ff2d55" },
  { id: "red", color: "#ff3b30" },
  { id: "orange", color: "#ff9500" },
  { id: "yellow", color: "#ffcc00", check: "#1d1d1f" },
  { id: "green", color: "#30d158" },
  { id: "graphite", color: "#6e6e73" },
];

const LABELS = {
  en: {
    title: "Accent Color",
    summary: "Current accent: {theme}.",
    aria: "Accent color",
    blue: "Blue",
    purple: "Purple",
    pink: "Pink",
    red: "Red",
    orange: "Orange",
    yellow: "Yellow",
    green: "Green",
    graphite: "Graphite",
  },
  zh: {
    title: "主题色",
    summary: "当前主题色：{theme}。",
    aria: "主题色",
    blue: "蓝色",
    purple: "紫色",
    pink: "粉色",
    red: "红色",
    orange: "橙色",
    yellow: "黄色",
    green: "绿色",
    graphite: "石墨色",
  },
};

const STORAGE_KEY = `${appSlug()}.accentTheme`;
let accentTheme = resolveAccentTheme(localStorage.getItem(STORAGE_KEY) || "blue");
let scheduled = false;

applyAccentTheme(accentTheme);

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

function resolveAccentTheme(value) {
  return ACCENT_THEMES.some((theme) => theme.id === value) ? value : "blue";
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

function accentThemeLabel(id = accentTheme) {
  return text(resolveAccentTheme(id));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function applyAccentTheme(value) {
  accentTheme = resolveAccentTheme(value);
  if (document.documentElement.dataset.accentTheme !== accentTheme) {
    document.documentElement.dataset.accentTheme = accentTheme;
  }
  document.querySelectorAll('input[name="accentTheme"]').forEach((input) => {
    const checked = input.value === accentTheme;
    if (input.checked !== checked) input.checked = checked;
  });
  refreshThemeCopy();
}

function setAccentTheme(value) {
  accentTheme = resolveAccentTheme(value);
  localStorage.setItem(STORAGE_KEY, accentTheme);
  applyAccentTheme(accentTheme);
}

function themeMarkup() {
  const options = ACCENT_THEMES.map((theme) => {
    const checked = theme.id === accentTheme ? "checked" : "";
    return `
      <label class="accent-theme-option" style="--swatch: ${theme.color}; --swatch-check: ${theme.check || "#ffffff"}">
        <input type="radio" name="accentTheme" value="${theme.id}" ${checked} />
        <span class="accent-theme-swatch" aria-hidden="true"></span>
        <span>${escapeHtml(accentThemeLabel(theme.id))}</span>
      </label>
    `;
  }).join("");

  return `
    <section class="accent-settings" data-accent-settings>
      <h2 data-accent-title>${escapeHtml(text("title"))}</h2>
      <p data-accent-summary>${escapeHtml(text("summary", { theme: accentThemeLabel() }))}</p>
      <div class="accent-theme-options" role="radiogroup" aria-label="${escapeHtml(text("aria"))}">
        ${options}
      </div>
    </section>
  `;
}

function bindThemePicker(root = document) {
  root.querySelectorAll('input[name="accentTheme"]').forEach((input) => {
    input.onchange = () => setAccentTheme(input.value);
  });
}

function refreshThemeCopy() {
  document.querySelectorAll("[data-accent-settings]").forEach((section) => {
    const title = section.querySelector("[data-accent-title]");
    const summary = section.querySelector("[data-accent-summary]");
    const group = section.querySelector(".accent-theme-options");
    const titleText = text("title");
    const summaryText = text("summary", { theme: accentThemeLabel() });
    const ariaText = text("aria");
    if (title && title.textContent !== titleText) title.textContent = titleText;
    if (summary && summary.textContent !== summaryText) summary.textContent = summaryText;
    if (group && group.getAttribute("aria-label") !== ariaText) group.setAttribute("aria-label", ariaText);
    section.querySelectorAll('input[name="accentTheme"]').forEach((input) => {
      const checked = input.value === accentTheme;
      if (input.checked !== checked) input.checked = checked;
      const label = input.closest(".accent-theme-option")?.querySelector("span:last-child");
      const labelText = accentThemeLabel(input.value);
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
  if (!container || container.querySelector("[data-accent-settings]")) return false;
  if (mode === "prepend") container.insertAdjacentHTML("afterbegin", themeMarkup());
  else container.insertAdjacentHTML("beforeend", themeMarkup());
  bindThemePicker(container);
  return true;
}

function mountThemePicker() {
  applyAccentTheme(accentTheme);
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

  refreshThemeCopy();
}

function scheduleMount() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    mountThemePicker();
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
