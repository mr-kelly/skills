import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { channelsFor, computeMetrics, inventoryFor, reviewFor, statusForVerdict } from "./js/products-model.js?v=0.1.0";
import {
  renderChannelsView,
  renderInventoryView,
  renderOverview,
  renderProductsView,
  renderReviewView,
  renderSettings,
} from "./js/products-views.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view -- declared once in config.js's
// ui.detail_modes and explained there. channels/inventory are rollups with
// no record of their own (every row links to the owning product instead),
// so they are not in DETAIL_MODES at all.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const ALL_VIEWS = ["products", "inventory", "channels", "review"];
const PEEK_VIEWS = Object.keys(DETAIL_MODES);
const SNAPSHOT_KEY = { products: "products", review: "review_items" };
const ID_FIELD = { products: "product_id", review: "item_id" };

export const state = {
  snapshot: null,
  settings: null,
  provider: null,
  route: parseRoute(),
  // Records opened by URL/peek that are not on the loaded page (records.get).
  extra: { products: new Map(), review: new Map() },
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-products-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).has("demo"),
  busy: false,
};

const FEATURED_PRODUCT = "prod-aurora-lamp";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-products.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  productsPage: byId("productsPage"),
  inventoryPage: byId("inventoryPage"),
  channelsPage: byId("channelsPage"),
  reviewPage: byId("reviewPage"),
  settingsPage: byId("settingsPage"),
  productsList: byId("productsList"),
  productsDetail: byId("productsDetail"),
  productsDetailBody: byId("productsDetailBody"),
  productsDetailBack: byId("productsDetailBack"),
  productsDetailExpand: byId("productsDetailExpand"),
  productsSearch: byId("productsSearch"),
  inventoryList: byId("inventoryList"),
  channelsList: byId("channelsList"),
  reviewList: byId("reviewList"),
  reviewDetail: byId("reviewDetail"),
  reviewDetailBody: byId("reviewDetailBody"),
  reviewDetailBack: byId("reviewDetailBack"),
  reviewDetailExpand: byId("reviewDetailExpand"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  reviewCount: byId("count-review"),
  stockCount: byId("count-stock"),
  channelCount: byId("count-channel"),
  language: byId("language"),
};

const LIST_BY_VIEW = {
  products: els.productsList,
  review: els.reviewList,
  inventory: els.inventoryList,
  channels: els.channelsList,
};
const DETAIL_BACK_BY_VIEW = { products: els.productsDetailBack, review: els.reviewDetailBack };

export const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((base) => [base.key, base.readLimit])),
  applyPage: (key, rows) => {
    const snapshotKey = { channels: "channel_matrix", review: "review_items" }[key] || key;
    state.snapshot[snapshotKey] = rows;
    state.snapshot.metrics = computeMetrics(
      state.snapshot.products,
      state.snapshot.channel_matrix,
      state.snapshot.inventory,
    );
  },
  render: () => render(),
  label: (key) => t(key),
  onError: (error) => {
    state.pageError = error instanceof Error ? error.message : String(error);
  },
});

function isMobileLayout() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
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

function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

function normalizeLang(lang) {
  const value = String(lang || "auto").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("en")) return "en";
  return "auto";
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

export function enumLabel(value, group = "status") {
  const key = String(value || "");
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function money(value, currency = "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function money2(value, currency = "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function badge(value, group = "status") {
  return `<span class="badge badge-${String(value || "neutral").replaceAll("_", "-")}">${esc(enumLabel(value, group))}</span>`;
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&peek=…]`. A `/record` path always opens the full
// page; `?peek=` drives drawer/split. On a phone every mode becomes a page
// (base-ui.css handles that).
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
  if (!ALL_VIEWS.includes(view) && view !== "settings") view = "overview";
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
// What a row opens: the page for a "page" view, else `?peek=`.
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
  // Mark a detail entry opened from its list so Back/Close/Escape step back
  // to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = PEEK_VIEWS.includes(state.route.view) && !state.route.selectedId;
  state.notice = "";
  if (els.productsSearch) els.productsSearch.value = state.route.view === "products" ? state.route.query : "";
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

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
  state.extra = { products: new Map(), review: new Map() };
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("kelly-products:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

// A record named by the URL but not on the currently loaded page is read on
// its own (records.get by its business id) instead of loading more pages to
// find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.snapshot || !selectedId || !PEEK_VIEWS.includes(view)) return;
  if (recordById(view, selectedId) || state.extra[view].has(selectedId)) return;
  const provider = state.provider;
  if (typeof provider?.getRecord !== "function") {
    state.extra[view].set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra[view].set(selectedId, undefined);
  try {
    const row = await provider.getRecord(view, selectedId);
    state.extra[view].set(selectedId, row || null);
  } catch {
    state.extra[view].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "products"
      ? "#/products"
      : scenario === "inventory"
        ? "#/inventory"
        : scenario === "channels"
          ? "#/channels"
          : scenario === "review"
            ? "#/review"
            : scenario === "detail"
              ? `#/products/${FEATURED_PRODUCT}`
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
  for (const option of els.language.options) option.textContent = languageLabels[option.value] || option.textContent;
  if (els.productsSearch) els.productsSearch.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  els.refresh.title = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

export function products() {
  return state.snapshot?.products || [];
}

export function channels() {
  return state.snapshot?.channel_matrix || [];
}

export function inventory() {
  return state.snapshot?.inventory || [];
}

export function reviewItems() {
  return state.snapshot?.review_items || [];
}

export function productById(productId) {
  return recordById("products", productId);
}

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(view, id) {
  if (!id) return null;
  const rows = state.snapshot?.[SNAPSHOT_KEY[view]] || [];
  const found = rows.find((item) => item[ID_FIELD[view]] === id);
  if (found) return found;
  return state.extra[view]?.get(id) || null;
}

export function channelsForProduct(productId) {
  return channelsFor(channels(), productId);
}

export function inventoryForProduct(productId) {
  return inventoryFor(inventory(), productId);
}

export function reviewForProduct(productId) {
  return reviewFor(reviewItems(), productId);
}

function renderShell() {
  applyI18n();
  const metrics = state.snapshot?.metrics || {};
  if (els.reviewCount)
    els.reviewCount.textContent = String(reviewItems().filter((item) => item.status === "needs_review").length);
  if (els.stockCount) els.stockCount.textContent = String(metrics.low_stock_count || 0);
  if (els.channelCount) els.channelCount.textContent = String(metrics.channel_issue_count || 0);
  els.syncStatus.textContent = !state.snapshot
    ? t("loading")
    : state.settings?.demo
      ? t("demoNote")
      : `${t("generated")} ${date(state.snapshot?.generated_at)}`;
  els.language.value = state.lang;
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = state.settings?.demo ? t("demoNote") : "";
  }
}

export function viewLabel(view) {
  if (view === "products") return t("products");
  if (view === "inventory") return t("inventory");
  if (view === "channels") return t("channels");
  if (view === "review") return t("reviewQueue");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function render() {
  renderShell();
  const ready = Boolean(state.snapshot);
  let { view, selectedId, presentation } = state.route;
  // First-run gate: nothing has been ingested yet. Every route collapses to
  // the overview's own empty message instead of an empty table per view.
  const noSnapshotYet = ready && state.snapshot.warnings?.length && !products().length && view !== "settings";
  if (noSnapshotYet) {
    view = "overview";
    selectedId = "";
    presentation = null;
  }
  const onDetailView = ready && PEEK_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onDetailView && Boolean(selectedId));
  body.toggle("ws-detail-page", onDetailView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onDetailView && presentation === "drawer");
  body.toggle("ws-layout-split", onDetailView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", view === "products" && Boolean(state.route.query));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.productsPage.hidden = !ready || view !== "products";
  els.inventoryPage.hidden = !ready || view !== "inventory";
  els.channelsPage.hidden = !ready || view !== "channels";
  els.reviewPage.hidden = !ready || view !== "review";
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (view === "products") renderProductsView();
  else if (view === "inventory") renderInventoryView();
  else if (view === "channels") renderChannelsView();
  else if (view === "review") renderReviewView();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

// ---- Direct write: record the operator's review decision straight through
// the active provider (Busabase or demo) -- there is no separate
// decisions.json-equivalent bucket, the status/decision-note/decided-at
// fields are written directly onto the review item's own record. Demo mode
// never reaches Busabase; it mutates the in-memory snapshot already
// rendered so ?demo=1 stays fully interactive for screenshots/docs. ----

function showError(error) {
  state.notice = error?.message || String(error);
  render();
}

export async function postDecision(action, itemId) {
  const comment = window.prompt(t("reviewNote"), "");
  if (state.demo) {
    const index = reviewItems().findIndex((item) => item.item_id === itemId);
    if (index !== -1) {
      const items = reviewItems();
      const now = new Date().toISOString();
      items[index] = {
        ...items[index],
        status: statusForVerdict(action, items[index].status),
        decision_note: comment || "",
        decided_at: now,
        updated_at: now,
      };
      if (state.snapshot) {
        state.snapshot.metrics = computeMetrics(products(), channels(), inventory());
      }
    }
    state.notice =
      activeLang() === "zh" ? "决策已记录（演示模式，不会保存）。" : "Decision recorded (demo mode, not saved).";
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    await provider.decideReview(itemId, action, comment || "");
    state.notice = activeLang() === "zh" ? "决策已记录。" : "Decision recorded.";
    await loadState();
  } catch (error) {
    showError(error);
  } finally {
    state.busy = false;
  }
}

// ── Events ─────────────────────────────────────────────────────────────────
pagination.bind(document.body);

for (const [view, listEl] of Object.entries(LIST_BY_VIEW)) {
  if (!DETAIL_MODES[view] || !listEl) continue;
  listEl.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return;
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    const url = recordUrl(row.dataset.id, view);
    // Switching records while a drawer/split is open replaces the entry, so
    // Close still steps back to the list the drawer was opened from.
    if (state.route.peek) {
      history.replaceState(history.state, "", url);
      setRoute();
    } else {
      location.hash = url;
    }
  });
}

for (const view of PEEK_VIEWS) {
  DETAIL_BACK_BY_VIEW[view]?.addEventListener("click", closeDetail);
}

els.reviewDetailBody?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action][data-item]");
  if (button) postDecision(button.dataset.action, button.dataset.item);
});

els.productsSearch?.addEventListener("input", () => {
  replaceRoute(`#/products${routeQuery({}, { ...state.route, view: "products", query: els.productsSearch.value })}`);
});

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", toggleSidebar);
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-products-language", state.lang);
  const url = new URL(window.location.href);
  url.searchParams.set("lang", state.lang);
  history.replaceState(null, "", `${url.pathname}${url.search}${location.hash}`);
  loadState();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (event.target.closest?.("textarea, input")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});

previousRouteWasList = PEEK_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();

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
    els.loadState.hidden = false;
    els.loadState.classList.add("error");
    els.loadState.textContent = error instanceof Error ? error.message : String(error);
  }
}

boot();
