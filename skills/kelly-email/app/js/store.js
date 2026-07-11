// Shared mutable app state. One object, not many exported `let` bindings —
// ESM only gives importers a read-only live view of an exported `let`, so
// every reassignment would need its own setter function. Mutating properties
// of a shared object works the same way across every module that imports it.

export const $ = (id) => document.getElementById(id);

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

const LANGUAGE_OPTIONS = [
  { value: "auto", labelKey: "language.auto" },
  { value: "en", labelKey: "language.english" },
  { value: "zh-CN", labelKey: "language.chinese" },
];

export const LANGUAGE_STORAGE_KEY = "kelly-email.uiLanguage";
export const ACCENT_THEME_STORAGE_KEY = "kelly-email.accentTheme";
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-email.sidebarCollapsed";
export { ACCENT_THEMES, LANGUAGE_OPTIONS };

export function resolveAccentTheme(value) {
  return ACCENT_THEMES.some((theme) => theme.id === value) ? value : "blue";
}

function modeForDemo(value) {
  if (["review", "needs-review", "needs_review", "needs"].includes(value)) return "needs_review";
  if (["approved", "blocked", "done"].includes(value)) return value;
  return "all";
}

const params = new URLSearchParams(window.location.search);
const demoScenario = params.get("demo") || "";
const queryLanguage = params.get("lang");

export const store = {
  params,
  state: { items: [], counts: {}, batch: null, lock: { locked: false } },
  selectedId: null,
  checked: new Set(),
  refreshTimer: null,
  lockTimer: null,
  busabaseFormVisible: false,
  // Lets a user back out to the provider choice even after one is already
  // saved — otherwise the only way back is deleting the local config file.
  forceChooseStep: false,
  mode: modeForDemo(demoScenario),
  languageMode: queryLanguage || localStorage.getItem(LANGUAGE_STORAGE_KEY) || "auto",
  accentTheme: resolveAccentTheme(localStorage.getItem(ACCENT_THEME_STORAGE_KEY) || "blue"),
  uiLanguage: "en",
  isApplyingRoute: false,
  routeNeedsReplace: false,
  openActionMenu: false,
  mobileDetailOpen: false,
  lastSetupStep: "",
  busabaseAutosaveTimer: null,
  busabaseAutosaveToken: 0,
};
