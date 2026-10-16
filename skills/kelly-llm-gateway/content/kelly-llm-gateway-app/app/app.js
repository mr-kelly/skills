import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { buildSnapshot } from "./js/gateway-model.js?v=0.1.0";
import {
  renderAnomalies,
  renderOverview,
  renderRollouts,
  renderSettings,
  renderSpend,
  submitAnomalyAck,
  submitRolloutDecision,
} from "./js/gateway-views.js";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where each record view opens a route (see config.js ui.detail_modes for the
// why). Anomalies are derived from routes rather than their own Base, but
// they are addressed the same way as a record view.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
// Views backed by the paginated `routes` Base — selecting a route by id may
// land on a route not on the currently loaded page.
const ROUTE_BACKED_VIEWS = ["spend", "rollouts"];

export const state = {
  snapshot: null,
  settings: null,
  provider: null,
  route: parseRoute(),
  sort: { key: "cost_today", dir: "desc" },
  // A route named by the URL (shared link, refresh on a later page) that is
  // not on the loaded page, read on its own via records.get.
  extra: new Map(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-llm-gateway-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  messages: { en: {}, zh: {} },
  busy: false,
  notice: "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-llm-gateway.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  search: byId("search"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  ackCount: byId("ack-count"),
  midRolloutCount: byId("count-mid-rollout"),
  readyPromoteCount: byId("count-ready-promote"),
  language: byId("language"),
};

const PAGINATED_KEYS = ["routes"];
const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((entry) => [entry.key, entry.readLimit])),
  applyPage: (key, rows) => {
    state.snapshot = buildSnapshot({
      services: state.snapshot.services,
      models: state.snapshot.models,
      routes: rows,
      configSummary: state.settings?.config_summary,
    });
  },
  render: () => render(),
  label: (key) => t(key),
  onError: (error) => {
    state.notice = error instanceof Error ? error.message : String(error);
  },
});
export { pagination };

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function syncSidebarState() {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  syncSidebarState();
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
}

function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
  } else {
    setMobileSidebarOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function normalizeLang(lang) {
  return String(lang || "auto")
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : lang || "auto";
}

export function t(key) {
  return state.messages[activeLang()]?.[key] || state.messages.en[key] || key;
}

export function enumLabel(value, group) {
  if (!value) return "";
  const key = String(value);
  return (
    state.messages[activeLang()]?.enum?.[group]?.[key] ||
    state.messages.en.enum?.[group]?.[key] ||
    key.replaceAll("_", " ")
  );
}

async function loadMessages() {
  const [en, zh] = await Promise.all([
    fetch("./i18n/en.json").then((res) => res.json()),
    fetch("./i18n/zh-CN.json").then((res) => res.json()),
  ]);
  state.messages = { en, zh };
}

export function money(value, currency = state.snapshot?.base_currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function num(value, digits = 0) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

export function errorRatePct(rate) {
  return `${(Number(rate || 0) * 100).toFixed(2)}%`;
}

export function signedPct(value) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function trendDayLabel(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "numeric",
    day: "numeric",
  });
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&peek=…]`. Search and the peeked record live in
// the URL so refresh, shared links and Back restore the same list context.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  if (!RECORD_VIEWS.includes(view) && view !== "settings") view = "overview";
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;
let routeSerial = 0;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from its list so Back/Close/Escape step back to
  // that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  state.notice = "";
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes should
// not each become a Back step.
export function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = previousWasList;
  render();
}

export function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Data ───────────────────────────────────────────────────────────────────
export async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  pagination.reset(data.pagination, data.totals);
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  state.extra = new Map();
  window.dispatchEvent(new CustomEvent("kelly-llm-gateway:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

// A route named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
// Anomalies are derived from already-loaded routes, so there is nothing to
// fetch for that view.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.snapshot || !selectedId || !ROUTE_BACKED_VIEWS.includes(view)) return;
  if (routeById(selectedId) || state.extra.has(selectedId)) return;
  const provider = state.provider;
  if (typeof provider?.getRecord !== "function") {
    state.extra.set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra.set(selectedId, undefined);
  try {
    const row = await provider.getRecord("routes", selectedId);
    state.extra.set(selectedId, row || null);
  } catch {
    state.extra.set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "spend"
      ? "#/spend"
      : scenario === "rollouts"
        ? "#/rollouts"
        : scenario === "anomalies"
          ? "#/anomalies"
          : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels =
    activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  els.detailExpand.textContent = t("openFullPage") || "Open full page";
}

export function hasSnapshot() {
  return Boolean(state.snapshot);
}

export function routes() {
  return state.snapshot?.routes || [];
}

export function services() {
  return state.snapshot?.services || [];
}

export function models() {
  return state.snapshot?.models || [];
}

export function anomalies() {
  return state.snapshot?.anomalies || [];
}

export function openAnomalies() {
  return anomalies().filter((a) => a.status === "open");
}

export function midRolloutRoutes() {
  return routes().filter((r) => r.status === "canary" && r.canary_pct < 90);
}

export function readyToPromoteRoutes() {
  return routes().filter((r) => r.status === "canary" && r.canary_pct >= 90);
}

export function serviceName(serviceId) {
  return services().find((s) => s.service_id === serviceId)?.display_name || serviceId;
}

export function modelInfo(modelId) {
  return (
    models().find((m) => m.model_id === modelId) || {
      display_name: modelId,
      provider: "",
      tier: "external",
    }
  );
}

// Loaded page first, then a route fetched on its own for the URL.
export function routeById(id) {
  if (!id) return null;
  return routes().find((item) => item.route_id === id) || state.extra.get(id) || null;
}

export function anomalyById(id) {
  return anomalies().find((item) => item.id === id) || null;
}

function renderShell() {
  applyI18n();
  const connected = hasSnapshot();
  els.syncStatus.textContent = connected
    ? state.snapshot?.generated_at
      ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
      : t("synced")
    : t("needsConnection");
  if (els.ackCount) els.ackCount.textContent = openAnomalies().length;
  if (els.midRolloutCount) els.midRolloutCount.textContent = midRolloutRoutes().length;
  if (els.readyPromoteCount) els.readyPromoteCount.textContent = readyToPromoteRoutes().length;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = connected
      ? `${money(state.snapshot?.totals?.cost_today)} · ${openAnomalies().length} ${t("anomalies").toLowerCase()}`
      : t("needsConnection");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "spend") return t("spend");
  if (view === "rollouts") return t("rollouts");
  if (view === "anomalies") return t("anomalies");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function statusBadgeClass(status) {
  if (status === "canary") return "sev-watch";
  if (status === "rollback") return "sev-high";
  if (status === "hold") return "sev-info";
  return "";
}

export function sortedRoutes(list, sort = state.sort) {
  const { key, dir } = sort;
  const factor = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av ?? "").localeCompare(String(bv ?? "")) * factor;
  });
}

export function warnings() {
  const items = state.snapshot?.warnings || [];
  if (!items.length) return "";
  return `<div class="warnings">${items
    .map(
      (item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `,
    )
    .join("")}</div>`;
}

export function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

export function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.snapshot);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (view === "spend") renderSpend();
  else if (view === "rollouts") renderRollouts();
  else if (view === "anomalies") renderAnomalies();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

// ── Events ─────────────────────────────────────────────────────────────────
pagination.bind(els.listPanel);
els.listPanel.addEventListener("click", (event) => {
  if (event.target.closest("[data-goto-page]")) return;
  const header = event.target.closest("[data-sort]");
  if (header) {
    const key = header.dataset.sort;
    if (state.sort.key === key) {
      state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
    } else {
      state.sort = { key, dir: key === "service_id" || key === "model_id" || key === "status" ? "asc" : "desc" };
    }
    render();
    return;
  }
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list the drawer was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.detailBody.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action][data-route-id]");
  if (actionButton) {
    submitRolloutDecision(actionButton.dataset.routeId, actionButton.dataset.action);
    return;
  }
  const ackButton = event.target.closest("[data-ack-anomaly]");
  if (ackButton) submitAnomalyAck(ackButton.dataset.ackAnomaly);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (event.target.closest?.("textarea, input")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`,
  );
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-llm-gateway-language", state.lang);
  render();
});

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadMessages();
    await loadState();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    els.loadState.hidden = false;
    els.loadState.classList.add("error");
    els.loadState.textContent = error instanceof Error ? error.message : String(error);
  }
}

els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
