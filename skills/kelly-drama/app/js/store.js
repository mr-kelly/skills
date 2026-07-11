// Shared mutable app state. One object, not many exported `let` bindings —
// ESM only gives importers a read-only live view of an exported `let`, so
// every reassignment would need its own setter function. Mutating properties
// of a shared object works the same way across every module that imports it.

export const $ = (id) => document.getElementById(id);

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-drama.sidebarCollapsed";
export const LANG_STORAGE_KEY = "kdrama_lang";

// Demo mode: `/?demo=<scene>&lang=en|zh` shows deterministic mock data.
export const PAGE_QUERY = new URLSearchParams(window.location.search);
export const DEMO_SCENARIO = PAGE_QUERY.get("demo") || "";
export const URL_LANG = PAGE_QUERY.get("lang") || "";

export const store = {
  state: null,
  view: "overview",
  selectedId: null,
  query: "",
  episodeMode: "list",
  episodeTab: "summary",
  imageConfig: null,
  hyperframeStatus: null,
  hyperframeLoading: false,
  isApplyingRoute: false,
  routeNeedsReplace: false,
  lastAppliedHash: "",
  langPref: URL_LANG || localStorage.getItem(LANG_STORAGE_KEY) || "auto",
  expandedShots: new Set(),
};

export function project() {
  return store.state?.project || {};
}
