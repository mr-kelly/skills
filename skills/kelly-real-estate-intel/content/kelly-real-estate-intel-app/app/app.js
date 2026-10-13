import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { computeMetrics } from "./js/real-estate-model.js?v=0.1.0";

// Where a record opens, per view (busabase-app-creator references/ui-and-
// validation.md "Choose The Detail Mode"). signals/actions/drafts are all the
// same shape — a review queue worked top to bottom, one item after the next
// — so all three get `split`. `sources` is a handful of facts scanned one at
// a time and returned from, so it gets `drawer`. A `/record` path always
// opens the full page; `?peek=` drives drawer/split. On a phone every mode is
// a page (base-ui.css handles that). Declared once, in config.js
// `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const VIEW_KINDS = { signals: "signal", actions: "action", drafts: "draft" };

export const state = {
  batch: null,
  bootstrap: null,
  provider: null,
  // Prev/Next pager for the Bases that have their own browsed list (signals,
  // actions, drafts). records.list only exposes a forward keyset cursor, so
  // pageCursors[key][i] is the cursor that fetches page i+1. Only
  // neighbouring pages are reachable: one click, one request; there is no
  // "jump to page N" because reaching it would mean reading every page in
  // between (busabase-app-creator references/runtime-and-sdk.md "A full scan
  // in disguise").
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { signals: new Map(), actions: new Map(), drafts: new Map(), sources: new Map() },
  route: parseRoute(),
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-real-estate-intel-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  saving: false,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-real-estate-intel.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
const els = {
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
  needsReviewCount: byId("count-needs-review"),
  approvedCount: byId("count-approved"),
  blockedCount: byId("count-blocked"),
  language: byId("language"),
};

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

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

// ── Routing ──────────────────────────────────────────────────────────────
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

const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row opens: the page for a `page` view, else `?peek=`.
const recordUrl = (id, view = state.route.view) => {
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
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  state.notice = "";
  if (els.search) els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes should
// not each become a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = previousWasList;
  render();
}

function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Data ─────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  closeConnectGate();
  state.batch = data.batch;
  state.bootstrap = data;
  state.extra = { signals: new Map(), actions: new Map(), drafts: new Map(), sources: new Map() };
  state.totals = data.totals || {};
  state.pageCursors = {};
  state.currentPage = {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  window.dispatchEvent(new CustomEvent("kelly-real-estate-intel:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

function pageCount(key) {
  if (!state.pageCursors[key]) return 1;
  const total = state.totals[key];
  return total == null ? Math.max(1, state.currentPage[key] || 1) : Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — more pages exist, or the
// user is on a later page. Anything summed from loaded rows must say so.
function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

// Replaces the displayed page for `key` with a NEIGHBOURING page: exactly
// one request per click, using a cursor already learned. Never appends, and
// never loops to reach an arbitrary page.
async function goToPage(key, targetPage) {
  if (state.pageLoading[key]) return;
  const cursors = state.pageCursors[key];
  if (!cursors) return;
  const current = state.currentPage[key] || 1;
  if (Math.abs(targetPage - current) !== 1 || targetPage < 1) return;
  if (targetPage > current && !cursors[current]) return; // no next page
  state.pageLoading[key] = true;
  render();
  try {
    const provider = await getProvider();
    const { rows, nextCursor } = await provider.fetchPage(key, cursors[targetPage - 1]);
    state.batch[key] = rows;
    state.batch.metrics = computeMetrics(state.batch);
    cursors[targetPage] = nextCursor;
    state.currentPage[key] = targetPage;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.batch || !selectedId || !RECORD_VIEWS.includes(view)) return;
  if (findItem(view, selectedId) || state.extra[view].has(selectedId)) return;
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
  if (!state.bootstrap?.demo || location.hash) return;
  const scenario = state.bootstrap.demo_scenario || "overview";
  const route =
    scenario === "signals"
      ? "#/signals"
      : scenario === "actions"
        ? "#/actions"
        : scenario === "drafts"
          ? "#/drafts"
          : scenario === "detail"
            ? detailUrl(state.batch?.signals?.[0]?.id || "", "signals")
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels = { auto: activeLang() === "zh" ? "自动" : "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  if (els.search) els.search.placeholder = t("search");
  if (els.refresh) els.refresh.title = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  if (els.detailExpand) els.detailExpand.textContent = t("openFullPage");
  if (els.detailBack) els.detailBack.textContent = t("back");
}

function itemsForView(view) {
  const b = state.batch || {};
  if (view === "signals") return b.signals || [];
  if (view === "actions") return b.actions || [];
  if (view === "drafts") return b.drafts || [];
  if (view === "sources") return b.sources || [];
  return [];
}

function findItem(view, id) {
  return itemsForView(view).find((item) => item.id === id) || state.extra[view]?.get(id) || null;
}

function isConnected() {
  return Boolean(state.batch?.batch_id || state.batch?.signals?.length || state.batch?.actions?.length);
}

function renderShell() {
  applyI18n();
  const metrics = state.batch?.metrics || {};
  els.syncStatus.textContent = !state.batch
    ? t("loading")
    : state.bootstrap?.demo
      ? t("demoModeTitle")
      : state.batch.generated_at
        ? `${t("generated")} ${new Date(state.batch.generated_at).toLocaleString()}`
        : t("empty");
  if (els.needsReviewCount) els.needsReviewCount.textContent = metrics.needs_review ?? 0;
  if (els.approvedCount) els.approvedCount.textContent = metrics.approved ?? 0;
  if (els.blockedCount) els.blockedCount.textContent = metrics.blocked ?? 0;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = isConnected()
      ? `${metrics.needs_review ?? 0} ${t("needsReview")}`
      : t("needsConnection");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "signals") return t("signals");
  if (view === "actions") return t("actions");
  if (view === "drafts") return t("drafts");
  if (view === "sources") return t("sources");
  if (view === "settings") return t("settings");
  return t("overview");
}

function statusBadge(status) {
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function riskBadges(risk = []) {
  return risk.map((entry) => `<span class="badge blocked">${escapeHtml(entry)}</span>`).join(" ");
}

function demoBanner() {
  if (!state.bootstrap?.demo) return "";
  return `<div class="warnings"><div class="info"><strong>${t("demoModeTitle")}</strong><span>${t("demoModeBody")}</span></div></div>`;
}

function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

function itemLabel(item) {
  return item.title || item.label || item.channel || item.id;
}

function itemSummary(item) {
  return item.summary || item.effective_body || item.body || item.coverage || "";
}

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function filteredItems(view) {
  const query = state.route.query.trim().toLowerCase();
  const items = itemsForView(view);
  if (!query) return items;
  return items.filter((item) => matches([itemLabel(item), itemSummary(item), item.status], query));
}

/* ---------- Overview ---------- */
// Three numbers the nav/attention block does not already show (those cover
// needs_review/approved/blocked). Today's per-channel volume answers "how
// much did the agent collect today" instead of repeating "what needs me".
function metricsBand() {
  const b = state.batch || {};
  const scope = (key) => (isPartial(key) ? "+" : "");
  return [
    [t("signals"), `${state.totals.signals ?? (b.signals || []).length}${scope("signals")}`],
    [t("actions"), `${state.totals.actions ?? (b.actions || []).length}${scope("actions")}`],
    [t("drafts"), `${state.totals.drafts ?? (b.drafts || []).length}${scope("drafts")}`],
  ]
    .map(
      ([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`,
    )
    .join("");
}

function overviewRow(view, item) {
  return `
    <a class="due-row" href="${recordUrl(item.id, view)}">
      <span><strong>${escapeHtml(itemLabel(item))}</strong><small>${escapeHtml(itemSummary(item))}</small></span>
      ${statusBadge(item.status)}
    </a>
  `;
}

function renderOverview() {
  const b = state.batch || {};
  document.getElementById("overviewTitle").textContent = t("overview");
  document.getElementById("overviewSummary").textContent = [
    b.vertical || "",
    b.generated_at ? `${t("generated")} ${new Date(b.generated_at).toLocaleString()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (!isConnected()) {
    document.getElementById("overviewMetrics").innerHTML = "";
    document.getElementById("overviewBody").innerHTML =
      `<div class="empty-state"><strong>${t("setupNeeded")}</strong></div>`;
    return;
  }
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  const topSignals = (b.signals || []).slice(0, 4);
  const readyActions = (b.actions || []).filter((item) => item.status === "approved").slice(0, 4);
  const actionsToShow = readyActions.length ? readyActions : (b.actions || []).slice(0, 4);
  document.getElementById("overviewBody").innerHTML = `
    ${demoBanner()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("topSignals")}</h2>
        ${topSignals.map((item) => overviewRow("signals", item)).join("") || `<div class="empty-inline">${t("empty")}</div>`}
      </div>
      <div class="card overview-panel">
        <h2>${t("readyActions")}</h2>
        ${actionsToShow.map((item) => overviewRow("actions", item)).join("") || `<div class="empty-inline">${t("empty")}</div>`}
      </div>
    </section>
  `;
}

/* ---------- Record views: one toolbar row over a full-bleed table ---------- */

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;
const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;

function signalsTable(items) {
  return `
    <table class="ws-table">
      ${tableHead([[t("title")], [t("source")], [t("confidence"), "ws-col-num"], [t("status"), "ws-col-narrow"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(`<span class="strong">${escapeHtml(item.title)}</span>`, item.title)}
              ${cell(escapeHtml(item.source?.name || ""), item.source?.name)}
              ${cell(`${Math.round((item.confidence || 0) * 100)}%`, "", "ws-col-num")}
              ${cell(statusBadge(item.status), "", "ws-col-narrow")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function actionsTable(items) {
  return `
    <table class="ws-table">
      ${tableHead([[t("title")], [t("priority"), "ws-col-narrow"], [t("owner"), "ws-col-narrow"], [t("status"), "ws-col-narrow"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(`<span class="strong">${escapeHtml(item.title)}</span>`, item.title)}
              ${cell(escapeHtml(enumLabel(item.priority, "priority") || item.priority), "", "ws-col-narrow")}
              ${cell(escapeHtml(item.owner || ""), item.owner, "ws-col-narrow")}
              ${cell(statusBadge(item.status), "", "ws-col-narrow")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function draftsTable(items) {
  return `
    <table class="ws-table">
      ${tableHead([[t("title")], [t("channel"), "ws-col-wide"], [t("status"), "ws-col-narrow"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(`<span class="strong">${escapeHtml(item.title)}</span>`, item.title)}
              ${cell(escapeHtml(item.channel || ""), item.channel, "ws-col-wide")}
              ${cell(statusBadge(item.status), "", "ws-col-narrow")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function sourcesTable(items) {
  return `
    <table class="ws-table">
      ${tableHead([[t("label")], [t("coverage"), "ws-col-wide"], [t("freshness"), "ws-col-narrow"], [t("status"), "ws-col-narrow"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(`<span class="strong">${escapeHtml(item.label)}</span>`, item.label)}
              ${cell(escapeHtml(item.coverage || ""), item.coverage, "ws-col-wide")}
              ${cell(escapeHtml(item.freshness || ""), item.freshness, "ws-col-narrow")}
              ${cell(statusBadge(item.status), "", "ws-col-narrow")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

const TABLE_BY_VIEW = { signals: signalsTable, actions: actionsTable, drafts: draftsTable, sources: sourcesTable };

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the total comes from records.count.
function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const loading = Boolean(state.pageLoading[key]);
  return `
    <div class="pager">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current))}</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </div>
  `;
}

function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = viewLabel(view);
  const items = filteredItems(view);
  els.viewCount.textContent = `${items.length}${isPartial(view) ? "+" : ""}`;
  const table = TABLE_BY_VIEW[view](items);
  const empty = emptyState(state.route.query ? t("noMatches") : t("empty"));
  // No demo banner here: a record view is one toolbar row over a full-bleed
  // table, nothing else — the demo state is already in the sidebar's sync
  // status and (once) on Overview.
  els.listPanel.innerHTML = `${items.length ? table : empty}${pagerControl(view)}`;
  renderDetail();
}

/* ---------- Detail panel + decision form ---------- */

// A relation is a business id ("signal-1", "action-2") — resolve it to the
// target's own title. When the target is not on the loaded page, say so
// rather than printing the bare id (busabase-app-creator references/
// ui-and-validation.md "Resource ids never reach the screen").
function linkedSignalLink(id) {
  const target = findItem("signals", id);
  return target
    ? `<a href="${recordUrl(id, "signals")}">${escapeHtml(itemLabel(target))}</a>`
    : `<span class="muted">${t("notLoaded")}</span>`;
}

function linkedActionLink(id) {
  const target = findItem("actions", id);
  return target
    ? `<a href="${recordUrl(id, "actions")}">${escapeHtml(itemLabel(target))}</a>`
    : `<span class="muted">${t("notLoaded")}</span>`;
}

function signalDetailFields(item) {
  return `
    <div class="field"><span>${t("confidence")}</span><p>${Math.round((item.confidence || 0) * 100)}%</p></div>
    <div class="field"><span>${t("detected")}</span><p>${item.detected_at ? new Date(item.detected_at).toLocaleString() : ""}</p></div>
    ${item.source?.url ? `<div class="field"><span>${t("evidence")}</span><a href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.source.name || item.source.url)}</a></div>` : ""}
    ${item.why_it_matters ? `<div class="field"><span>${t("why")}</span><p>${escapeHtml(item.why_it_matters)}</p></div>` : ""}
    ${item.buyer_intent ? `<div class="field"><span>${t("buyerIntent")}</span><p>${escapeHtml(item.buyer_intent)}</p></div>` : ""}
  `;
}

function actionDetailFields(item) {
  return `
    <div class="field"><span>${t("priority")}</span><p>${escapeHtml(enumLabel(item.priority, "priority") || item.priority)}</p></div>
    <div class="field"><span>${t("owner")}</span><p>${escapeHtml(item.owner)}</p></div>
    ${item.reason ? `<div class="field"><span>${t("reason")}</span><p>${escapeHtml(item.reason)}</p></div>` : ""}
    ${(item.linked_signal_ids || []).length ? `<div class="field"><span>${t("linkedSignals")}</span><p>${item.linked_signal_ids.map((id) => linkedSignalLink(id)).join(", ")}</p></div>` : ""}
    ${item.next_step ? `<div class="field"><span>${t("nextStep")}</span><p>${escapeHtml(item.next_step)}</p></div>` : ""}
  `;
}

function draftDetailFields(item) {
  return `
    <div class="field"><span>${t("channel")}</span><p>${escapeHtml(item.channel)}</p></div>
    ${item.linked_action_id ? `<div class="field"><span>${t("linkedAction")}</span><p>${linkedActionLink(item.linked_action_id)}</p></div>` : ""}
    <div class="field"><span>${t("summary")}</span><p>${escapeHtml(item.effective_body)}</p></div>
    <label class="field"><span>${t("editedDraft")}</span><textarea data-edited-body>${escapeHtml(item.edited_body || item.body || "")}</textarea></label>
  `;
}

function sourceDetailFields(item) {
  return `
    <div class="field"><span>${t("freshness")}</span><p>${escapeHtml(item.freshness || "")}</p></div>
    <div class="field"><span>${t("coverage")}</span><p>${escapeHtml(item.coverage || "")}</p></div>
  `;
}

function decisionActions(kind) {
  const disabled = state.saving ? "disabled" : "";
  const buttons = [
    `<button type="button" class="button primary" data-action="approve" ${disabled}>${t("approve")}</button>`,
    `<button type="button" class="button" data-action="request_changes" ${disabled}>${t("requestChanges")}</button>`,
    `<button type="button" class="button danger" data-action="block" ${disabled}>${t("block")}</button>`,
  ];
  if (kind === "draft")
    buttons.push(`<button type="button" class="button" data-action="revise" ${disabled}>${t("revise")}</button>`);
  return buttons.join("");
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = isMobileLayout();
  if (els.detailBack)
    els.detailBack.textContent =
      presentation === "page" || phone ? t("backToList") || t("back") : t("close") || t("back");
  if (els.detailExpand) {
    els.detailExpand.hidden = !selectedId || presentation === "page";
    if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  }
  const bar = els.detailPanel.querySelector(".ws-detail-bar");
  if (bar) bar.hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML =
      DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${t("selectItem")}</div>` : "";
    return;
  }
  const item = findItem(view, selectedId);
  if (!item) {
    const pending = state.extra[view]?.has(selectedId) && state.extra[view].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"));
    return;
  }
  const kind = VIEW_KINDS[view];
  const fields =
    kind === "signal"
      ? signalDetailFields(item)
      : kind === "action"
        ? actionDetailFields(item)
        : kind === "draft"
          ? draftDetailFields(item)
          : sourceDetailFields(item);
  els.detailBody.innerHTML = `
    <header class="detail-head">
      <div class="item-panel-head">
        ${statusBadge(item.status)}
        ${riskBadges(item.risk)}
      </div>
      <h2>${escapeHtml(itemLabel(item))}</h2>
      ${item.summary ? `<p class="muted">${escapeHtml(item.summary)}</p>` : ""}
    </header>
    ${fields}
    ${
      kind
        ? `
      <label class="field"><span>${t("reviewNote")}</span><textarea data-review-note>${escapeHtml(item.decision?.comment || "")}</textarea></label>
      ${noticeBanner()}
      <div class="actions-bar" data-decision-actions>${decisionActions(kind)}</div>
    `
        : ""
    }
  `;
  if (kind) bindDecisionForm(view, kind, item);
}

function bindDecisionForm(view, kind, item) {
  const panel = els.detailBody.querySelector("[data-decision-actions]");
  if (!panel) return;
  panel.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const note = els.detailBody.querySelector("[data-review-note]")?.value || "";
      const editedBody = els.detailBody.querySelector("[data-edited-body]")?.value || "";
      state.saving = true;
      render();
      try {
        const provider = await getProvider();
        const result = await provider.saveDecision({
          kind,
          id: item.id,
          action,
          comment: note,
          edited_body: editedBody,
        });
        if (!result.ok) throw new Error(result.error || t("decisionError"));
        state.saving = false;
        await loadState();
        state.notice = t("decisionSaved");
        render();
      } catch (error) {
        state.saving = false;
        state.notice = error instanceof Error ? error.message : String(error);
        render();
      }
    });
  });
}

/* ---------- Help & Settings ---------- */

function renderSettings() {
  document.getElementById("settingsTitle").textContent = t("settings");
  const b = state.batch || {};
  document.getElementById("settingsBody").innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.bootstrap?.data_provider || "busabase")}</dd>
          <dt>${t("batchId")}</dt><dd>${escapeHtml(b.batch_id || "")}</dd>
          <dt>${t("vertical")}</dt><dd>${escapeHtml(b.vertical || "")}</dd>
          <dt>${t("buyer")}</dt><dd>${escapeHtml(b.buyer || "")}</dd>
          <dt>${t("offer")}</dt><dd>${escapeHtml(b.offer || "")}</dd>
        </dl>
      </section>
    </div>
  `;
}

export function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.batch);
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
  if (onRecordView) renderRecordView();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

function escapeHtml(value) {
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

// ── Events ───────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  const pager = event.target.closest("[data-goto-page]");
  if (pager) {
    const [key, page] = pager.dataset.gotoPage.split(":");
    goToPage(key, Number(page));
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
els.refresh?.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-real-estate-intel-language", state.lang);
  render();
});

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

if (els.search) els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
