import { newItem, registerActionHooks } from "./js/actions.js";
import { passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { escapeHtml } from "./js/format.js";
import { closeModal, isModalOpen } from "./js/modal.js";
import { render } from "./js/render.js";
import { applyRouteFromHash, navigateTo, routeFor } from "./js/router.js";
import { closeSettings, openSettings, setSettingsTab } from "./js/settings.js";
import {
  isTypingTarget,
  moveSelection,
  setMobileDetailOpen,
  setMobileSidebarOpen,
  syncResponsiveShell,
  toggleSidebar,
} from "./js/shell.js";
import { shotsForEpisode } from "./js/shots.js";
import { loadState } from "./js/state.js";
import { $, DEMO_SCENARIO, store } from "./js/store.js";

registerActionHooks({ render, shotsForEpisode });

async function load() {
  await loadState();
  if (DEMO_SCENARIO && !window.location.hash) {
    const demoRoutes = {
      overview: "/overview",
      characters: "/characters",
      relationships: "/relationships",
      episodes: "/episodes",
    };
    history.replaceState(null, "", `#${demoRoutes[DEMO_SCENARIO] || "/overview"}`);
  }
  applyRouteFromHash({ replaceEmpty: true });
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    setMobileSidebarOpen(false);
    setMobileDetailOpen(false);
    navigateTo({ view: viewButton.dataset.view, selectedId: null, episodeMode: "list", episodeTab: "summary" });
  }
});

$("searchInput").addEventListener("input", (event) => {
  store.query = event.target.value;
  render();
});

$("newItemButton").addEventListener("click", newItem);
$("sidebarToggle").addEventListener("click", toggleSidebar);
$("mobileSidebarToggle").addEventListener("click", () => setMobileSidebarOpen(true));
$("sidebarScrim").addEventListener("click", () => setMobileSidebarOpen(false));
$("backToList").addEventListener("click", () => {
  if (store.view === "episodes" && store.episodeMode === "detail")
    navigateTo({ view: "episodes", selectedId: null, episodeMode: "list", episodeTab: "summary" });
  else setMobileDetailOpen(false);
});
window.addEventListener("resize", syncResponsiveShell);
$("settingsButton").addEventListener("click", openSettings);
$("closeSettings").addEventListener("click", closeSettings);
$("settingsModal").addEventListener("click", (event) => {
  if (event.target === $("settingsModal")) closeSettings();
});
document.querySelectorAll("[data-settings-tab]").forEach((node) => {
  node.addEventListener("click", () => setSettingsTab(node.dataset.settingsTab));
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("searchInput").focus();
    $("searchInput").select();
    return;
  }
  if (event.key === "/" && !isTypingTarget(event.target)) {
    event.preventDefault();
    $("searchInput").focus();
    return;
  }
  if (event.key.toLowerCase() === "n" && !isTypingTarget(event.target) && store.view !== "overview") {
    event.preventDefault();
    newItem();
    return;
  }
  if (event.key === "Escape") {
    if (isModalOpen()) {
      closeModal();
      return;
    }
    if (!$("settingsModal").classList.contains("hidden")) {
      closeSettings();
      return;
    }
    if (document.activeElement === $("searchInput") && store.query) {
      store.query = "";
      $("searchInput").value = "";
      render();
      return;
    }
    if (store.view === "episodes" && store.episodeMode === "detail") {
      navigateTo({ view: "episodes", selectedId: null, episodeMode: "list", episodeTab: "summary" });
    }
  }
  if (!isTypingTarget(event.target) && event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
  }
  if (!isTypingTarget(event.target) && event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
  }
  if (
    !isTypingTarget(event.target) &&
    event.key === "Enter" &&
    store.view === "episodes" &&
    store.episodeMode === "list" &&
    store.selectedId
  ) {
    event.preventDefault();
    navigateTo({ view: "episodes", selectedId: store.selectedId, episodeMode: "detail", episodeTab: "summary" });
  }
});

window.addEventListener("hashchange", () => {
  if (store.state) applyRouteFromHash();
});

window.addEventListener("popstate", () => {
  if (store.state) applyRouteFromHash();
});

window.addEventListener("pageshow", () => {
  if (store.state) applyRouteFromHash({ replaceEmpty: true });
});

setInterval(() => {
  if (!store.state || store.isApplyingRoute || isTypingTarget(document.activeElement)) return;
  const currentHash = window.location.hash || "#/overview";
  if (currentHash !== store.lastAppliedHash || currentHash !== `#${routeFor()}`) {
    applyRouteFromHash({ replaceEmpty: true });
  }
}, 300);

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    syncResponsiveShell();
    await load();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    document.body.innerHTML = `<pre>${escapeHtml(error?.stack || error?.message || error)}</pre>`;
  }
}

boot();
