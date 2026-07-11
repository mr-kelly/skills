import { toast } from "./api.js";
import { store } from "./store.js";

// closeHelp/openHelp (help-modal.js), refresh/renderList/renderDetail
// (list-detail.js), and syncModeButtons/isMobileLayout/setMobileDetailOpen
// (shell.js) all need routing and vice versa. Rather than import across that
// whole cycle, main.js registers the real implementations once every module
// has loaded.
const hooks = {
  isHelpOpen: () => false,
  openHelp: () => {},
  closeHelp: () => {},
  activeHelpTab: () => "guide",
  syncModeButtons: () => {},
  isMobileLayout: () => false,
  setMobileDetailOpen: () => {},
  refresh: async () => {},
  renderList: () => {},
  renderDetail: () => {},
};

export function registerRouterHooks(overrides) {
  Object.assign(hooks, overrides);
}

export function routeModes() {
  return ["all", "needs_review", "approved", "done", "blocked"];
}

export function helpTabs() {
  return ["guide", "files", "accounts", "profile", "style", "knowledge", "appearance", "config"];
}

function encodeRoutePart(value) {
  return encodeURIComponent(String(value || ""));
}

function decodeRoutePart(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

export function routeFor() {
  const modalOpen = hooks.isHelpOpen();
  if (modalOpen) {
    const activeTab = hooks.activeHelpTab() || "guide";
    return `/settings/${activeTab}`;
  }
  const modePart = routeModes().includes(store.mode) ? store.mode : "all";
  return store.selectedId ? `/${modePart}/${encodeRoutePart(store.selectedId)}` : `/${modePart}`;
}

export function parseHashRoute() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeRoutePart);
  if (parts[0] === "settings") {
    const requestedTab = parts[1] === "language" ? "appearance" : parts[1];
    return {
      settingsTab: helpTabs().includes(requestedTab) ? requestedTab : "guide",
      mode: store.mode,
      selectedId: store.selectedId,
    };
  }
  return {
    settingsTab: null,
    mode: routeModes().includes(parts[0]) ? parts[0] : store.mode,
    selectedId: parts[1] || null,
  };
}

export function hashHasSelectedMessage() {
  return Boolean(parseHashRoute().selectedId);
}

export function applyRouteFromHash({ refreshData = false } = {}) {
  store.isApplyingRoute = true;
  store.routeNeedsReplace = false;
  const route = parseHashRoute();
  store.mode = route.mode;
  store.selectedId = route.selectedId;
  if (hooks.isMobileLayout()) hooks.setMobileDetailOpen(Boolean(store.selectedId));
  hooks.syncModeButtons();
  if (route.settingsTab) {
    hooks.openHelp(route.settingsTab);
  } else if (hooks.isHelpOpen()) {
    hooks.closeHelp({ skipRoute: true });
  }
  store.isApplyingRoute = false;
  if (refreshData) hooks.refresh({ preserveScroll: false }).catch((error) => toast(error.message));
}

export function syncRoute({ push = false } = {}) {
  if (store.isApplyingRoute) {
    store.routeNeedsReplace = true;
    return;
  }
  const target = `#${routeFor()}`;
  if (window.location.hash === target) return;
  if (push) window.location.hash = target;
  else history.replaceState(null, "", target);
}

export function navigateTo(next = {}, { replace = false, refreshData = false } = {}) {
  if ("mode" in next) store.mode = next.mode;
  if ("selectedId" in next) store.selectedId = next.selectedId;
  hooks.syncModeButtons();
  const target = `#${routeFor()}`;
  if (window.location.hash === target) {
    if (refreshData) hooks.refresh({ preserveScroll: false }).catch((error) => toast(error.message));
    else {
      hooks.renderList();
      hooks.renderDetail();
    }
    return;
  }
  if (replace) {
    history.replaceState(null, "", target);
    if (refreshData) hooks.refresh({ preserveScroll: false }).catch((error) => toast(error.message));
    else {
      hooks.renderList();
      hooks.renderDetail();
    }
  } else {
    window.location.hash = target;
  }
}
