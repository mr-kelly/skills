import { collectionFor, matches } from "./list-detail.js";
import { navigateTo } from "./router.js";
import { $, SIDEBAR_COLLAPSED_STORAGE_KEY, store } from "./store.js";

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

export function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  $("sidebarToggle")?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

export function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const scrim = $("sidebarScrim");
  if (scrim) scrim.hidden = !open;
}

export function setMobileDetailOpen(open) {
  document.body.classList.toggle("mobile-detail-open", Boolean(open));
}

export function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
    setMobileDetailOpen(Boolean(store.selectedId) && store.view !== "overview");
  } else {
    setMobileSidebarOpen(false);
    setMobileDetailOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
}

export function toggleSidebar() {
  if (isMobileLayout()) setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
  else setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

export function isTypingTarget(target) {
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
}

export function moveSelection(direction) {
  if (store.view === "overview") return;
  if (store.view === "episodes" && store.episodeMode === "detail") return;
  const items = collectionFor()
    .filter(matches)
    .sort((a, b) => (store.view === "episodes" ? (a.number || 0) - (b.number || 0) : 0));
  if (!items.length) return;
  const foundIndex = items.findIndex((item) => item.id === store.selectedId);
  const currentIndex = foundIndex < 0 ? (direction > 0 ? -1 : items.length) : foundIndex;
  const nextIndex = Math.min(items.length - 1, Math.max(0, currentIndex + direction));
  navigateTo({ selectedId: items[nextIndex].id }, { replace: true });
}
