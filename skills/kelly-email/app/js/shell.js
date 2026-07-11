import { api } from "./api.js";
import { t } from "./i18n.js";
import { setupNeeded } from "./provider.js";
import { applyProviderGate } from "./setup.js";
import { $, SIDEBAR_COLLAPSED_STORAGE_KEY, store } from "./store.js";

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

export function syncModeButtons() {
  document.querySelectorAll("[data-mode]").forEach((node) => {
    node.classList.toggle("active", node.dataset.mode === store.mode);
  });
}

function syncSidebarState() {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  const toggle = $("sidebarToggle");
  if (toggle) toggle.setAttribute("aria-expanded", String(!collapsed));
}

export function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  syncSidebarState();
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

export function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const scrim = $("sidebarScrim");
  if (scrim) scrim.hidden = !open;
}

export function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

export function setMobileDetailOpen(open) {
  store.mobileDetailOpen = Boolean(open);
  document.body.classList.toggle("mobile-detail-open", store.mobileDetailOpen);
}

export function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
    setMobileDetailOpen(Boolean(store.selectedId) && store.mobileDetailOpen);
  } else {
    setMobileSidebarOpen(false);
    setMobileDetailOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
  syncSidebarState();
}

export function closeDetailActionMenu() {
  store.openActionMenu = false;
  const menu = $("detailActionMenu");
  const toggle = $("detailActionMenuToggle");
  if (menu) menu.classList.remove("is-open");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

export function resizeHtmlPreviewFrame(frame) {
  if (!frame) return;
  const minHeight = 180;
  const maxHeight = 2000;
  try {
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) return;
    const body = doc.body;
    const root = doc.documentElement;
    const height = Math.max(
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      root?.scrollHeight || 0,
      root?.offsetHeight || 0,
      minHeight,
    );
    const nextHeight = Math.min(height + 2, maxHeight);
    frame.style.height = `${nextHeight}px`;
    frame.classList.toggle("is-clamped", height > maxHeight);
  } catch {
    frame.style.height = "720px";
  }
}

export function attachHtmlPreviewAutoResize() {
  const frame = document.querySelector(".html-preview");
  if (!frame) return;
  const resize = () => resizeHtmlPreviewFrame(frame);
  frame.addEventListener(
    "load",
    () => {
      resize();
      setTimeout(resize, 80);
      setTimeout(resize, 400);
    },
    { once: true },
  );
  requestAnimationFrame(resize);
}

export function isEditing() {
  const active = document.activeElement;
  if (!active) return false;
  if (active.matches("textarea")) return true;
  return active.matches("input") && active.id !== "searchInput";
}

export function captureScrollState() {
  const page = document.scrollingElement || document.documentElement;
  return {
    pageTop: page?.scrollTop || 0,
    listTop: $("messageList")?.scrollTop || 0,
    detailTop: $("detailPanel")?.scrollTop || 0,
  };
}

export function restoreScrollState(scrollState) {
  const page = document.scrollingElement || document.documentElement;
  if (page) page.scrollTop = scrollState.pageTop;
  const list = $("messageList");
  if (list) list.scrollTop = scrollState.listTop;
  const detail = $("detailPanel");
  if (detail) detail.scrollTop = scrollState.detailTop;
}

export function isLocked() {
  return Boolean(store.state.lock?.locked);
}

export function applyLockState() {
  const locked = isLocked();
  const unavailable = setupNeeded();
  document.body.classList.toggle("is-locked", locked);
  document.body.classList.toggle("provider-unavailable", unavailable);
  if (locked || unavailable) closeDetailActionMenu();
  applyProviderGate();
  const banner = $("lockBanner");
  if (banner) {
    banner.classList.toggle("is-hidden", !locked);
  }
  const message = $("lockMessage");
  if (message) {
    message.textContent = locked ? store.state.lock.message || t("lock.processing") : t("lock.default");
  }
  document.querySelectorAll("button, input, textarea, select").forEach((node) => {
    const keepEnabled =
      node.id === "searchInput" ||
      node.id === "helpButton" ||
      node.id === "mobileHelpButton" ||
      node.id === "providerGateHelpButton" ||
      node.id === "setupChooseLocal" ||
      node.id === "setupChooseBusabase" ||
      node.id === "busabaseBackButton" ||
      node.id === "busabaseContinueButton" ||
      node.id === "busabaseReconfigureButton" ||
      node.id === "setupChangeProviderButton" ||
      node.id === "setupCopyPrompt" ||
      node.id === "closeHelp" ||
      node.id === "sidebarToggle" ||
      node.id === "mobileSidebarToggle" ||
      Boolean(node.closest("#helpModal")) ||
      Boolean(node.closest("#busabaseConfigForm"));
    node.disabled = !keepEnabled && (locked || unavailable);
  });
}

export async function pollLock() {
  const data = await api("/api/lock");
  store.state.lock = data.lock || { locked: false };
  applyLockState();
}
