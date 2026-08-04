import { viewMeta } from "./chrome.js";
import { render } from "./render.js";
import { store } from "./store.js";

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

export function routeFor(next = {}) {
  const nextView = next.view || store.view || "overview";
  const nextSelectedId = next.selectedId ?? store.selectedId;
  const nextEpisodeMode = next.episodeMode || store.episodeMode;
  const nextEpisodeTab = next.episodeTab || store.episodeTab || "summary";
  if (nextView === "overview") return "/overview";
  if (nextView === "episodes") {
    if (nextEpisodeMode === "detail" && nextSelectedId) {
      return `/episodes/${encodeRoutePart(nextSelectedId)}/${nextEpisodeTab === "shots" ? "shots" : "summary"}`;
    }
    return "/episodes";
  }
  return nextSelectedId ? `/${nextView}/${encodeRoutePart(nextSelectedId)}` : `/${nextView}`;
}

export function parseHashRoute() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeRoutePart);
  const meta = viewMeta();
  const routeView = meta[parts[0]] ? parts[0] : "overview";
  if (routeView === "episodes") {
    const routeSelectedId = parts[1] || null;
    return {
      view: "episodes",
      selectedId: routeSelectedId,
      episodeMode: routeSelectedId ? "detail" : "list",
      episodeTab: parts[2] === "shots" ? "shots" : "summary",
    };
  }
  return {
    view: routeView,
    selectedId: parts[1] || null,
    episodeMode: "list",
    episodeTab: "summary",
  };
}

function applyRoute(route) {
  store.view = route.view;
  store.selectedId = route.selectedId;
  store.episodeMode = route.episodeMode;
  store.episodeTab = route.episodeTab;
}

export function applyRouteFromHash({ replaceEmpty = false } = {}) {
  const route = parseHashRoute();
  store.isApplyingRoute = true;
  store.routeNeedsReplace = false;
  applyRoute(route);
  if (replaceEmpty && !window.location.hash) {
    history.replaceState(null, "", `#${routeFor(route)}`);
  }
  render();
  if (store.routeNeedsReplace) {
    history.replaceState(null, "", `#${routeFor()}`);
    store.routeNeedsReplace = false;
  }
  store.lastAppliedHash = window.location.hash || `#${routeFor()}`;
  store.isApplyingRoute = false;
}

export function navigateTo(partial = {}, { replace = false } = {}) {
  const next = {
    view: store.view,
    selectedId: store.selectedId,
    episodeMode: store.episodeMode,
    episodeTab: store.episodeTab,
    ...partial,
  };
  if (partial.view && partial.view !== "episodes") {
    next.episodeMode = "list";
    next.episodeTab = "summary";
  }
  if (partial.view && partial.view !== store.view) {
    next.selectedId = partial.selectedId ?? null;
  }
  const target = `#${routeFor(next)}`;
  if (window.location.hash === target) {
    applyRoute(next);
    render();
    return;
  }
  if (replace) {
    history.replaceState(null, "", target);
    applyRouteFromHash();
  } else {
    window.location.hash = target;
  }
}

export function syncRoute({ replace = true } = {}) {
  if (store.isApplyingRoute) {
    store.routeNeedsReplace = true;
    return;
  }
  const target = `#${routeFor()}`;
  if (window.location.hash === target) return;
  if (replace) history.replaceState(null, "", target);
  else window.location.hash = target;
}
