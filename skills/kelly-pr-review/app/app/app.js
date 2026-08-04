import { I18N } from "./i18n/messages.js";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { countByWorkflow, matchesMode, matchesSearch } from "./js/pr-review-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { closeHelp, openHelp, renderDetail, renderList } from "./js/review-views.js";

export let state = { items: [], counts: {}, batch: null, lock: { locked: false }, config_summary: {}, demo: false };
let allItems = [];
const params = new URLSearchParams(window.location.search);
const demoScenario = params.get("demo") || "";
const LANGUAGE_STORAGE_KEY = "kelly-pr-review.uiLanguage";
export let languageMode = normalizeLanguageMode(
  params.get("lang") || localStorage.getItem(LANGUAGE_STORAGE_KEY) || "auto",
);
let mode = modeForDemo(demoScenario);
let repoFilter = "all";
export const reviewStore = { selectedId: null, saveTimer: null };
let refreshTimer = null;
const language = resolveLanguage();
let isApplyingRoute = false;
let routeNeedsReplace = false;
let mobileDetailOpen = false;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-pr-review.sidebarCollapsed";

export const $ = (id) => document.getElementById(id);

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  $("sidebarToggle")?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const scrim = $("sidebarScrim");
  if (scrim) scrim.hidden = !open;
}

export function setMobileDetailOpen(open) {
  mobileDetailOpen = Boolean(open);
  document.body.classList.toggle("mobile-detail-open", mobileDetailOpen);
}

function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
    setMobileDetailOpen(Boolean(reviewStore.selectedId) && mobileDetailOpen);
  } else {
    setMobileSidebarOpen(false);
    setMobileDetailOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
}

function toggleSidebar() {
  if (isMobileLayout()) setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
  else setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

export function t(key, params = {}) {
  return String(I18N[language]?.[key] || I18N.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
}

function normalizeLanguageMode(value) {
  if (value === "zh" || value === "zh-CN") return "zh-CN";
  if (value === "en") return "en";
  return "auto";
}

function browserLanguage() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  return languages.some((item) => String(item).toLowerCase().startsWith("zh")) ? "zh-CN" : "en";
}

function resolveLanguage() {
  return languageMode === "auto" ? browserLanguage() : languageMode;
}

export function setLanguageMode(value) {
  languageMode = normalizeLanguageMode(value);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, languageMode);
  const nextParams = new URLSearchParams(window.location.search);
  nextParams.set("lang", languageMode);
  window.location.search = nextParams.toString();
}

function applyTranslations() {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
}

function syncModeButtons() {
  document.querySelectorAll("#filters button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function timeAgo(value) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

export function statusBadge(item) {
  const status = item.status || "needs_review";
  const labels = {
    needs_review: t("status.needs_review"),
    to_approve: t("status.to_approve"),
    approved: t("status.approved"),
    merged: t("status.merged"),
    done: t("status.done"),
    blocked: t("status.blocked"),
  };
  const klass =
    status === "approved" || status === "done"
      ? "ok"
      : status === "blocked"
        ? "danger"
        : status === "to_approve"
          ? "warn"
          : "";
  return `<span class="badge ${klass}">${escapeHtml(labels[status] || status)}</span>`;
}

export function testedBadge(item) {
  if (item.verification_status === "tested")
    return `<span class="badge tested">${escapeHtml(t("status.tested"))}</span>`;
  if (item.verification_status === "needs_test")
    return `<span class="badge warn">${escapeHtml(t("status.needs_test"))}</span>`;
  return "";
}

export function actionBadge(action) {
  const labels = {
    approve: t("action.approve"),
    comment: t("action.comment"),
    request_changes: t("action.request_changes"),
    no_action: t("action.no_action"),
    needs_review: t("action.needs_review"),
    block: t("action.block"),
  };
  const klass =
    action === "approve"
      ? "ok"
      : action === "request_changes" || action === "block"
        ? "danger"
        : action === "comment"
          ? "warn"
          : "";
  return `<span class="badge ${klass}">${escapeHtml(labels[action] || action || t("action.review"))}</span>`;
}

export function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2800);
}

function modeForDemo(value) {
  if (value === "ready") return "to_approve";
  if (["approved", "needs_test", "tested", "blocked", "done", "all"].includes(value)) return value;
  return "needs_review";
}

function routeModes() {
  return ["all", "needs_review", "to_approve", "approved", "needs_test", "tested", "done", "blocked"];
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

function routeFor(nextMode = mode, nextSelectedId = reviewStore.selectedId) {
  const modePart = routeModes().includes(nextMode) ? nextMode : "needs_review";
  return nextSelectedId ? `/${modePart}/${encodeRoutePart(nextSelectedId)}` : `/${modePart}`;
}

function parseHashRoute() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeRoutePart);
  return {
    mode: routeModes().includes(parts[0]) ? parts[0] : mode,
    selectedId: parts[1] || null,
  };
}

function applyRouteFromHash() {
  isApplyingRoute = true;
  routeNeedsReplace = false;
  const route = parseHashRoute();
  mode = route.mode;
  reviewStore.selectedId = route.selectedId;
  syncModeButtons();
  isApplyingRoute = false;
}

export function syncRoute({ push = false } = {}) {
  if (isApplyingRoute) {
    routeNeedsReplace = true;
    return;
  }
  const target = `#${routeFor()}`;
  if (window.location.hash === target) return;
  if (push) window.location.hash = target;
  else history.replaceState(null, "", target);
}

export function navigateTo(next = {}, { replace = false, reload = false } = {}) {
  if ("mode" in next) mode = next.mode;
  if ("selectedId" in next) reviewStore.selectedId = next.selectedId;
  syncModeButtons();
  const target = `#${routeFor()}`;
  if (window.location.hash === target) {
    if (reload) loadState().catch((error) => toast(error.message));
    else {
      renderList();
      renderDetail();
    }
    return;
  }
  if (replace) {
    history.replaceState(null, "", target);
    if (reload) loadState().catch((error) => toast(error.message));
    else {
      renderList();
      renderDetail();
    }
  } else {
    window.location.hash = target;
  }
}

function countFor(name) {
  if (name === "all") return state.total_cached || 0;
  return state.counts?.[name] || 0;
}

function renderCounts() {
  ["all", "needs_review", "to_approve", "approved", "needs_test", "tested", "done", "blocked"].forEach((name) => {
    const node = $(`count-${name}`);
    if (node) node.textContent = countFor(name);
  });
}

function modeTitle() {
  return (
    {
      all: t("mode.all"),
      needs_review: t("mode.needs_review"),
      to_approve: t("mode.to_approve"),
      approved: t("mode.approved"),
      needs_test: t("mode.needs_test"),
      tested: t("mode.tested"),
      done: t("mode.done"),
      blocked: t("mode.blocked"),
    }[mode] || t("mode.all")
  );
}

function renderHeader() {
  const batch = state.batch || {};
  $("batchMeta").textContent =
    batch.batch_id && state.total_all_repos
      ? t("batch.generated", { id: batch.batch_id, time: timeAgo(batch.generated_at) })
      : t("batch.none");
  renderRepoFilter();
  $("sectionTitle").textContent = modeTitle();
  $("listCount").textContent = `${state.items.length}`;

  const config = state.config_summary || {};
  $("setupBody").textContent = state.demo
    ? t("demo_notice")
    : config.configured
      ? t("ready.as", { handle: config.reviewer?.handle || "@me" })
      : t("gh.defaults");

  const approved = countFor("approved");
  const needs = countFor("needs_review") + countFor("to_approve");
  if (!state.total_cached) {
    $("nextTitle").textContent = t("next.generate.title");
    $("nextBody").textContent = t("next.generate.body");
  } else if (approved > 0) {
    $("nextTitle").textContent = t("next.execute.title", { count: approved, s: approved === 1 ? "" : "s" });
    $("nextBody").textContent = t("next.execute.body");
  } else if (needs > 0) {
    $("nextTitle").textContent = t("next.review.title", { count: needs, s: needs === 1 ? "" : "s" });
    $("nextBody").textContent = t("next.review.body");
  } else {
    $("nextTitle").textContent = t("next.clear.title");
    $("nextBody").textContent = t("next.clear.body");
  }
}

function renderRepoFilter() {
  const select = $("repoFilter");
  if (!select) return;
  const repos = state.repos || [];
  const current = repos.some((repo) => repo.repo === repoFilter) ? repoFilter : "all";
  if (current !== repoFilter) repoFilter = current;
  const options = [
    `<option value="all">${escapeHtml(t("all_repos"))} (${state.total_all_repos || 0})</option>`,
    ...repos.map(
      (repo) =>
        `<option value="${escapeHtml(repo.repo)}">${escapeHtml(repo.repo)} (${escapeHtml(repo.count)})</option>`,
    ),
  ].join("");
  if (select.innerHTML !== options) select.innerHTML = options;
  select.value = repoFilter;
}

export function renderLock() {
  const lock = state.lock || {};
  $("lockBanner").classList.toggle("is-hidden", !lock.locked);
  $("lockMessage").textContent = lock.message || t("lock.default");
  document.querySelectorAll("button, textarea, input").forEach((node) => {
    if (node.id === "searchInput" || node.id === "helpButton" || node.id === "closeHelp") return;
    node.disabled = Boolean(lock.locked);
  });
}

// Filtering/counting is ported from the retired the retired local-file provider (lib/data-provider)'s
// getState(): repo filter narrows the pool that counts are computed over,
// mode + search narrow what's actually listed. Busabase reads are always
// live, so this runs client-side on every load instead of as query params
// on a server route.
export async function loadState() {
  applyRouteFromHash();
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  allItems = data.snapshot?.items || [];
  const repo = repoFilter;
  const repoItems = repo && repo !== "all" ? allItems.filter((item) => item.repo === repo) : allItems;
  const search = $("searchInput")?.value || "";
  const items = repoItems.filter((item) => matchesMode(item, mode) && matchesSearch(item, search));
  state = {
    items,
    counts: countByWorkflow(repoItems),
    repos: data.snapshot?.repos || [],
    batch: {
      batch_id: data.snapshot?.source,
      generated_at: data.snapshot?.generated_at,
      source: data.snapshot?.source,
    },
    total_cached: repoItems.length,
    total_all_repos: allItems.length,
    config_summary: data.config_summary || {},
    lock: data.lock || { locked: false },
    demo: Boolean(data.demo),
  };
  window.dispatchEvent(new CustomEvent("kelly-pr-review:state", { detail: data }));
  renderCounts();
  renderHeader();
  renderLock();
  renderList();
  if (routeNeedsReplace) {
    history.replaceState(null, "", `#${routeFor()}`);
    routeNeedsReplace = false;
  }
}

function wire() {
  document.querySelectorAll("#filters button").forEach((button) => {
    button.addEventListener("click", () => {
      setMobileSidebarOpen(false);
      setMobileDetailOpen(false);
      navigateTo({ mode: button.dataset.mode, selectedId: null }, { reload: true });
    });
  });
  $("sidebarToggle").addEventListener("click", toggleSidebar);
  $("mobileSidebarToggle").addEventListener("click", () => setMobileSidebarOpen(true));
  $("sidebarScrim").addEventListener("click", () => setMobileSidebarOpen(false));
  $("detailPanel").addEventListener("click", (event) => {
    if (event.target.closest(".back-to-list")) setMobileDetailOpen(false);
  });
  window.addEventListener("resize", syncResponsiveShell);
  $("searchInput").addEventListener("input", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => loadState().catch((error) => toast(error.message)), 250);
  });
  $("repoFilter").addEventListener("change", () => {
    repoFilter = $("repoFilter").value || "all";
    reviewStore.selectedId = null;
    syncRoute({ push: false });
    loadState().catch((error) => toast(error.message));
  });
  $("reloadButton").addEventListener("click", () => loadState().catch((error) => toast(error.message)));
  $("refreshButton").addEventListener("click", () => loadState().catch((error) => toast(error.message)));
  $("helpButton").addEventListener("click", openHelp);
  $("closeHelp").addEventListener("click", closeHelp);
  $("helpModal").addEventListener("click", (event) => {
    if (event.target === $("helpModal")) closeHelp();
  });
  setInterval(() => {
    const active = document.activeElement;
    if (active && ["TEXTAREA", "INPUT"].includes(active.tagName)) return;
    loadState().catch(() => {});
  }, 5000);
  window.addEventListener("hashchange", () => loadState().catch((error) => toast(error.message)));
}

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    toast(error.message);
  }
}

applyTranslations();
syncResponsiveShell();
syncModeButtons();
wire();
boot();
